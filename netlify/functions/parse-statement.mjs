// Extrae transacciones del texto de un statement (PDF o CSV raro).
// El navegador manda el texto en pedazos pequeños para no pasar el límite de tiempo de Netlify.
import { handler, openaiJSON } from '../lib/shared.mjs';

const SYSTEM = `You extract transactions from US bank or credit card statement text.
Return JSON: {"account":"bank name + account type + last 4 digits if visible, else empty string","rows":[["YYYY-MM-DD","description",amount], ...]}

Rules:
- Extract ONLY from the section "TEXT TO EXTRACT". The header is context (bank, period, year).
- Include every individual transaction: deposits, credits, withdrawals, debit card purchases, checks, ACH, Zelle, wires, fees, interest, payments, refunds.
- Do NOT include balances, beginning/ending balance, totals, subtotals, summaries, daily balance tables, or rewards summaries.
- amount sign is from the account holder's view: money LEAVING (purchases, withdrawals, checks, fees, debits, card charges) is NEGATIVE; money COMING IN (deposits, credits, refunds, payments received on a credit card) is POSITIVE.
- Dates: infer the year from the statement period; handle periods crossing Dec→Jan correctly.
- description: keep merchant/payee and check number; drop long reference/trace numbers; max 100 characters.
- amount: plain number, no $ or commas.
- If there are no transactions, return {"account":"","rows":[]}.`;

export default handler(async ({ text, header, yearHint }) => {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Texto vacío');
  if (text.length > 12000) throw new Error('Pedazo de texto demasiado grande');

  const user = `HEADER (context only):\n${String(header || '').slice(0, 1500)}\n\nYEAR HINT: ${yearHint || 'unknown'}\n\nTEXT TO EXTRACT:\n${text}`;
  const out = await openaiJSON(SYSTEM, user, 6000);

  const rows = (Array.isArray(out.rows) ? out.rows : [])
    .filter(r => Array.isArray(r) && r.length >= 3)
    .map(r => [String(r[0]).slice(0, 10), String(r[1] ?? '').slice(0, 200), Number(r[2])])
    .filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r[0]) && Number.isFinite(r[2]) && r[2] !== 0);

  return { account: String(out.account || '').slice(0, 100), rows };
});
