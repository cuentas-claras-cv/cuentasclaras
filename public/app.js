// =====================================================================
// CuentaClara — app principal
// =====================================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { FORMS, categoriesFor, catByCode, catLabel, lineFor } from './categories.js';
import { norm, guessPattern, parseCsvRows, chunkText, splitAtLine, itemsToLines } from './parsers.js';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const AUTO_CONFIDENCE = 0.85;   // por encima de esto la IA categoriza sin preguntar
const AI_BATCH = 25;            // transacciones por llamada a la IA
const CHUNK_CHARS = 3000;       // tamaño de cada pedazo de PDF enviado a la IA

const state = {
  user: null, clients: [], client: null,
  txns: [], rules: [], statements: [],
  queue: [], current: null, busy: false, allDoneShown: false, skipped: new Set(),
};

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = n => Math.round(n * 100) / 100;
const dirOf = a => (a < 0 ? 'out' : 'in');
const form = () => state.client?.tax_form;
const labelFor = code => catLabel(code, form());
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin storage */ } },
};

async function sha(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

async function pool(tasks, n) {
  let i = 0;
  const run = async () => { while (i < tasks.length) { const t = tasks[i++]; await t(); } };
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, run));
}

async function callFn(name, body) {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch(`/.netlify/functions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error del servidor (${r.status})`);
  return j;
}

function setBusy(b, text) {
  state.busy = b;
  $('#sendBtn').disabled = b;
  $('#attachBtn').disabled = b;
  $('#busy').classList.toggle('d-none', !b);
  if (text) $('#busy').lastChild.textContent = ' ' + text;
}

const clientCtx = () => ({ name: state.client.name, business_desc: state.client.business_desc, tax_form: state.client.tax_form });

// ---------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------
function addMsg(role, html) {
  const d = document.createElement('div');
  d.className = `msg ${role}`;
  d.innerHTML = `<div class="bubble">${html}</div>`;
  $('#messages').appendChild(d);
  scrollChat();
  return d;
}
function setMsg(el, html) { el.querySelector('.bubble').innerHTML = html; scrollChat(); }
function scrollChat() { const m = $('#messages'); m.scrollTop = m.scrollHeight; }

// ---------------------------------------------------------------------
// Sesión
// ---------------------------------------------------------------------
async function init() {
  bindStatic();
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) start(session.user); else showAuth();
  sb.auth.onAuthStateChange((event, s) => {
    if (event === 'SIGNED_IN' && s?.user && !state.user) start(s.user);
    if (event === 'SIGNED_OUT') { state.user = null; showAuth(); }
  });
}

function showAuth() {
  $('#authView').classList.remove('d-none');
  $('#appView').classList.add('d-none');
}

async function start(user) {
  state.user = user;
  $('#authView').classList.add('d-none');
  $('#appView').classList.remove('d-none');
  $('#userEmail').textContent = user.email;
  await loadClients();
}

// ---------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------
async function loadClients(selectId) {
  const { data, error } = await sb.from('clients').select('*').order('name');
  if (error) return addMsg('bot', '❌ ' + esc(error.message));
  state.clients = data;
  const sel = $('#clientSelect');
  sel.innerHTML = data.length
    ? data.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')
    : '<option value="">— Sin clientes —</option>';
  const pick = data.find(c => c.id === (selectId || store.get('lastClient'))) || data[0];
  if (pick) { sel.value = pick.id; await selectClient(pick.id); }
  else {
    state.client = null;
    $('#messages').innerHTML = '';
    $('#clientForm').textContent = '';
    addMsg('bot', '👋 Bienvenido a <b>CuentaClara</b>. Empieza creando tu primer cliente con <b>+ Cliente</b>.');
    openClientModal();
  }
}

async function fetchAllTxns(clientId) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('transactions').select('*').eq('client_id', clientId)
      .order('txn_date').order('id').range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out.map(t => ({ ...t, amount: Number(t.amount), confidence: t.confidence == null ? null : Number(t.confidence) }));
}

async function selectClient(id) {
  state.client = state.clients.find(c => c.id === id);
  if (!state.client) return;
  store.set('lastClient', id);
  state.current = null;
  state.allDoneShown = false;
  state.skipped = new Set();
  $('#messages').innerHTML = '';
  $('#clientForm').textContent = FORMS[state.client.tax_form].short + (state.client.tax_year ? ` · ${state.client.tax_year}` : '');

  setBusy(true, 'Cargando…');
  try {
    const [txns, rules, sts] = await Promise.all([
      fetchAllTxns(id),
      sb.from('category_rules').select('*').eq('client_id', id).order('pattern'),
      sb.from('statements').select('*').eq('client_id', id).order('created_at', { ascending: false }),
    ]);
    if (rules.error) throw rules.error;
    if (sts.error) throw sts.error;
    state.txns = txns; state.rules = rules.data; state.statements = sts.data;
  } catch (e) {
    setBusy(false);
    return addMsg('bot', '❌ No pude cargar el cliente: ' + esc(e.message));
  }

  addMsg('bot', `Trabajando con <b>${esc(state.client.name)}</b> (${esc(FORMS[state.client.tax_form].label)}).<br>` +
    (state.txns.length
      ? `Hay <b>${state.txns.length}</b> transacciones cargadas. Puedes subir más statements con el 📎 o arrastrándolos aquí.`
      : 'Sube los statements del banco o tarjeta (PDF o CSV) con el 📎 o arrástralos aquí.'));

  // Transacciones que quedaron sin procesar (ej. se cerró la página a mitad)
  const leftover = state.txns.filter(t => t.status === 'new');
  if (leftover.length) {
    const el = addMsg('bot', `Retomando ${leftover.length} transacciones sin categorizar…`);
    try { const r = await categorizeTxns(leftover, el); setMsg(el, resultLine(r)); }
    catch (e) { setMsg(el, '❌ ' + esc(e.message)); }
  }
  setBusy(false);
  renderAll();
  askNext();
}

function openClientModal() {
  const f = $('#clientNewForm');
  f.reset();
  f.tax_form.innerHTML = Object.entries(FORMS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('');
  f.tax_year.value = new Date().getFullYear() - 1;
  bootstrap.Modal.getOrCreateInstance('#clientModal').show();
}

async function createClient_(e) {
  e.preventDefault();
  const f = e.target;
  const row = {
    name: f.name.value.trim(),
    business_desc: f.business_desc.value.trim() || null,
    tax_form: f.tax_form.value,
    tax_year: f.tax_year.value ? Number(f.tax_year.value) : null,
  };
  const { data, error } = await sb.from('clients').insert(row).select().single();
  if (error) return alert(error.message);
  bootstrap.Modal.getOrCreateInstance('#clientModal').hide();
  await loadClients(data.id);
}

// ---------------------------------------------------------------------
// Subir statements
// ---------------------------------------------------------------------
async function handleFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  if (!state.client) return addMsg('bot', 'Primero crea o selecciona un cliente.');
  if (state.busy) return addMsg('bot', 'Espera a que termine el proceso actual.');
  setBusy(true, 'Procesando archivos…');
  for (const f of files) {
    try { await processFile(f); }
    catch (e) { addMsg('bot', `❌ No pude procesar <b>${esc(f.name)}</b>: ${esc(e.message)}`); }
  }
  setBusy(false);
  state.current = null;
  state.allDoneShown = false;
  renderAll();
  askNext();
}

async function processFile(file) {
  const el = addMsg('bot', `Leyendo <b>${esc(file.name)}</b>…`);
  const ext = file.name.toLowerCase().split('.').pop();
  let parsed = [], account = '', note = '';

  if (ext === 'csv' || file.type === 'text/csv') {
    const text = await file.text();
    const rows = window.Papa.parse(text.trim(), { skipEmptyLines: true }).data;
    const local = parseCsvRows(rows);
    if (local) {
      parsed = local.txns;
      if (local.flipped) note = '<br>⚠ Casi todos los montos venían positivos (típico de tarjetas), así que invertí los signos: compras = salidas.';
    } else {
      const r = await aiParse(chunkText(text, CHUNK_CHARS), text.slice(0, 1500), el, file.name);
      parsed = r.txns; account = r.account;
    }
  } else if (ext === 'pdf' || file.type === 'application/pdf') {
    const pages = await pdfPages(file);
    const all = pages.join('\n');
    if (all.replace(/\s/g, '').length < 50) throw new Error('el PDF parece escaneado (no tiene texto). Descarga el statement original del banco o el CSV.');
    const r = await aiParse(chunkText(all, CHUNK_CHARS), pages[0].slice(0, 1500), el, file.name);
    parsed = r.txns; account = r.account;
  } else {
    throw new Error('formato no soportado. Usa PDF o CSV.');
  }

  parsed = parsed.filter(t => /^\d{4}-\d{2}-\d{2}$/.test(t.date) && Number.isFinite(t.amount) && t.amount !== 0 && t.description);
  if (!parsed.length) throw new Error('no encontré transacciones en el archivo.');

  const { data: st, error: e1 } = await sb.from('statements')
    .insert({ client_id: state.client.id, file_name: file.name, account_name: account || null }).select().single();
  if (e1) throw e1;

  // Hash por transacción para no duplicar si se sube el mismo statement dos veces
  const seen = {};
  const rows = [];
  for (const t of parsed) {
    const base = `${t.date}|${round2(t.amount).toFixed(2)}|${norm(t.description)}`;
    seen[base] = (seen[base] || 0) + 1;
    rows.push({
      client_id: state.client.id, statement_id: st.id, txn_date: t.date,
      description: t.description.slice(0, 300), amount: round2(t.amount),
      status: 'new', hash: await sha(`${base}|${seen[base]}`),
    });
  }

  const inserted = [];
  for (let i = 0; i < rows.length; i += 500) {
    const { data, error } = await sb.from('transactions')
      .upsert(rows.slice(i, i + 500), { onConflict: 'client_id,hash', ignoreDuplicates: true }).select();
    if (error) throw error;
    inserted.push(...data.map(t => ({ ...t, amount: Number(t.amount) })));
  }
  await sb.from('statements').update({ txn_count: inserted.length }).eq('id', st.id);
  state.statements.unshift({ ...st, txn_count: inserted.length });
  state.txns.push(...inserted);

  const dup = rows.length - inserted.length;
  const ins = parsed.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const outs = parsed.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0);
  const header = `📄 <b>${esc(file.name)}</b>${account ? ` · ${esc(account)}` : ''}<br>` +
    `${parsed.length} transacciones encontradas${dup ? ` (${dup} ya estaban cargadas)` : ''}.<br>` +
    `Entradas <span class="amt in">${money(ins)}</span> · Salidas <span class="amt out">${money(outs)}</span> — compáralas con los totales del statement.${note}`;

  if (!inserted.length) return setMsg(el, header);
  setMsg(el, header + '<br>Categorizando…');
  const r = await categorizeTxns(inserted, el, header);
  setMsg(el, header + '<br>' + resultLine(r));
}

const resultLine = r =>
  `✔ ${r.byRule} por reglas · ${r.ai} por IA · <b>${r.pending}</b> necesitan tu ayuda` +
  (r.failed ? `<br>⚠ ${r.failed} no se pudieron enviar a la IA; quedaron como pendientes.` : '');

async function pdfPages(file) {
  const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    pages.push(itemsToLines(tc.items));
  }
  return pages;
}

async function aiParse(chunks, header, el, name) {
  const results = new Array(chunks.length);
  let done = 0;
  const work = async text => {
    try {
      return await callFn('parse-statement', { text, header, yearHint: state.client.tax_year });
    } catch (e) {
      if (text.length > 600 && !/Sesión/.test(e.message)) {   // si tardó demasiado, partir a la mitad y reintentar
        const cut = splitAtLine(text);
        const [a, b] = [await work(text.slice(0, cut)), await work(text.slice(cut))];
        return { account: a.account || b.account, rows: [...a.rows, ...b.rows] };
      }
      throw e;
    }
  };
  await pool(chunks.map((c, i) => async () => {
    results[i] = await work(c);
    done++;
    setMsg(el, `Leyendo <b>${esc(name)}</b>… ${done}/${chunks.length}`);
  }), 3);
  const txns = [];
  let account = '';
  for (const r of results) {
    account = account || r.account;
    for (const [date, description, amount] of r.rows) txns.push({ date, description, amount: Number(amount) });
  }
  return { txns, account };
}

// ---------------------------------------------------------------------
// Categorización
// ---------------------------------------------------------------------
function matchRule(t) {
  const d = norm(t.description), dir = dirOf(t.amount);
  let best = null;
  for (const r of state.rules) {
    if ((r.direction === 'any' || r.direction === dir) && d.includes(r.pattern) && (!best || r.pattern.length > best.pattern.length)) best = r;
  }
  return best;
}

async function categorizeTxns(list, el, header = '') {
  const toAI = [];
  let byRule = 0, ai = 0, failed = 0;
  for (const t of list) {
    const r = matchRule(t);
    if (r) { Object.assign(t, { category_code: r.category_code, status: 'auto', source: 'rule', confidence: 1, question: null }); byRule++; }
    else toAI.push(t);
  }

  const batches = [];
  for (let i = 0; i < toAI.length; i += AI_BATCH) batches.push(toAI.slice(i, i + AI_BATCH));
  let done = 0;
  await pool(batches.map(batch => async () => {
    try {
      const r = await callFn('categorize', {
        client: clientCtx(),
        txns: batch.map((t, i) => ({ i, d: t.txn_date, desc: t.description, a: t.amount })),
      });
      const byI = new Map(r.results.map(x => [x.i, x]));
      batch.forEach((t, i) => {
        const x = byI.get(i);
        if (!x || !x.c) { Object.assign(t, { status: 'pending', source: 'ai', confidence: 0 }); return; }
        const sure = x.p >= AUTO_CONFIDENCE && !x.q;
        Object.assign(t, {
          category_code: x.c, confidence: x.p, question: x.q || null,
          suggested_pattern: x.m || null, source: 'ai', status: sure ? 'auto' : 'pending',
        });
        if (sure) ai++;
      });
    } catch {
      batch.forEach(t => Object.assign(t, { status: 'pending', source: 'ai', confidence: 0 }));
      failed += batch.length;
    }
    done++;
    if (el) setMsg(el, `${header}${header ? '<br>' : ''}Categorizando… ${done}/${batches.length}`);
  }), 3);

  await saveTxns(list);
  return { byRule, ai, failed, pending: list.filter(t => t.status === 'pending').length };
}

const TXN_FIELDS = ['id', 'client_id', 'statement_id', 'txn_date', 'description', 'amount', 'category_code', 'status',
  'source', 'confidence', 'question', 'suggested_pattern', 'note', 'hash'];

async function saveTxns(list) {
  for (let i = 0; i < list.length; i += 500) {
    const chunk = list.slice(i, i + 500).map(t => Object.fromEntries(TXN_FIELDS.map(k => [k, t[k] ?? null])));
    const { error } = await sb.from('transactions').upsert(chunk);
    if (error) throw error;
  }
}

// ---------------------------------------------------------------------
// Preguntas
// ---------------------------------------------------------------------
function refreshQueue() {
  const sk = t => (state.skipped.has(t.id) ? 1 : 0);   // las saltadas van al final
  state.queue = state.txns.filter(t => t.status === 'pending')
    .sort((a, b) => sk(a) - sk(b) || a.txn_date.localeCompare(b.txn_date) || a.description.localeCompare(b.description));
  const b = $('#pendBadge');
  b.textContent = state.queue.length;
  b.classList.toggle('d-none', !state.queue.length);
}

function askNext() {
  refreshQueue();
  if (state.busy || !state.client) return;
  const t = state.queue[0];
  if (!t) {
    state.current = null;
    if (state.txns.length && !state.allDoneShown) {
      state.allDoneShown = true;
      addMsg('bot', '✅ No hay transacciones pendientes. Revisa <b>Transacciones → Automáticas</b> si quieres verificar lo que hizo la IA, y luego ve a <b>Reporte</b>.');
    }
    return;
  }
  if (state.current === t && $$('.msg.q:not([data-done])').length) return;
  state.current = t;
  state.allDoneShown = false;
  renderQuestion(t);
}

function groupedOptions(selected) {
  const GROUPS = { income: 'Ingresos', cogs: 'Costo de ventas', expense: 'Gastos', nontax: 'No va al tax return' };
  const cats = categoriesFor(form());
  let h = '<option value="">— Elegir categoría —</option>';
  for (const [g, gl] of Object.entries(GROUPS)) {
    const cs = cats.filter(c => c.group === g);
    if (!cs.length) continue;
    h += `<optgroup label="${gl}">` + cs.map(c =>
      `<option value="${c.code}"${c.code === selected ? ' selected' : ''}>${esc(labelFor(c.code))}</option>`).join('') + '</optgroup>';
  }
  return h;
}

function renderQuestion(t) {
  const sug = t.category_code && catByCode(t.category_code) && lineFor(form(), t.category_code) ? t.category_code : null;
  const quick = [sug, 'OWNER', 'TRANSFER'].filter((c, i, a) => c && a.indexOf(c) === i);
  const el = addMsg('bot q', `
    <div class="small text-muted mb-1">Pendientes: ${state.queue.length}</div>
    <div class="txn"><span class="text-muted">${t.txn_date}</span> <b>${esc(t.description)}</b> <span class="amt ${t.amount < 0 ? 'out' : 'in'}">${money(t.amount)}</span></div>
    <div class="my-2">${esc(t.question || '¿En qué categoría va esta transacción?')}</div>
    <div class="controls">
      <div class="d-flex flex-wrap gap-2 mb-2">${quick.map(c =>
        `<button class="btn btn-sm ${c === sug ? 'btn-primary' : 'btn-outline-secondary'}" data-cat="${c}">${esc(labelFor(c))}</button>`).join('')}</div>
      <div class="input-group input-group-sm mb-2">
        <select class="form-select" data-role="sel">${groupedOptions(sug)}</select>
        <button class="btn btn-outline-primary" data-act="pick">Usar</button>
      </div>
      <div class="form-check small mb-1">
        <input class="form-check-input" type="checkbox" data-role="remember" id="rem-${t.id}" checked>
        <label class="form-check-label" for="rem-${t.id}">Recordar para transacciones que contengan:</label>
      </div>
      <input class="form-control form-control-sm mb-2" data-role="pattern" value="${esc(norm(t.suggested_pattern || '') || guessPattern(t.description))}">
      <button class="btn btn-link btn-sm p-0" data-act="skip">Saltar por ahora</button>
    </div>
    <div class="result small text-success fw-semibold"></div>`);

  el.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b || el.dataset.done || state.busy) return;
    if (b.dataset.act === 'skip') { closeCard(el, '⏭ Saltada'); return skip(t); }
    const code = b.dataset.act === 'pick' ? $('[data-role=sel]', el).value : b.dataset.cat;
    if (!code) return;
    await answer(t, code, $('[data-role=remember]', el).checked, $('[data-role=pattern]', el).value, el);
  });
}

function closeCard(el, text) {
  if (!el) return;
  el.dataset.done = '1';
  $('.result', el).innerHTML = text;
}

function skip(t) {
  state.skipped.add(t.id);
  state.current = null;
  refreshQueue();
  if (state.queue.length === 1 && state.queue[0] === t) {
    addMsg('bot', 'Es la única pendiente. Puedes responderla luego desde aquí o en la pestaña <b>Transacciones</b>.');
    return;
  }
  askNext();
}

async function answer(t, code, remember, pattern, el) {
  setBusy(true, 'Guardando…');
  try {
    Object.assign(t, { category_code: code, status: 'confirmed', source: 'user', question: null });
    await saveTxns([t]);
    let extra = 0;
    const p = norm(pattern);
    if (remember && p.length >= 3) extra = await addRule(p, dirOf(t.amount), code, t);
    closeCard(el || $$('.msg.q:not([data-done])').pop(),
      `✔ ${esc(labelFor(code))}${extra ? ` · y ${extra} más con la regla “${esc(p)}”` : ''}`);
  } catch (e) {
    addMsg('bot', '❌ ' + esc(e.message));
  } finally {
    setBusy(false);
    state.current = null;
    renderTxnTable();
    askNext();
  }
}

async function addRule(pattern, direction, code, except) {
  const { data, error } = await sb.from('category_rules')
    .upsert({ client_id: state.client.id, pattern, direction, category_code: code }, { onConflict: 'client_id,pattern,direction' })
    .select().single();
  if (error) throw error;
  state.rules = state.rules.filter(r => r.id !== data.id).concat(data);
  const hits = state.txns.filter(x => x !== except && x.status === 'pending' && dirOf(x.amount) === direction && norm(x.description).includes(pattern));
  hits.forEach(x => Object.assign(x, { category_code: code, status: 'auto', source: 'rule', question: null, confidence: 1 }));
  if (hits.length) await saveTxns(hits);
  return hits.length;
}

// Mensajes escritos (respuestas en lenguaje natural o preguntas)
async function sendChat() {
  const input = $('#chatInput');
  const text = input.value.trim();
  if (!text || state.busy) return;
  input.value = '';
  addMsg('user', esc(text));
  if (!state.client) return addMsg('bot', 'Primero crea o selecciona un cliente.');

  const t = state.current && state.current.status === 'pending' ? state.current : null;
  setBusy(true, 'Pensando…');
  let r;
  try {
    r = await callFn('chat', {
      message: text,
      client: clientCtx(),
      current: t ? { fecha: t.txn_date, descripcion: t.description, monto: t.amount, pregunta: t.question, sugerida: t.category_code } : null,
      summary: compactSummary(),
    });
  } catch (e) {
    setBusy(false);
    return addMsg('bot', '❌ ' + esc(e.message));
  }
  setBusy(false);

  if (r.reply) addMsg('bot', esc(r.reply));
  if (r.action === 'categorize' && t && r.category_code) {
    const card = $$('.msg.q:not([data-done])').pop();
    await answer(t, r.category_code, r.remember, r.pattern || t.suggested_pattern || guessPattern(t.description), card);
  } else if (r.action === 'skip' && t) {
    closeCard($$('.msg.q:not([data-done])').pop(), '⏭ Saltada');
    skip(t);
  }
}

// ---------------------------------------------------------------------
// Tabla de transacciones
// ---------------------------------------------------------------------
const STATUS = { new: ['Sin procesar', 'secondary'], pending: ['Pendiente', 'warning'], auto: ['Auto', 'info'], confirmed: ['Confirmada', 'success'] };
const SOURCE = { rule: 'regla', ai: 'IA', user: 'tú' };

function badge(t) {
  const [l, c] = STATUS[t.status] || ['?', 'secondary'];
  const src = t.status === 'auto' && SOURCE[t.source] ? ` · ${SOURCE[t.source]}` : '';
  return `<span class="badge text-bg-${c}">${l}${src}</span>`;
}

function renderTxnTable() {
  if (!state.client) { $('#txnBody').innerHTML = ''; $('#txnCount').textContent = ''; return; }
  const f = $('#txnFilter').value, q = norm($('#txnSearch').value);
  let list = state.txns;
  if (f === 'pending') list = list.filter(t => t.status === 'pending' || t.status === 'new');
  else if (f !== 'all') list = list.filter(t => t.status === f);
  if (q) list = list.filter(t => norm(t.description).includes(q));
  list = [...list].sort((a, b) => b.txn_date.localeCompare(a.txn_date));
  const shown = list.slice(0, 400);
  $('#txnBody').innerHTML = shown.map(t => `
    <tr data-id="${t.id}">
      <td class="text-nowrap">${t.txn_date}</td>
      <td>${esc(t.description)}${t.status === 'pending' && t.question ? `<div class="small text-muted">${esc(t.question)}</div>` : ''}</td>
      <td class="text-end text-nowrap amt ${t.amount < 0 ? 'out' : 'in'}">${money(t.amount)}</td>
      <td><select class="form-select form-select-sm">${groupedOptions(t.category_code)}</select></td>
      <td>${badge(t)}</td>
    </tr>`).join('') || '<tr><td colspan="5" class="text-muted small p-3">No hay transacciones con este filtro.</td></tr>';
  $('#txnCount').textContent = `${list.length} transacciones${list.length > 400 ? ' (mostrando 400 más recientes; usa la búsqueda)' : ''}`;
}

async function onTxnCategoryChange(e) {
  const tr = e.target.closest('tr');
  const t = state.txns.find(x => x.id === tr?.dataset.id);
  if (!t || !e.target.value) return;
  Object.assign(t, { category_code: e.target.value, status: 'confirmed', source: 'user', question: null });
  try {
    await saveTxns([t]);
    tr.lastElementChild.innerHTML = badge(t);
    if (state.current === t) {
      closeCard($$('.msg.q:not([data-done])').pop(), `✔ ${esc(labelFor(t.category_code))} (desde la tabla)`);
      state.current = null;
      askNext();
    } else refreshQueue();
  } catch (err) { alert(err.message); }
}

// ---------------------------------------------------------------------
// Reporte
// ---------------------------------------------------------------------
function computeReport() {
  const f = form(), y = state.client.tax_year;
  const txns = state.txns.filter(t => !y || t.txn_date.startsWith(String(y)));
  const lines = new Map();
  const pendingList = [];
  for (const t of txns) {
    const cat = t.category_code && catByCode(t.category_code);
    const ln = cat && lineFor(f, cat.code);
    if (!cat || !ln || t.status === 'pending' || t.status === 'new') { pendingList.push(t); continue; }
    const key = `${cat.group}|${ln.label}`;
    if (!lines.has(key)) lines.set(key, { group: cat.group, label: ln.label, order: ln.order, total: 0, count: 0, cats: new Map() });
    const L = lines.get(key);
    const v = cat.group === 'income' ? t.amount : -t.amount;   // gastos y salidas en positivo
    L.total += v; L.count++;
    L.cats.set(cat.code, (L.cats.get(cat.code) || 0) + v);
  }
  const groups = { income: [], cogs: [], expense: [], nontax: [] };
  for (const L of lines.values()) groups[L.group].push(L);
  Object.values(groups).forEach(a => a.sort((p, q) => p.order - q.order || p.label.localeCompare(q.label)));
  const sum = a => a.reduce((s, l) => s + l.total, 0);
  const income = sum(groups.income), cogs = sum(groups.cogs), expensesGross = sum(groups.expense);
  let mealsAdj = 0;
  for (const L of groups.expense) for (const [code, v] of L.cats) {
    const pct = catByCode(code).deductPct;
    if (pct != null) mealsAdj += v * (1 - pct);
  }
  const expenses = expensesGross - mealsAdj;
  return { year: y, txns, groups, income, cogs, expensesGross, mealsAdj, expenses, net: income - cogs - expenses, pendingList };
}

function renderReport() {
  const box = $('#reportView');
  if (!state.client) { box.innerHTML = ''; return; }
  const R = computeReport();
  if (!R.txns.length) { box.innerHTML = '<p class="text-muted">Todavía no hay transacciones para este año.</p>'; return; }
  const rowsFor = arr => arr.map(L => `
      <tr><td>${esc(L.label)}</td><td class="num">${money(L.total)}</td></tr>` +
      (L.cats.size > 1 ? [...L.cats].map(([c, v]) => `<tr class="sub"><td>${esc(labelFor(c))}</td><td class="num">${money(v)}</td></tr>`).join('') : '')).join('');
  const F = FORMS[form()];
  box.innerHTML = `
    <h2 class="h5 mb-0">${esc(state.client.name)}</h2>
    <div class="text-muted small mb-3">${esc(F.label)} · Año ${R.year || 'todos'} · ${R.txns.length} transacciones</div>
    ${R.pendingList.length ? `<div class="alert alert-warning py-2 small no-print">⚠ ${R.pendingList.length} transacciones sin categorizar no están incluidas. Termínalas en el Chat.</div>` : ''}
    <table class="table table-sm">
      <tr class="sec"><td colspan="2">Ingresos</td></tr>${rowsFor(R.groups.income)}
      <tr class="tot"><td>Total ingresos</td><td class="num">${money(R.income)}</td></tr>
      ${R.groups.cogs.length ? `<tr class="sec"><td colspan="2">Costo de ventas</td></tr>${rowsFor(R.groups.cogs)}
      <tr class="tot"><td>Total costo de ventas</td><td class="num">${money(R.cogs)}</td></tr>` : ''}
      <tr class="sec"><td colspan="2">Gastos</td></tr>${rowsFor(R.groups.expense)}
      ${R.mealsAdj ? `<tr class="sub"><td>Menos 50% no deducible de comidas</td><td class="num">${money(-R.mealsAdj)}</td></tr>` : ''}
      <tr class="tot"><td>Total gastos deducibles</td><td class="num">${money(R.expenses)}</td></tr>
      <tr class="net"><td>Ganancia (pérdida) neta</td><td class="num">${money(R.net)}</td></tr>
      ${R.groups.nontax.length ? `<tr class="sec"><td colspan="2">No va al tax return (informativo para el CPA)</td></tr>${rowsFor(R.groups.nontax)}` : ''}
    </table>
    <p class="small text-muted">Generado con CuentaClara el ${new Date().toLocaleDateString('es-US')}. Los números de línea son una guía; verifícalos con el formulario del año. Los montos en “No va al tax return” se muestran como salidas netas.</p>`;
}

function exportExcel() {
  if (!state.client) return;
  const R = computeReport();
  const F = FORMS[form()];
  const res = [
    [`Reporte para CPA – ${state.client.name}`], [`Formulario: ${F.label}`],
    [`Año fiscal: ${R.year || 'Todos'}`], [`Generado: ${new Date().toLocaleDateString('es-US')}`], [],
    ['Concepto', 'Detalle', 'Monto'],
  ];
  const sec = (title, arr) => {
    res.push([title.toUpperCase()]);
    for (const L of arr) {
      res.push([L.label, '', round2(L.total)]);
      if (L.cats.size > 1) for (const [c, v] of L.cats) res.push(['', labelFor(c), round2(v)]);
    }
  };
  sec('Ingresos', R.groups.income); res.push(['Total ingresos', '', round2(R.income)], []);
  if (R.groups.cogs.length) { sec('Costo de ventas', R.groups.cogs); res.push(['Total costo de ventas', '', round2(R.cogs)], []); }
  sec('Gastos', R.groups.expense);
  if (R.mealsAdj) res.push(['Menos 50% no deducible de comidas', '', -round2(R.mealsAdj)]);
  res.push(['Total gastos deducibles', '', round2(R.expenses)], [], ['GANANCIA (PÉRDIDA) NETA', '', round2(R.net)], []);
  if (R.groups.nontax.length) sec('No va al tax return (informativo)', R.groups.nontax);
  if (R.pendingList.length) res.push([], [`ATENCIÓN: ${R.pendingList.length} transacciones sin categorizar (hoja "Pendientes")`]);

  const txRow = t => [t.txn_date, t.description, t.amount,
    t.category_code ? labelFor(t.category_code) : '',
    t.category_code ? (lineFor(form(), t.category_code)?.label || '') : '',
    (STATUS[t.status] || [''])[0], SOURCE[t.source] || ''];
  const head = ['Fecha', 'Descripción', 'Monto', 'Categoría', 'Línea del formulario', 'Estado', 'Categorizada por'];
  const sorted = [...R.txns].sort((a, b) => a.txn_date.localeCompare(b.txn_date));

  const wb = XLSX.utils.book_new();
  const add = (aoa, name, cols, numCol) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = cols.map(w => ({ wch: w }));
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let r = range.s.r; r <= range.e.r; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c: numCol })];
      if (cell && cell.t === 'n') cell.z = '#,##0.00;[Red]-#,##0.00';
    }
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  add(res, 'Resumen', [52, 42, 16], 2);
  add([head, ...sorted.map(txRow)], 'Transacciones', [12, 60, 14, 38, 46, 12, 16], 2);
  if (R.pendingList.length) add([head, ...R.pendingList.map(txRow)], 'Pendientes', [12, 60, 14, 38, 46, 12, 16], 2);
  const safe = state.client.name.replace(/[\\/:*?"<>|]/g, '').trim();
  XLSX.writeFile(wb, `${safe} ${R.year || ''} - Reporte CPA.xlsx`.replace(/\s+/g, ' '));
}

function compactSummary() {
  const R = computeReport();
  const porCategoria = {};
  for (const g of ['income', 'cogs', 'expense', 'nontax']) for (const L of R.groups[g]) for (const [c, v] of L.cats) porCategoria[labelFor(c)] = round2(v);
  return {
    año: R.year, transacciones: R.txns.length, sin_categorizar: R.pendingList.length,
    total_ingresos: round2(R.income), total_costo_ventas: round2(R.cogs),
    total_gastos_deducibles: round2(R.expenses), ganancia_neta: round2(R.net),
    por_categoria: porCategoria,
  };
}

// ---------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------
function renderSettings() {
  const box = $('#settingsView');
  if (!state.client) { box.innerHTML = ''; return; }
  const c = state.client;
  const dirL = { in: 'Entradas', out: 'Salidas', any: 'Ambas' };
  box.innerHTML = `
    <h3 class="h6">Datos del cliente</h3>
    <form id="clientEditForm" class="row g-2 mb-4">
      <div class="col-md-6"><label class="form-label small mb-1">Nombre</label><input name="name" class="form-control form-control-sm" value="${esc(c.name)}" required></div>
      <div class="col-md-6"><label class="form-label small mb-1">Año fiscal</label><input name="tax_year" type="number" class="form-control form-control-sm" value="${c.tax_year ?? ''}"></div>
      <div class="col-12"><label class="form-label small mb-1">¿A qué se dedica?</label><input name="business_desc" class="form-control form-control-sm" value="${esc(c.business_desc || '')}"></div>
      <div class="col-12"><label class="form-label small mb-1">Formulario</label><select name="tax_form" class="form-select form-select-sm">${Object.entries(FORMS).map(([k, v]) => `<option value="${k}"${k === c.tax_form ? ' selected' : ''}>${esc(v.label)}</option>`).join('')}</select></div>
      <div class="col-12"><button class="btn btn-sm btn-primary">Guardar cambios</button></div>
    </form>

    <h3 class="h6">Reglas aprendidas (${state.rules.length})</h3>
    ${state.rules.length ? `<table class="table table-sm bg-white mb-4"><thead><tr><th>Si contiene</th><th>Dirección</th><th>Categoría</th><th></th></tr></thead><tbody>
      ${state.rules.map(r => `<tr><td><code>${esc(r.pattern)}</code></td><td>${dirL[r.direction]}</td><td>${esc(labelFor(r.category_code))}</td>
      <td class="text-end"><button class="btn btn-sm btn-link text-danger p-0" data-del-rule="${r.id}">Borrar</button></td></tr>`).join('')}
    </tbody></table>` : '<p class="small text-muted mb-4">Se crean solas cuando respondes preguntas con “Recordar” marcado.</p>'}

    <h3 class="h6">Archivos subidos (${state.statements.length})</h3>
    ${state.statements.length ? `<table class="table table-sm bg-white mb-4"><tbody>
      ${state.statements.map(s => `<tr><td>${esc(s.file_name || '')}<div class="small text-muted">${esc(s.account_name || '')}</div></td>
      <td class="small">${s.txn_count} transacciones</td><td class="small text-muted">${new Date(s.created_at).toLocaleDateString('es-US')}</td>
      <td class="text-end"><button class="btn btn-sm btn-link text-danger p-0" data-del-st="${s.id}">Borrar con sus transacciones</button></td></tr>`).join('')}
    </tbody></table>` : '<p class="small text-muted mb-4">Todavía no hay archivos.</p>'}

    <button class="btn btn-sm btn-outline-danger" id="delClientBtn">Eliminar este cliente y todos sus datos</button>`;

  $('#clientEditForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const upd = { name: f.name.value.trim(), business_desc: f.business_desc.value.trim() || null, tax_form: f.tax_form.value, tax_year: f.tax_year.value ? Number(f.tax_year.value) : null };
    const { error } = await sb.from('clients').update(upd).eq('id', c.id);
    if (error) return alert(error.message);
    await loadClients(c.id);
  });
  box.querySelectorAll('[data-del-rule]').forEach(b => b.addEventListener('click', async () => {
    const { error } = await sb.from('category_rules').delete().eq('id', b.dataset.delRule);
    if (error) return alert(error.message);
    state.rules = state.rules.filter(r => r.id !== b.dataset.delRule);
    renderSettings();
  }));
  box.querySelectorAll('[data-del-st]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('¿Borrar este archivo y todas sus transacciones? Las reglas aprendidas se conservan.')) return;
    const { error } = await sb.from('statements').delete().eq('id', b.dataset.delSt);
    if (error) return alert(error.message);
    await selectClient(c.id);
  }));
  $('#delClientBtn').addEventListener('click', async () => {
    if (prompt(`Escribe el nombre del cliente para confirmar: ${c.name}`) !== c.name) return;
    const { error } = await sb.from('clients').delete().eq('id', c.id);
    if (error) return alert(error.message);
    store.set('lastClient', '');
    await loadClients();
  });
}

function renderAll() { renderTxnTable(); renderReport(); renderSettings(); refreshQueue(); }

// ---------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------
function bindStatic() {
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    $('#authMsg').textContent = '';
    const { error } = await sb.auth.signInWithPassword({ email: $('#loginEmail').value.trim(), password: $('#loginPass').value });
    if (error) $('#authMsg').textContent = error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error.message;
  });
  $('#logoutBtn').addEventListener('click', () => sb.auth.signOut());
  $('#newClientBtn').addEventListener('click', openClientModal);
  $('#clientNewForm').addEventListener('submit', createClient_);
  $('#clientSelect').addEventListener('change', e => { if (e.target.value && !state.busy) selectClient(e.target.value); });

  $('#attachBtn').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', e => { handleFiles(e.target.files); e.target.value = ''; });
  $('#sendBtn').addEventListener('click', sendChat);
  $('#chatInput').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } });

  const pane = $('#tabChat');
  pane.addEventListener('dragover', e => { e.preventDefault(); pane.classList.add('drop-hover'); });
  pane.addEventListener('dragleave', e => { if (!pane.contains(e.relatedTarget)) pane.classList.remove('drop-hover'); });
  pane.addEventListener('drop', e => { e.preventDefault(); pane.classList.remove('drop-hover'); handleFiles(e.dataTransfer.files); });

  $('#txnFilter').addEventListener('change', renderTxnTable);
  $('#txnSearch').addEventListener('input', renderTxnTable);
  $('#txnBody').addEventListener('change', e => { if (e.target.matches('select')) onTxnCategoryChange(e); });

  $('#xlsxBtn').addEventListener('click', exportExcel);
  $('#printBtn').addEventListener('click', () => { renderReport(); window.print(); });

  document.querySelector('[data-bs-target="#tabReport"]').addEventListener('shown.bs.tab', renderReport);
  document.querySelector('[data-bs-target="#tabTxns"]').addEventListener('shown.bs.tab', renderTxnTable);
  document.querySelector('[data-bs-target="#tabSettings"]').addEventListener('shown.bs.tab', renderSettings);
  document.querySelector('[data-bs-target="#tabChat"]').addEventListener('shown.bs.tab', scrollChat);
}

init();
