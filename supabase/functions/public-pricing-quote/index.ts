
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { estimateBoxCostForItem } from "./box-costs.mjs";

const ORG_ID = "e3cb8002-ebaa-4d3a-acd3-46a678815e7b";
const ALLOWED_ORIGINS = new Set([
  "https://www.centercupulas.com.br",
  "https://centercupulas.com.br",
  "https://center-cupulas-site.vercel.app",
  "https://center-cupulas-site-ri-cos.vercel.app",
  "https://center-cupulas-site-git-main-ri-cos.vercel.app"
]);

type RefPrice = {
  code: string;
  top_cm: number | string;
  bottom_cm: number | string;
  height_cm: number | string;
  historical_price: number | string;
};
type Rules = {
  factory_update_pct: number | string;
  owner_margin_pct: number | string;
  site_cost_pct: number | string;
  square_oval_pct: number | string;
  large_pct: number | string;
  large_threshold_cm: number | string;
  premium_material_pct: number | string;
  discount_threshold: number | string;
  discount_pct: number | string;
  engine_version: string;
};
type Validation = {
  format: string;
  top_cm: number | string;
  bottom_cm: number | string;
  height_cm: number | string;
  material: string;
  quantity: number;
  actual_factory_price: number | string | null;
};

let cache: { refs: RefPrice[]; rules: Rules; validations: Validation[]; packaging: any; expires: number } | null = null;

const n = (v: unknown) => Number(v || 0);
const pct = (v: unknown) => 1 + n(v) / 100;
const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

function cors(origin: string | null) {
  const allowed = origin && (ALLOWED_ORIGINS.has(origin) || origin.startsWith("http://localhost:"));
  return {
    "Access-Control-Allow-Origin": allowed ? origin! : "https://www.centercupulas.com.br",
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: cors(origin) });
}

function mapFormat(format: string) {
  if (["conica", "bell"].includes(format)) return "conica_redonda";
  if (format === "drum") return "cilindrica_redonda";
  if (format === "oval") return "oval";
  if (["piramidal-quadrada", "cubo"].includes(format)) return "quadrada";
  return null;
}

function mapMaterial(material: string) {
  const key = material.toLowerCase();
  if (key === "juta") return "juta";
  if (key === "linho") return "linho";
  return "tecido_comum";
}

function distance(a: any, b: any) {
  let sum = 0;
  for (const k of ["top_cm", "bottom_cm", "height_cm"]) {
    const x = n(a[k]), y = n(b[k]), scale = Math.max(10, y);
    const d = (x - y) / scale;
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function shapeSizePct(rules: Rules, format: string, top: number, bottom: number, height: number) {
  let p = ["quadrada", "oval"].includes(format) ? n(rules.square_oval_pct) : 0;
  if (Math.max(top, bottom, height) > n(rules.large_threshold_cm)) p += n(rules.large_pct);
  return p;
}

function normalizeValidation(v: Validation, rules: Rules) {
  if (!v.actual_factory_price) return null;
  let price = n(v.actual_factory_price);
  const formatPct = shapeSizePct(rules, v.format, n(v.top_cm), n(v.bottom_cm), n(v.height_cm));
  if (formatPct) price /= pct(formatPct);
  if (["linho", "juta"].includes(v.material)) price /= pct(rules.premium_material_pct);
  return price;
}

async function loadData() {
  if (cache && cache.expires > Date.now()) return cache;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const [a, b, c, d] = await Promise.all([
    supabase.from("pricing_reference_prices").select("code,top_cm,bottom_cm,height_cm,historical_price").eq("organization_id", ORG_ID).order("code"),
    supabase.from("pricing_rules").select("*").eq("organization_id", ORG_ID).single(),
    supabase.from("pricing_validations").select("format,top_cm,bottom_cm,height_cm,material,quantity,actual_factory_price").eq("organization_id", ORG_ID),
    supabase.from("packaging_rules").select("*").eq("organization_id", ORG_ID).single()
  ]);
  if (a.error || b.error || c.error || d.error || !b.data || !d.data) {
    throw new Error(a.error?.message || b.error?.message || c.error?.message || "Pricing data unavailable");
  }
  cache = {
    refs: (a.data || []) as RefPrice[],
    rules: b.data as Rules,
    validations: (c.data || []) as Validation[],
    packaging: d.data,
    expires: Date.now() + 5 * 60 * 1000
  };
  return cache;
}

function estimateBaseFactory(refs: RefPrice[], validations: Validation[], rules: Rules, top: number, bottom: number, height: number) {
  const q = { top_cm: top, bottom_cm: bottom, height_cm: height };
  let anchors: any[] = refs.map(r => ({
    kind: "ref",
    top_cm: n(r.top_cm),
    bottom_cm: n(r.bottom_cm),
    height_cm: n(r.height_cm),
    price: n(r.historical_price) * pct(rules.factory_update_pct)
  }));
  for (const v of validations) {
    const normalized = normalizeValidation(v, rules);
    if (normalized) anchors.push({
      kind: "validation",
      top_cm: n(v.top_cm),
      bottom_cm: n(v.bottom_cm),
      height_cm: n(v.height_cm),
      price: normalized
    });
  }
  anchors = anchors.map(a => ({ ...a, d: distance(a, q) })).sort((a, b) => a.d - b.d);
  const exact = anchors.find(a => a.d < 0.000001);
  if (exact) return { price: exact.price, confidence: "high", exact: true };

  const near = anchors.slice(0, 5);
  let numerator = 0, denominator = 0;
  for (const a of near) {
    const w = 1 / (Math.pow(a.d, 2) + 0.0025);
    numerator += a.price * w;
    denominator += w;
  }
  const price = numerator / denominator;
  const d0 = near[0]?.d ?? 1;
  const prices = near.map(x => x.price);
  const spread = Math.max(...prices) - Math.min(...prices);
  const spreadRatio = price ? spread / price : 1;
  const confidence = d0 <= 0.10 && spreadRatio <= 0.35 ? "high" : d0 <= 0.28 && spreadRatio <= 0.65 ? "medium" : "low";
  return { price, confidence, exact: false };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);

  if (origin && !ALLOWED_ORIGINS.has(origin) && !origin.startsWith("http://localhost:")) {
    return json({ error: "origin_not_allowed" }, 403, origin);
  }

  try {
    const body = await req.json();
    const top = Number(body.top);
    const bottom = Number(body.bottom);
    const height = Number(body.height);
    const quantity = Math.max(1, Math.floor(Number(body.quantity || 1)));
    const publicFormat = String(body.format || "");
    const material = mapMaterial(String(body.material || ""));
    const format = mapFormat(publicFormat);

    if (!format) return json({ status: "consult", reason: "format_not_supported" }, 200, origin);
    if (![top, bottom, height].every(v => Number.isFinite(v) && v >= 1 && v <= 150)) {
      return json({ error: "invalid_dimensions" }, 400, origin);
    }
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 500) {
      return json({ error: "invalid_quantity" }, 400, origin);
    }

    const { refs, rules, validations, packaging } = await loadData();
    if (!refs.length) throw new Error("No pricing references");

    const base = estimateBaseFactory(refs, validations, rules, top, bottom, height);
    const formatPct = shapeSizePct(rules, format, top, bottom, height);
    const materialPct = ["linho", "juta"].includes(material) ? n(rules.premium_material_pct) : 0;

    let factory = base.price * pct(formatPct) * pct(materialPct);
    const commercialBase = factory * pct(rules.owner_margin_pct) * pct(rules.site_cost_pct);
    const discountPct = n(rules.discount_pct);
    const listUnit = discountPct < 100 ? commercialBase / (1 - discountPct / 100) : commercialBase;
    const manufacturedSubtotal = round2(round2(listUnit) * quantity);
    const boxBudget = estimateBoxCostForItem({
      format: publicFormat, top, bottom, height, quantity
    }, packaging);
    if (boxBudget.status !== "estimate") {
      return json({ status: "consult", reason: "packaging_cost_needs_review" }, 200, origin);
    }
    const boxCost = n(boxBudget.total_cost_brl);
    const threshold = n(rules.discount_threshold);
    const discountUnlocked = manufacturedSubtotal >= threshold;
    const discountedManufacture = round2(manufacturedSubtotal * (discountUnlocked ? (1-discountPct/100) : 1));
    const subtotal = round2(manufacturedSubtotal + boxCost);
    const total = round2(discountedManufacture + boxCost);
    const unitPrice = round2(total / quantity);

    return json({
      status: "estimate",
      calibration: true,
      engine_version: rules.engine_version,
      confidence: base.confidence,
      exact_reference: base.exact,
      quantity,
      unit_price: round2(unitPrice),
      subtotal_before_discount: round2(subtotal),
      total: round2(total),
      discount: {
        unlocked: discountUnlocked,
        percent: discountPct,
        threshold: round2(threshold),
        amount_to_unlock: round2(Math.max(0, threshold - manufacturedSubtotal))
      },
      note: "Preço das cúpulas com custo de caixa previsto incluído; frete a confirmar com a fábrica."
    }, 200, origin);
  } catch (error) {
    console.error("public-pricing-quote", error);
    return json({ error: "pricing_unavailable" }, 500, origin);
  }
});
