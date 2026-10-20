// Llama a la API y devuelve el JSON; lanza un Error con el mensaje del servidor si falla.
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'No se pudo completar la solicitud'), { status: res.status, data });
  return data;
}
