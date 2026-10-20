// Proveedores de IA. Todo el resto de NOVA solo usa chat() y embed(), así que cambiar
// de modelo local a uno de pago es cuestión de variables de entorno (ver README).
//
//   chat(messages, { onToken, signal }) -> { text, usage: { prompt, completion } }
//   embed(texts)                        -> number[][]
//
// 'openai': cualquier API compatible con OpenAI (Ollama, OpenAI, Anthropic, Gemini, Groq, DeepSeek, OpenRouter...).
// 'fake':   sin modelo, para pruebas y para desarrollar sin GPU.
import { config } from './config.js';

export const estimateTokens = (text) => Math.ceil(String(text).length / 4);

export function createProvider({ provider, baseUrl, apiKey, model, temperature, maxTokens }) {
  if (provider === 'fake') return fakeProvider;
  if (provider !== 'openai') throw new Error(`Proveedor de IA desconocido: "${provider}" (usa openai o fake)`);

  const headers = { 'content-type': 'application/json', ...(apiKey && { authorization: `Bearer ${apiKey}` }) };

  async function post(path, body, signal) {
    let res;
    try {
      res = await fetch(baseUrl + path, { method: 'POST', headers, body: JSON.stringify(body), signal });
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      throw new Error(`No se pudo conectar con el proveedor de IA en ${baseUrl}: ${err.cause?.code || err.message}`);
    }
    if (!res.ok) throw new Error(`El proveedor de IA respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res;
  }

  return {
    model,
    async chat(messages, { onToken = () => {}, signal } = {}) {
      const res = await post(
        '/chat/completions',
        { model, messages, temperature, max_tokens: maxTokens, stream: true, stream_options: { include_usage: true } },
        signal,
      );
      let text = '';
      let usage = null;
      for await (const data of sseData(res.body)) {
        if (data === '[DONE]') break;
        const event = JSON.parse(data);
        if (event.error) throw new Error(`Error del proveedor de IA: ${event.error.message || JSON.stringify(event.error)}`);
        const delta = event.choices?.[0]?.delta?.content;
        if (delta) {
          text += delta;
          onToken(delta);
        }
        if (event.usage) usage = event.usage;
      }
      // Si el proveedor no informa tokens, se estiman (~4 caracteres por token).
      return {
        text,
        usage: {
          prompt: usage?.prompt_tokens ?? estimateTokens(messages.map((m) => m.content).join('\n')),
          completion: usage?.completion_tokens ?? estimateTokens(text),
        },
      };
    },
    async embed(texts) {
      const res = await post('/embeddings', { model, input: texts });
      const { data } = await res.json();
      return data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    },
  };
}

// Lee un stream Server-Sent Events y entrega el contenido de cada línea "data:".
export async function* sseData(body) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line.startsWith('data:')) yield line.slice(5).trim();
    }
  }
  if (buffer.trim().startsWith('data:')) yield buffer.trim().slice(5).trim();
}

const normalize = (text) =>
  String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

// Embedding de juguete: bolsa de palabras con hash. Sirve para probar la búsqueda sin modelo.
function hashEmbed(text, dims = 512) {
  const v = new Array(dims).fill(0);
  for (const word of normalize(text).split(/[^a-z0-9ñ]+/)) {
    if (word.length < 3) continue;
    let h = 2166136261;
    for (const ch of word) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    v[(h >>> 0) % dims] += 1;
  }
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}

const fakeProvider = {
  model: 'fake',
  async chat(messages, { onToken = () => {} } = {}) {
    const question = messages.findLast((m) => m.role === 'user')?.content ?? '';
    const text = `**Respuesta:** (modo de prueba, sin modelo de IA) Recibí tu pregunta: "${question.slice(0, 200)}".\n\n**Fuente:** ninguna.`;
    for (const piece of text.match(/\S+\s*/g)) onToken(piece);
    return { text, usage: { prompt: estimateTokens(messages.map((m) => m.content).join('\n')), completion: estimateTokens(text) } };
  },
  async embed(texts) {
    return texts.map((t) => hashEmbed(t));
  },
};

export const llm = createProvider(config.llm);
export const embedder = createProvider(config.embed);
