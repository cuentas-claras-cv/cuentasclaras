// Funciones puras (sin red) para leer statements. Se pueden probar con Node.

const NOISE = new Set(['POS', 'DEBIT', 'CREDIT', 'PURCHASE', 'CARD', 'CHECKCARD', 'ACH', 'ONLINE', 'RECURRING',
  'PAYMENT', 'TRANSFER', 'WITHDRAWAL', 'DEPOSIT', 'VISA', 'MC', 'DBT', 'PPD', 'WEB', 'ID', 'CO', 'ENTRY', 'DES', 'INDN', 'TRN', 'PMT']);

/** Normaliza una descripción para comparar reglas: mayúsculas, sin números ni símbolos. */
export function norm(s) {
  return String(s || '').toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[0-9#*]+/g, ' ')
    .replace(/[^A-Z&' ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Propone una palabra clave para regla a partir de la descripción. */
export function guessPattern(desc) {
  const all = norm(desc).split(' ');
  // Pagos a personas: la regla debe incluir el nombre ("ZELLE TO JUAN PEREZ")
  const p2p = all.findIndex(w => ['ZELLE', 'VENMO', 'CASHAPP', 'PAYPAL'].includes(w));
  if (p2p >= 0) return all.slice(p2p, p2p + 4).join(' ');
  const words = all.filter(w => w.length > 1 && !NOISE.has(w));
  return words.slice(0, 2).join(' ');
}

/** "09/12/2026", "9/12/26", "2026-09-12" → "2026-09-12" */
export function toISO(s) {
  s = String(s ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(m[1], m[2], m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) return valid(m[3].length === 2 ? '20' + m[3] : m[3], m[1], m[2]);
  return null;
}
function valid(y, mo, d) {
  const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const dt = new Date(iso + 'T00:00:00Z');
  return !isNaN(dt) && dt.toISOString().slice(0, 10) === iso ? iso : null;
}

/** "$1,234.50" → 1234.5 · "(45.00)" o "-45" o "45.00-" → -45 */
export function num(s) {
  if (s == null) return NaN;
  let t = String(s).trim();
  if (!t) return NaN;
  const neg = /^\(.*\)$/.test(t) || /^-/.test(t) || /-$/.test(t) || /^\$\s*-/.test(t);
  t = t.replace(/[^0-9.]/g, '');
  if (!t) return NaN;
  const n = parseFloat(t);
  return Number.isFinite(n) ? (neg ? -n : n) : NaN;
}

const findCol = (hdr, regexes) => {
  for (const re of regexes) {
    const i = hdr.findIndex(h => re.test(h));
    if (i >= 0) return i;
  }
  return -1;
};

/**
 * Lee filas de un CSV (arreglo de arreglos). Detecta columnas comunes de bancos.
 * Devuelve { txns:[{date,description,amount}], flipped } o null si no reconoce el formato.
 */
export function parseCsvRows(rows) {
  for (let h = 0; h < Math.min(15, rows.length); h++) {
    const hdr = rows[h].map(c => String(c ?? '').toLowerCase().trim());
    const di = findCol(hdr, [/^(transaction |trans\.? |posting |post )?date$/, /fecha/, /date/, /posted/]);
    const desc = findCol(hdr, [/description/, /descripci/, /payee/, /merchant/, /details/, /memo/, /^name$/]);
    const amt = findCol(hdr, [/^amount$/, /^amount\b/, /^monto/, /^importe/]);
    const deb = findCol(hdr, [/debit/, /withdraw/, /retiro/, /cargo/]);
    const cre = findCol(hdr, [/credit/, /deposit/, /dep[oó]sito/, /abono/]);
    if (di < 0 || desc < 0) continue;
    const useAmt = amt >= 0;
    if (!useAmt && (deb < 0 || cre < 0)) continue;

    let txns = [];
    for (const r of rows.slice(h + 1)) {
      const date = toISO(r[di]);
      if (!date) continue;
      let a;
      if (useAmt) a = num(r[amt]);
      else {
        const d = num(r[deb]), c = num(r[cre]);
        a = (Number.isFinite(c) ? Math.abs(c) : 0) - (Number.isFinite(d) ? Math.abs(d) : 0);
      }
      if (!Number.isFinite(a) || a === 0) continue;
      const description = String(r[desc] ?? '').trim().replace(/\s+/g, ' ');
      if (!description) continue;
      txns.push({ date, description, amount: Math.round(a * 100) / 100 });
    }
    if (!txns.length) return null;

    // Algunas tarjetas (ej. Amex) ponen las compras en positivo. Si casi todo es positivo,
    // lo más probable es que los signos estén al revés.
    let flipped = false;
    if (useAmt && txns.length >= 5) {
      const pos = txns.filter(t => t.amount > 0).length;
      if (pos / txns.length > 0.7) {
        txns = txns.map(t => ({ ...t, amount: -t.amount }));
        flipped = true;
      }
    }
    return { txns, flipped };
  }
  return null;
}

/** Divide texto en pedazos de máx. `max` caracteres respetando líneas. */
export function chunkText(text, max = 3000) {
  const lines = String(text).split('\n');
  const chunks = [];
  let cur = '';
  for (const line of lines) {
    if (cur && cur.length + line.length + 1 > max) { chunks.push(cur); cur = ''; }
    cur += (cur ? '\n' : '') + line.slice(0, max);
  }
  if (cur.trim()) chunks.push(cur);
  return chunks;
}

/** Punto de corte cerca de la mitad, en un salto de línea. */
export function splitAtLine(t) {
  const mid = Math.floor(t.length / 2);
  const i = t.indexOf('\n', mid);
  return i > 0 && i < t.length - 1 ? i + 1 : mid;
}

/** Reconstruye líneas de texto de una página de pdf.js (items con transform[4]=x, [5]=y). */
export function itemsToLines(items) {
  const its = items
    .filter(i => i.str && i.str.trim())
    .map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5] }))
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  let cur = null;
  for (const it of its) {
    if (!cur || Math.abs(cur.y - it.y) > 3) { cur = { y: it.y, parts: [] }; lines.push(cur); }
    cur.parts.push(it);
  }
  return lines.map(l => l.parts.sort((a, b) => a.x - b.x).map(p => p.s).join(' ')).join('\n');
}
