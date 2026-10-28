export class HttpError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
export async function boundedJson(request: Request, maxBytes = 8192): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new HttpError(415, 'INVALID_CONTENT_TYPE');
  if (Number(request.headers.get('content-length')) > maxBytes) throw new HttpError(413, 'BODY_TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'INVALID_INPUT');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new HttpError(413, 'BODY_TOO_LARGE'); }
    chunks.push(value);
  }
  const data = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(data)); }
  catch { throw new HttpError(400, 'INVALID_INPUT'); }
}
export async function sha256(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export function corsHeaders(origin: string | null, allowed: string[]) {
  if (origin && !allowed.includes(origin)) throw new HttpError(403, 'ORIGIN_NOT_ALLOWED');
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Max-Age': '600', 'Vary': 'Origin',
  };
}
