import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const ALLOWED_ORIGINS = new Set([
  "https://www.centercupulas.com.br",
  "https://centercupulas.com.br",
]);

const ALLOWED_EVENTS = new Set([
  "page_view",
  "whatsapp_click",
  "configurator_submit",
  "contact_click",
  "pricing_estimate_view",
  "configurator_started",
  "configurator_step_completed",
  "cart_add",
  "cart_view",
  "shipping_option_selected",
  "checkout_attempt",
  "checkout_error",
  "cart_checkout_started",
  "cart_checkout_submitted",
]);

function cors(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://www.centercupulas.com.br";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(data: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function clean(value: unknown, max = 200) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : null;
}

function cleanLower(value: unknown, max = 120) {
  const text = clean(value, max);
  return text ? text.toLowerCase() : null;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: "origin_not_allowed" }, 403, origin);
    return new Response(null, { status: 204, headers: cors(origin) });
  }

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: "origin_not_allowed" }, 403, origin);

  const length = Number(req.headers.get("content-length") || 0);
  if (length > 16_384) return json({ error: "payload_too_large" }, 413, origin);

  try {
    const body = await req.json();
    const eventType = cleanLower(body.event_type, 80);
    const eventId = cleanLower(body.event_id, 96);
    const leadRef = clean(body.lead_ref, 32)?.toUpperCase() || null;

    if (!eventType || !ALLOWED_EVENTS.has(eventType)) return json({ error: "invalid_event_type" }, 400, origin);
    if (!eventId || !/^cc-[a-z0-9-]{5,90}$/.test(eventId)) return json({ error: "invalid_event_id" }, 400, origin);
    if (leadRef && !/^CC-[A-Z0-9]{8}$/.test(leadRef)) return json({ error: "invalid_lead_ref" }, 400, origin);

    const { data: org, error: orgError } = await admin
      .from("organizations")
      .select("id")
      .eq("slug", "center-cupulas")
      .eq("status", "active")
      .single();

    if (orgError || !org?.id) return json({ error: "organization_unavailable" }, 503, origin);

    const source = cleanLower(body.source, 120) || "direct";
    const medium = cleanLower(body.medium, 120) || "none";
    const occurredAt = clean(body.occurred_at, 80);
    const timestamp = occurredAt && !Number.isNaN(Date.parse(occurredAt))
      ? new Date(occurredAt).toISOString()
      : new Date().toISOString();

    const metadataInput = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
      ? body.metadata
      : {};

    const metadata = {
      has_google_click_id: Boolean(metadataInput.has_google_click_id),
      has_meta_click_id: Boolean(metadataInput.has_meta_click_id),
      cta_text: clean(metadataInput.cta_text, 120),
      page_title: clean(metadataInput.page_title, 180),
    };

    const row = {
      organization_id: org.id,
      event_id: eventId,
      session_id: cleanLower(body.session_id, 96),
      lead_ref: leadRef,
      event_type: eventType,
      page: clean(body.page, 300),
      placement: cleanLower(body.placement, 120),
      source,
      medium,
      campaign: clean(body.campaign, 180),
      content: clean(body.content, 180),
      term: clean(body.term, 180),
      referrer_host: cleanLower(body.referrer_host, 180),
      landing_page: clean(body.landing_page, 500),
      metadata,
      occurred_at: timestamp,
    };

    const { error: insertError } = await admin
      .from("crm_web_events")
      .upsert(row, { onConflict: "organization_id,event_id", ignoreDuplicates: true });

    if (insertError) throw insertError;

    const channels = ["website"];
    if (source === "google" && ["cpc", "paid", "ppc"].includes(medium)) channels.push("ads");
    if (["google", "bing"].includes(source) && medium === "organic") channels.push("seo");

    for (const channel of channels) {
      await admin.from("crm_channel_connections").upsert({
        organization_id: org.id,
        channel,
        status: "connected",
        capture_enabled: true,
        send_enabled: false,
        last_event_at: timestamp,
        last_error: null,
        metadata: {
          capture: channel === "website" ? "center-web-event" : "center-web-event attribution",
          verified_at: timestamp,
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: "organization_id,channel" });
    }

    return json({ ok: true, event_id: eventId, lead_ref: leadRef }, 200, origin);
  } catch (error) {
    console.error("CENTER_WEB_EVENT", error);
    return json({ error: "internal_error" }, 500, origin);
  }
});
