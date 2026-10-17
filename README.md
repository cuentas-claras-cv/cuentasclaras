# CuentaClara

Contabilidad conversacional: subes los statements del banco o la tarjeta (PDF o CSV), la IA categoriza las transacciones, te pregunta solo lo dudoso, aprende reglas, y al final genera el reporte en Excel para el CPA.

Funciona para varios clientes y varios formularios: **Schedule C, 1120-S, 1065 y 1120**.

## Cómo funciona

1. **Subes un statement** en el chat (📎 o arrastrándolo).
   - CSV: se lee directo en el navegador (Chase, BofA, Wells, Amex y formatos con Debit/Credit).
   - PDF: se extrae el texto y la IA saca las transacciones en pedazos pequeños.
   - Al terminar te muestra el total de entradas y salidas para que lo compares con el statement.
2. **Se categoriza todo**:
   - Primero se aplican las reglas que ya aprendió (gratis, instantáneo).
   - Lo demás va a la IA. Si está segura (≥ 85%) lo categoriza sola; si no, te pregunta.
3. **Respondes las preguntas** con botones o escribiendo normal ("eso fue personal", "es diésel del camión 2").
   - Con "Recordar" marcado crea una regla, y la aplica de inmediato a las demás pendientes parecidas.
4. **Reporte**: resumen por línea del formulario, ganancia neta, comidas al 50%, partidas que no van al tax return, y Excel con 3 hojas (Resumen, Transacciones, Pendientes).

Las transacciones duplicadas se ignoran si subes el mismo statement dos veces.

## Instalación (una vez, ~20 minutos)

### 1. Supabase (proyecto nuevo, separado de OneStop)
1. Crea un proyecto en supabase.com.
2. SQL Editor → pega todo `supabase/schema.sql` → Run.
3. Authentication → Users → **Add user** → crea tu usuario (y luego el de tu mamá) con correo y contraseña.
4. Authentication → Sign In / Providers → Email → desactiva **Allow new users to sign up** (así nadie más puede crear cuenta).
5. Settings → API → copia **Project URL** y **anon public key**.

### 2. Configurar el frontend
Edita `public/config.js` con la URL y la anon key.

### 3. Netlify
1. Sube la carpeta a un repo de GitHub y crea el sitio en Netlify desde ese repo (no hay build command; publish = `public`, ya está en `netlify.toml`).
2. Site settings → Environment variables:
   - `OPENAI_API_KEY` = tu key de OpenAI
   - `SUPABASE_URL` = la misma URL de Supabase
   - `SUPABASE_ANON_KEY` = la misma anon key
   - `OPENAI_MODEL` (opcional) = por defecto `gpt-4o-mini`
3. Deploy.

### Desarrollo local
```bash
npm i -g netlify-cli
netlify dev          # abre http://localhost:8888 con las funciones funcionando
npm test             # pruebas de lectura de CSV, categorías y funciones
```

## Estructura

```
public/
  index.html        Interfaz (chat, transacciones, reporte, ajustes)
  app.js            Lógica principal
  parsers.js        Lectura de CSV, fechas, montos, texto de PDF (sin red, con pruebas)
  categories.js     Categorías y su línea en cada formulario  ← aquí se ajustan
  config.js         URL y anon key de Supabase
netlify/functions/
  parse-statement   Saca transacciones del texto de un PDF
  categorize        Categoriza lotes de 25 transacciones
  chat              Interpreta respuestas escritas y preguntas
supabase/schema.sql Tablas + seguridad por usuario (RLS)
tests/run.mjs       Pruebas
```

## Costos aproximados
Con `gpt-4o-mini`, un statement de 150 transacciones cuesta alrededor de 1–3 centavos entre leerlo y categorizarlo. Mientras más reglas aprende un cliente, menos se usa la IA.

## Notas importantes
- **Números de línea**: están basados en los formularios recientes; verifícalos con el formulario del año antes de entregar. Se cambian en `public/categories.js`.
- **No sustituye al CPA**: organiza y clasifica; las decisiones fiscales (depreciación, qué es deducible, elección de entidad) son del CPA.
- **Privacidad**: los datos de cada usuario están aislados por RLS. Las descripciones y montos se envían a la API de OpenAI para categorizar (no se envían números de cuenta completos; los statements no se guardan, solo las transacciones extraídas). Si tu mamá lo usa con clientes, conviene que se los mencione.
- **Tiempo de las funciones**: Netlify corta las funciones a los 10 segundos. Por eso los PDFs se envían en pedazos pequeños y, si un pedazo tarda demasiado, se divide en dos automáticamente.
- **PDFs escaneados** (fotos) no se pueden leer todavía; usa el PDF original del banco o el CSV.

## Ideas para la siguiente versión
- Leer PDFs escaneados con GPT-4o Vision (igual que el RC scanner de OneStop).
- Subir recibos sueltos y vincularlos a transacciones.
- Separar por cuenta (cheques vs tarjeta) en el reporte.
- Reporte mensual además del anual.
