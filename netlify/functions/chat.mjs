// Conversación libre: interpreta respuestas escritas ("eso fue personal", "es diesel")
// o contesta preguntas sobre los totales del cliente.
import { handler, openaiJSON } from '../lib/shared.mjs';
import { FORMS, categoriesFor, catLabel, formOf } from '../../public/categories.js';

export default handler(async ({ message, client, current, summary }) => {
  if (!message || typeof message !== 'string') throw new Error('Mensaje vacío');
  const form = formOf(client?.tax_form);
  const cats = categoriesFor(form);
  const list = cats.map(c => `${c.code}: ${catLabel(c.code, form)}`).join('\n');

  const system = `Eres el asistente de CuentaClara, una app que organiza los movimientos bancarios de un negocio para entregar un reporte al CPA. Formulario de impuestos del cliente: ${FORMS[form].label}.
Responde SIEMPRE en español, breve y claro.

Categorías válidas:
${list}

Devuelve JSON con una de estas formas:
1) Si hay una transacción pendiente y el usuario está diciendo qué es: {"action":"categorize","category_code":"CODE","remember":true,"pattern":"PALABRA CLAVE EN MAYÚSCULAS","reply":"confirmación corta"}
   - remember=false si el usuario dice que es un caso único o que no siempre es así.
   - pattern: palabra clave del comercio/persona para reconocer transacciones parecidas.
2) Si pide saltarla o dejarla para después: {"action":"skip","reply":"..."}
3) Cualquier otra cosa (preguntas sobre totales, dudas generales): {"action":"reply","reply":"..."}
   - Usa SOLO las cifras del resumen. No inventes números.
   - En dudas fiscales específicas, da orientación general y recomienda confirmarlo con el CPA.`;

  const user = JSON.stringify({
    mensaje: message.slice(0, 1000),
    cliente: { nombre: client?.name, negocio: client?.business_desc },
    transaccion_pendiente: current || null,
    resumen: summary || null,
  });

  const out = await openaiJSON(system, user, 800);
  const valid = new Set(cats.map(c => c.code));
  const action = ['categorize', 'skip', 'reply'].includes(out.action) ? out.action : 'reply';

  return {
    action: action === 'categorize' && !valid.has(out.category_code) ? 'reply' : action,
    category_code: valid.has(out.category_code) ? out.category_code : null,
    remember: out.remember !== false,
    pattern: String(out.pattern || '').slice(0, 60),
    reply: String(out.reply || '').slice(0, 1500),
  };
});
