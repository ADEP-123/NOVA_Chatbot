import { convert } from 'html-to-text';
import { extractText as pdfText, getDocumentProxy } from 'unpdf';

const MAX_DOWNLOAD_BYTES = 80 * 1024 * 1024;

// Encabezados de artículo: "ARTÍCULO 592.", "Artículo 1.6.1.13.2.6.", "Art. 616-1"
const ARTICLE_RE = /^(?:ART[IÍ]CULO|Art[ií]culo|Art\.)\s+(\d+(?:[-.]\d+)*(?:\s?[A-Z](?![a-z]))?)/;

function decodeHtml(buffer, contentType = '') {
  const head = buffer.subarray(0, 4096).toString('latin1');
  const charset =
    contentType.match(/charset=["']?([\w-]+)/i)?.[1] || head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] || 'utf-8';
  try {
    return new TextDecoder(charset.toLowerCase()).decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

export function htmlToText(html) {
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'img', format: 'skip' },
      { selector: 'nav', format: 'skip' },
      { selector: 'header', format: 'skip' },
      { selector: 'footer', format: 'skip' },
      { selector: 'table', format: 'dataTable' },
    ],
  });
}

// Texto plano de un archivo descargado o subido (PDF, HTML o texto).
export async function extractText(buffer, { contentType = '', name = '' } = {}) {
  const isPdf = contentType.includes('pdf') || /\.pdf$/i.test(name) || buffer.subarray(0, 5).toString() === '%PDF-';
  if (isPdf) {
    const { text } = await pdfText(await getDocumentProxy(new Uint8Array(buffer)), { mergePages: true });
    if (text.replace(/\s/g, '').length < 200) throw new Error('El PDF no tiene texto seleccionable (probablemente es escaneado)');
    return text;
  }
  const isHtml = contentType.includes('html') || /\.html?$/i.test(name) || /^\s*<(!doctype|html)/i.test(buffer.subarray(0, 200).toString());
  return isHtml ? htmlToText(decodeHtml(buffer, contentType)) : buffer.toString('utf8');
}

export async function download(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; NOVA-UDES/1.0; +consulta normativa)' },
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (Number(res.headers.get('content-length')) > MAX_DOWNLOAD_BYTES) throw new Error('Archivo demasiado grande');
  const buffer = Buffer.from(await res.arrayBuffer());
  return extractText(buffer, { contentType: res.headers.get('content-type') || '', name: new URL(url).pathname });
}

// Parte un texto largo en fragmentos de ~maxChars respetando párrafos.
// Cada fragmento lleva arriba el título de la fuente y el artículo en que empieza,
// para que la búsqueda y la cita sepan de dónde salió.
export function chunkText(text, title, maxChars = 1200) {
  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 1);

  const chunks = [];
  let current = [];
  let size = 0;
  let heading = '';
  let chunkHeading = '';

  const flush = () => {
    if (current.length) chunks.push(`[${title}${chunkHeading ? ` — ${chunkHeading}` : ''}]\n${current.join('\n')}`);
    current = [];
    size = 0;
  };

  for (const paragraph of paragraphs) {
    const article = paragraph.match(ARTICLE_RE);
    if (article) {
      heading = `Artículo ${article[1].replace(/\s/g, '')}`;
      if (size > maxChars / 3) flush(); // empieza fragmento nuevo con cada artículo, salvo que el actual sea muy corto
    }
    // Párrafos gigantes se cortan por frases.
    const pieces = paragraph.length > maxChars ? paragraph.match(new RegExp(`.{1,${maxChars}}(?:[.;:](?=\\s)|$|\\s)`, 'g')) : [paragraph];
    for (const piece of pieces) {
      if (size + piece.length > maxChars) flush();
      if (!current.length) chunkHeading = heading;
      current.push(piece.trim());
      size += piece.length;
    }
  }
  flush();
  return chunks;
}
