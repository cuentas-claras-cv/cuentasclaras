// Utilidades compartidas por las funciones de Netlify.
// Variables de entorno requeridas (Netlify → Site settings → Environment variables):
//   OPENAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY
// Opcional: OPENAI_MODEL (por defecto gpt-4o-mini)

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

/** Valida el token de Supabase para que nadie más gaste tus créditos de OpenAI. */
async function requireUser(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token || !process.env.SUPABASE_URL) return null;
  const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: process.env.SUPABASE_ANON_KEY || '' },
  });
  return r.ok ? r.json() : null;
}

/** Llama a OpenAI y devuelve el JSON que respondió el modelo. */
export async function openaiJSON(system, user, maxTokens = 4000) {
  if (!process.env.OPENAI_API_KEY) throw new Error('Falta OPENAI_API_KEY en Netlify');
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      max_completion_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `OpenAI respondió ${r.status}`);
  const content = j.choices?.[0]?.message?.content || '{}';
  try { return JSON.parse(content); } catch { throw new Error('La IA devolvió una respuesta incompleta'); }
}

/** Envuelve una función: solo POST, usuario autenticado, errores como JSON. */
export function handler(fn) {
  return async req => {
    if (req.method !== 'POST') return json({ error: 'Solo POST' }, 405);
    try {
      const user = await requireUser(req);
      if (!user) return json({ error: 'Sesión inválida. Vuelve a entrar.' }, 401);
      const body = await req.json();
      return json(await fn(body, user));
    } catch (e) {
      return json({ error: e.message || 'Error interno' }, 500);
    }
  };
}
