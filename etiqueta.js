// Interpreta o texto lido (OCR) de uma etiqueta de envio portuguesa
// e devolve os dados do DESTINATÁRIO. Funciona sem internet nem custos.

const RE_POSTAL = /\b(\d{4})\s*[-–—~_.]\s*(\d{3})\b/;
const RE_DEST = /(destinat|^\s*para\b|entregar\s+a|deliver\s+to|ship\s+to|consignee|recipient|^\s*dest\b|^\s*to\s*:)/i;
const RE_SEND = /(remetente|^\s*rem\b|exped|^\s*de\s*:|^\s*from\b|sender|shipper|origem|devolu|return)/i;
const RE_STREET = /\b(rua|r\.|av\.?|avenida|travessa|tv\.?|trav\.?|largo|lg\.?|estrada|estr\.?|praça|praca|pç\.?|urb\.?|urbaniza|lugar|lug\.?|beco|calçada|calcada|alameda|rotunda|bairro|quinta|zona|parque|edif|bloco|lote|n\.?º|nº|apartado)\b/i;
const RE_PHONE_LINE = /(tel|tlm|telem|phone|móvel|movel|contacto)/i;

function clean(l){ return l.replace(/[|_~«»"“”]/g," ").replace(/\s{2,}/g," ").trim(); }
function title(t){
  const small = new Set(["de","da","do","das","dos","e"]);
  return t.toLowerCase().replace(/[^\p{L}\s'-]/gu," ").replace(/\s{2,}/g," ").trim()
    .split(" ").map((w,i)=> i && small.has(w) ? w : w.charAt(0).toUpperCase()+w.slice(1)).join(" ");
}
function afterColon(l){ const i=l.indexOf(":"); return i>=0 ? l.slice(i+1).trim() : ""; }
function findPhone(lines){
  for(const l of lines){
    const d = l.replace(/[\s.()-]/g,"");
    const m = d.match(/(?:\+?351|00351)?(9[1236]\d{7}|2\d{8})(?!\d)/);
    if(m) return m[1];
  }
  return "";
}
function isNoise(l){
  const letters = (l.match(/\p{L}/gu)||[]).length;
  return letters < 3 || RE_PHONE_LINE.test(l) || /^[\d\s\W]+$/.test(l);
}

export function parseLabel(text){
  const lines = String(text||"").split(/\r?\n/).map(clean).filter(l=>l.length>1);
  if(!lines.length) return null;

  const postIdx = lines.map((l,i)=>RE_POSTAL.test(l)?i:-1).filter(i=>i>=0);
  const destIdx = lines.findIndex(l=>RE_DEST.test(l));
  const sendIdx = lines.findIndex(l=>RE_SEND.test(l));

  // escolher a linha do código postal do destinatário
  let p = -1;
  if(destIdx>=0) p = postIdx.find(i=>i>=destIdx) ?? -1;
  if(p<0 && sendIdx>=0){
    const sendEnd = postIdx.find(i=>i>=sendIdx);
    p = postIdx.find(i=>i!==sendEnd && !(i>sendIdx && i<=(sendEnd??-1))) ?? -1;
  }
  if(p<0 && postIdx.length) p = postIdx[postIdx.length-1];

  // número de seguimento
  const all = lines.join(" ");
  const tr = all.match(/\b([A-Z]{2}\s?\d{9}\s?[A-Z]{2})\b/) || all.match(/\b(\d{12,22})\b/);
  const tracking = tr ? tr[1].replace(/\s/g,"") : "";

  if(p<0){
    // sem código postal: tentar ao menos uma rua
    const st = lines.find(l=>RE_STREET.test(l));
    if(!st) return null;
    return {name:"", address:st, postal:"", city:"", phone:findPhone(lines), tracking};
  }

  const pm = lines[p].match(RE_POSTAL);
  const postal = `${pm[1]}-${pm[2]}`;
  const city = title(lines[p].slice(lines[p].indexOf(pm[0])+pm[0].length));

  // bloco entre o início (palavra-chave ou fim do remetente) e o código postal
  let start = Math.max(0, p-4);
  if(destIdx>=0 && destIdx<p) start = destIdx+1;
  else if(sendIdx>=0 && sendIdx<p){
    const sEnd = postIdx.find(i=>i>=sendIdx);
    if(sEnd!=null && sEnd<p) start = Math.max(start, sEnd+1);
  }
  let block = lines.slice(start, p).filter(l=>!isNoise(l) && !RE_SEND.test(l) && !RE_DEST.test(l));
  // a rua pode vir na mesma linha antes do código postal
  const before = lines[p].slice(0, lines[p].indexOf(pm[0])).trim();
  if(before.length>3) block.push(before);
  block = block.slice(-3);

  let name = destIdx>=0 && destIdx<p ? afterColon(lines[destIdx]) : "";
  let address = "";
  if(name){ address = block.join(", "); }
  else if(block.length>=2){
    // o nome é a primeira linha que não parece rua
    const si = block.findIndex(l=>RE_STREET.test(l) || /\d/.test(l));
    if(si>0){ name = block.slice(0,si).join(" "); address = block.slice(si).join(", "); }
    else { name = block[0]; address = block.slice(1).join(", "); }
  } else if(block.length===1){
    if(RE_STREET.test(block[0]) || /\d/.test(block[0])) address = block[0]; else name = block[0];
  }

  // telefone: primeiro perto do destinatário, depois no resto
  const near = lines.slice(Math.max(0,start-1), Math.min(lines.length, p+4));
  const phone = findPhone(near) || (sendIdx<0 ? findPhone(lines) : "");

  return {name: title(name).slice(0,60), address: address.replace(/\s{2,}/g," ").slice(0,120), postal, city, phone, tracking};
}
