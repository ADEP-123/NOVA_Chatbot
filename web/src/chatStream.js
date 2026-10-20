// Envía una pregunta y procesa la respuesta en streaming (Server-Sent Events).
export async function streamChat(body, { onMeta, onToken, onDone, signal }) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'No se pudo enviar la pregunta');
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let end;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const event = block.match(/^event: (.+)$/m)?.[1];
      const data = JSON.parse(block.match(/^data: (.+)$/m)?.[1] ?? 'null');
      if (event === 'meta') onMeta?.(data);
      else if (event === 'token') onToken?.(data.t);
      else if (event === 'done') onDone?.(data);
      else if (event === 'error') throw new Error(data.error);
    }
  }
}
