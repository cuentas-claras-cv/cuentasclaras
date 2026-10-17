// Pruebas sin red: node tests/run.mjs
import assert from 'node:assert/strict';
import { norm, guessPattern, toISO, num, parseCsvRows, chunkText, splitAtLine, itemsToLines } from '../public/parsers.js';
import { FORMS, CATEGORIES, categoriesFor, lineFor, catLabel } from '../public/categories.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('✔', name); };

t('norm', () => {
  assert.equal(norm('POS PURCHASE PILOT #1234 ORLANDO FL 09/12'), 'POS PURCHASE PILOT ORLANDO FL');
  assert.equal(norm("Love's Travel*Stop 445"), "LOVE'S TRAVEL STOP");
  assert.equal(norm('Depósito Café'), 'DEPOSITO CAFE');
});

t('guessPattern', () => {
  assert.equal(guessPattern('POS DEBIT PILOT 00012 ORLANDO FL'), 'PILOT ORLANDO');
  assert.equal(guessPattern('ZELLE TO JUAN PEREZ 8823'), 'ZELLE TO JUAN PEREZ');
  assert.equal(guessPattern('ONLINE ZELLE FROM MARIA LOPEZ'), 'ZELLE FROM MARIA LOPEZ');
});

t('toISO', () => {
  assert.equal(toISO('09/12/2026'), '2026-09-12');
  assert.equal(toISO('9/1/25'), '2025-09-01');
  assert.equal(toISO('2026-01-05'), '2026-01-05');
  assert.equal(toISO('02/30/2026'), null);
  assert.equal(toISO('Date'), null);
});

t('num', () => {
  assert.equal(num('$1,234.50'), 1234.5);
  assert.equal(num('(45.00)'), -45);
  assert.equal(num('-12.3'), -12.3);
  assert.equal(num('45.00-'), -45);
  assert.ok(Number.isNaN(num('')));
});

t('CSV estilo Chase (Amount con signo)', () => {
  const rows = [
    ['Details', 'Posting Date', 'Description', 'Amount', 'Type', 'Balance'],
    ['DEBIT', '09/02/2026', 'PILOT 00123 ORLANDO FL', '-245.10', 'DEBIT_CARD', '1000'],
    ['CREDIT', '09/03/2026', 'TQL PAYMENT', '3200.00', 'ACH_CREDIT', '4200'],
    ['DEBIT', '09/04/2026', 'PROGRESSIVE INS', '-890.00', 'ACH_DEBIT', '3310'],
  ];
  const r = parseCsvRows(rows);
  assert.equal(r.txns.length, 3);
  assert.deepEqual(r.txns[0], { date: '2026-09-02', description: 'PILOT 00123 ORLANDO FL', amount: -245.1 });
  assert.equal(r.flipped, false);
});

t('CSV con columnas Debit/Credit y filas basura arriba', () => {
  const rows = [
    ['Bank of Somewhere'], ['Account ending 1234'], [],
    ['Date', 'Description', 'Debit', 'Credit', 'Balance'],
    ['09/05/2026', 'LOVES #445', '120.50', '', '900'],
    ['09/06/2026', 'DEPOSIT', '', '1,500.00', '2400'],
  ].filter(r => r.length);
  const r = parseCsvRows(rows);
  assert.equal(r.txns.length, 2);
  assert.equal(r.txns[0].amount, -120.5);
  assert.equal(r.txns[1].amount, 1500);
});

t('CSV de tarjeta con compras positivas → invierte signos', () => {
  const rows = [['Date', 'Description', 'Amount']];
  for (let i = 1; i <= 9; i++) rows.push([`09/0${i}/2026`, `SHELL ${i}`, '50.00']);
  rows.push(['09/10/2026', 'PAYMENT THANK YOU', '-450.00']);
  const r = parseCsvRows(rows);
  assert.equal(r.flipped, true);
  assert.equal(r.txns[0].amount, -50);
  assert.equal(r.txns[9].amount, 450);
});

t('CSV irreconocible → null (va a la IA)', () => {
  assert.equal(parseCsvRows([['foo', 'bar'], ['1', '2']]), null);
});

t('chunkText / splitAtLine', () => {
  const text = Array.from({ length: 300 }, (_, i) => `line ${i} ${'x'.repeat(30)}`).join('\n');
  const chunks = chunkText(text, 3000);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(c => c.length <= 3000));
  assert.equal(chunks.join('\n'), text);
  const cut = splitAtLine(text);
  assert.equal(text[cut - 1], '\n');
});

t('itemsToLines (pdf.js)', () => {
  const it = (s, x, y) => ({ str: s, transform: [1, 0, 0, 1, x, y] });
  const out = itemsToLines([it('-245.10', 400, 700), it('09/02', 10, 700.5), it('PILOT', 60, 701), it('09/03', 10, 680), it('TQL', 60, 680), it('3,200.00', 400, 680)]);
  assert.equal(out, '09/02 PILOT -245.10\n09/03 TQL 3,200.00');
});

t('categorías: todas las aplicables tienen línea en cada formulario', () => {
  for (const f of Object.keys(FORMS)) {
    const cats = categoriesFor(f);
    assert.ok(cats.length > 25, f);
    for (const c of cats) assert.ok(lineFor(f, c.code)?.label, `${f} ${c.code}`);
  }
});

t('categorías: exclusiones por formulario', () => {
  const codes = f => categoriesFor(f).map(c => c.code);
  assert.ok(!codes('schedule_c').includes('OFFICER_COMP'));
  assert.ok(!codes('schedule_c').includes('GUARANTEED'));
  assert.ok(codes('1120s').includes('OFFICER_COMP'));
  assert.ok(!codes('1120s').includes('GUARANTEED'));
  assert.ok(codes('1065').includes('GUARANTEED'));
  assert.ok(!codes('1065').includes('OFFICER_COMP'));
});

t('categorías: líneas clave', () => {
  assert.match(lineFor('schedule_c', 'FUEL').label, /Línea 9/);
  assert.match(lineFor('schedule_c', 'SOFTWARE').label, /27a/);
  assert.match(lineFor('1120s', 'FUEL').label, /Otras deducciones/);
  assert.match(lineFor('1120', 'OFFICER_COMP').label, /Línea 12/);
  assert.equal(lineFor('1065', 'TRANSFER').label, 'No va al tax return');
  assert.equal(catLabel('OWNER', '1120s'), 'Distribuciones/aportes de accionistas');
  assert.equal(new Set(CATEGORIES.map(c => c.code)).size, CATEGORIES.length);
});

// --- Funciones Netlify con fetch simulado ---------------------------------
process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon';
process.env.OPENAI_API_KEY = 'sk-test';
let openaiReply = {};
let lastOpenAIBody = null;
globalThis.fetch = async (url, opts) => {
  if (String(url).includes('/auth/v1/user')) {
    const ok = opts.headers.Authorization === 'Bearer good';
    return new Response(JSON.stringify(ok ? { id: 'u1' } : {}), { status: ok ? 200 : 401 });
  }
  lastOpenAIBody = JSON.parse(opts.body);
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(openaiReply) } }] }), { status: 200 });
};
const call = async (mod, body, token = 'good') => {
  const fn = (await import(`../netlify/functions/${mod}.mjs`)).default;
  const res = await fn(new Request('http://x', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};

const asyncTests = async () => {
  let r = await call('categorize', { client: { tax_form: '1120s' }, txns: [{ i: 0, d: '2026-01-01', desc: 'X', a: -1 }] }, 'bad');
  assert.equal(r.status, 401); n++; console.log('✔ funciones rechazan tokens inválidos');

  openaiReply = { account: 'Chase ...1234', rows: [['2026-09-02', 'PILOT', -245.1], ['2026-09-03', 'TOTAL', 'abc'], ['bad', 'x', 5]] };
  r = await call('parse-statement', { text: '09/02 PILOT -245.10', header: 'Statement', yearHint: 2026 });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.rows, [['2026-09-02', 'PILOT', -245.1]]);
  n++; console.log('✔ parse-statement limpia filas inválidas');

  openaiReply = { results: [{ i: 0, c: 'FUEL', p: 0.97, q: '', m: 'PILOT' }, { i: 1, c: 'OFFICER_COMP', p: 0.9, q: '', m: '' }, { i: 2, c: 'NOPE', p: 2, q: '¿?', m: '' }] };
  r = await call('categorize', { client: { tax_form: 'schedule_c', name: 'SGS' }, txns: [{ i: 0, d: '2026-09-02', desc: 'PILOT', a: -245.1 }, { i: 1, d: '2026-09-02', desc: 'PAYROLL', a: -1000 }, { i: 2, d: '2026-09-02', desc: 'Z', a: -5 }] });
  assert.equal(r.body.results[0].c, 'FUEL');
  assert.equal(r.body.results[1].c, null, 'OFFICER_COMP no aplica a Schedule C');
  assert.equal(r.body.results[2].c, null);
  assert.equal(r.body.results[2].p, 1);
  assert.match(lastOpenAIBody.messages[0].content, /FUEL: Combustible/);
  assert.doesNotMatch(lastOpenAIBody.messages[0].content, /OFFICER_COMP/);
  n++; console.log('✔ categorize valida códigos según el formulario');

  openaiReply = { action: 'categorize', category_code: 'OWNER', remember: false, pattern: 'WALMART', reply: 'Listo, personal.' };
  r = await call('chat', { message: 'eso fue personal', client: { tax_form: '1065' }, current: { descripcion: 'WALMART' }, summary: {} });
  assert.deepEqual(r.body, { action: 'categorize', category_code: 'OWNER', remember: false, pattern: 'WALMART', reply: 'Listo, personal.' });
  openaiReply = { action: 'categorize', category_code: 'INVENTADO', reply: 'x' };
  r = await call('chat', { message: 'x', client: { tax_form: '1065' } });
  assert.equal(r.body.action, 'reply');
  n++; console.log('✔ chat interpreta respuestas y descarta categorías inventadas');

  console.log(`\n${n} pruebas OK`);
};
await asyncTests();
