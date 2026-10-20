import fs from 'node:fs';
import path from 'node:path';

const preguntas = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../../data/preguntas.json'), 'utf8'));

// Dos ejemplos de la plantilla: uno en párrafo y otro con lista, para enseñar el formato.
const EXAMPLES = [preguntas.find((q) => q.pregunta.includes('Cédula General')), preguntas.find((q) => q.pregunta.includes('tres eventos'))]
  .filter(Boolean)
  .map((q) => `Pregunta: ${q.pregunta}\n**Respuesta:** ${q.respuesta}\n\n**Fuente:** ${q.fuente}`)
  .join('\n\n---\n\n');

export function systemPrompt(today = new Date()) {
  const fecha = today.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'long' });
  return `Eres NOVA, el asistente del Consultorio Empresarial de la Universidad de Santander (UDES) que orienta sobre la normativa tributaria vigente en Colombia. Hoy es ${fecha}.

Reglas:
1. Responde SOLO con la información del CONTEXTO que acompaña cada pregunta (fragmentos de normas oficiales y preguntas de referencia). Si el contexto no alcanza, dilo con claridad y sugiere consultar a la DIAN o a un contador. Nunca inventes cifras, artículos, fechas ni números de norma.
2. Si la pregunta no trata de impuestos, normativa tributaria colombiana o protección de datos, explica con amabilidad que solo atiendes esos temas.
3. Si una norma del contexto figura como "no vigente", "derogada" o "histórica", acláralo y no la presentes como vigente.
4. Cuando uses UVT, indica el año y el valor en pesos (UVT 2025 = $49.799; UVT 2026 = $52.374).
5. Escribe en español claro, para emprendedores y pequeños empresarios. Sé breve.

Formato obligatorio de toda respuesta:
**Respuesta:** respuesta directa en uno a tres párrafos cortos, o una lista breve si hay pasos o requisitos. Resalta en **negrita** la norma, cifra o concepto clave.

**Fuente:** la norma y el artículo exactos de donde sale la respuesta.

Ejemplos de respuestas bien hechas:

${EXAMPLES}`;
}

const MAX_CONTEXT_CHARS = 9000;

// Mensajes para el modelo: instrucciones, historial reciente y la pregunta con su contexto.
export function buildMessages({ question, history = [], results = [] }) {
  let budget = MAX_CONTEXT_CHARS;
  const context = [];
  for (const [i, r] of results.entries()) {
    const text = r.content.slice(0, budget);
    if (!text) break;
    budget -= text.length;
    const estado = r.statusLegal && r.statusLegal !== 'vigente' ? ` (estado: ${r.statusLegal})` : '';
    context.push(`[${i + 1}] ${r.title}${estado}\n${text}`);
  }
  const user = `CONTEXTO:\n${context.join('\n\n') || '(sin resultados en el corpus)'}\n\nPREGUNTA: ${question}`;
  return [{ role: 'system', content: systemPrompt() }, ...history, { role: 'user', content: user }];
}
