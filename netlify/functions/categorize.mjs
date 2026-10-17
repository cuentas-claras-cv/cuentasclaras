// Categoriza un lote de transacciones (máx. ~25) según el formulario del cliente.
// Devuelve, por cada una: categoría, confianza, pregunta (si hay duda) y palabra clave para regla.
import { handler, openaiJSON } from '../lib/shared.mjs';
import { FORMS, categoriesFor, formOf } from '../../public/categories.js';

export default handler(async ({ client, txns }) => {
  if (!Array.isArray(txns) || !txns.length) return { results: [] };
  if (txns.length > 40) throw new Error('Lote demasiado grande');

  const form = formOf(client?.tax_form);
  const cats = categoriesFor(form);
  const list = cats.map(c => `${c.code}: ${c.label} — ${c.hint}`).join('\n');

  const system = `You are an experienced US bookkeeper preparing a small business's books for its CPA (tax form: ${FORMS[form].short}).
Assign each bank transaction exactly ONE category code from this list:
${list}

Return JSON {"results":[{"i":index,"c":"CODE","p":confidence,"q":"question","m":"keyword"}]} with one result per transaction.
- p: honest confidence from 0 to 1.
- q: if p < 0.85, ONE short question IN SPANISH for the business owner that resolves the doubt, mentioning the payee and amount (e.g. "¿El Zelle de $800 a Juan Pérez fue pago a un contratista o algo personal?"). Otherwise "".
- m: stable payee keyword to build a reusable rule: UPPERCASE, no dates, store numbers, cities or card digits (e.g. "PILOT", "LOVES", "ZELLE TO JUAN PEREZ", "PROGRESSIVE"). "" if none.
- Positive amount = money IN; negative = money OUT. Money IN goes to income, TRANSFER, LOAN or OWNER — only use an expense code for money IN when it is clearly a refund from that vendor.
- Transfers between the business's own accounts and credit card payments → TRANSFER.
- Cash withdrawals, Zelle/Venmo/Cash App to individuals, groceries, Walmart, Amazon, restaurants near home and similar mixed-use payees are ambiguous: give low confidence and ask.`;

  const user = `Business: ${String(client?.name || '').slice(0, 100)}. ${String(client?.business_desc || '').slice(0, 300)}
Transactions (i | date | description | amount):
${txns.map(t => `${Number(t.i)} | ${t.d} | ${String(t.desc).slice(0, 150)} | ${Number(t.a)}`).join('\n')}`;

  const out = await openaiJSON(system, user, 4000);
  const valid = new Set(cats.map(c => c.code));

  return {
    results: (Array.isArray(out.results) ? out.results : []).map(r => ({
      i: Number(r.i),
      c: valid.has(r.c) ? r.c : null,
      p: Math.max(0, Math.min(1, Number(r.p) || 0)),
      q: String(r.q || '').slice(0, 300),
      m: String(r.m || '').slice(0, 60),
    })),
  };
});
