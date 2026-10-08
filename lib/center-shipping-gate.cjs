'use strict';

// A empresa ainda não aferiu as caixas e os pesos com cúpulas acondicionadas.
// Estes dados NUNCA devem ser preenchidos automaticamente com dimensões internas
// ou fórmula de peso volumétrico para criar uma cotação cobravel.
const BOX_MEASUREMENTS = Object.freeze({
  P30: Object.freeze({external_cm:null, gross_weight_kg:null, packing_test_approved:false}),
  M45: Object.freeze({external_cm:null, gross_weight_kg:null, packing_test_approved:false}),
  G60: Object.freeze({external_cm:null, gross_weight_kg:null, packing_test_approved:false}),
  GG70:Object.freeze({external_cm:null, gross_weight_kg:null, packing_test_approved:false})
});
function normalizeVerifiedPackages(packaging) {
  if (packaging?.calibration !== false || packaging?.status !== 'approved' ||
      !Array.isArray(packaging.packages) || packaging.packages.length < 1 ||
      packaging.packages.length > 30) {
    return {ready:false,reason:'packaging_not_approved',packages:[]};
  }

  const packs=[];
  for(let i=0;i<packaging.packages.length;i++){
    const original=packaging.packages[i];
    const approved=BOX_MEASUREMENTS[original?.box_id];
    if(!approved || approved.packing_test_approved !== true ||
      !approved.external_cm || !['width','length','height'].every(k=>Number.isFinite(approved.external_cm[k]) && approved.external_cm[k]>=1) ||
      !Number.isFinite(approved.gross_weight_kg) || approved.gross_weight_kg <= 0) {
      return {ready:false,reason:'box_external_measurements_or_weight_missing',
        missing_box_id:String(original?.box_id||'unknown'),packages:[]};
    }
    const d=approved.external_cm;
    if(Object.values(d).some(n=>n>150))return {ready:false,reason:'oversized_box',packages:[]};
    packs.push({
      Weight:approved.gross_weight_kg,
      Length:Math.ceil(d.length),
      Height:Math.ceil(d.height),
      Width:Math.ceil(d.width),
      Diameter:0,
      SKU:'CX-'+String(i+1).padStart(2,'0'),
      Category:'Cupulas para iluminacao',
      isFragile:true,
      Quantity:1,
      ProductName:'Volume Center Cupulas '+(i+1)
    });
  }
  return {ready:true,reason:null,packages:packs};
}
module.exports={ BOX_MEASUREMENTS, normalizeVerifiedPackages };
