import type { ApiRequest } from '../../supabase/functions/_shared/contracts';

const url = import.meta.env.PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const key = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && key && !url.includes('your-project') && !key.includes('your-'));
export class ApiError extends Error {
  constructor(public code: string, public status: number) { super(code); }
}
export async function api<T>(request: ApiRequest, accessToken?: string): Promise<T> {
  if (!configured) throw new ApiError('NOT_CONFIGURED', 503);
  const response = await fetch(`${url}/functions/v1/wedding-api`, {
    method: 'POST', cache: 'no-store', referrerPolicy: 'no-referrer',
    headers: { 'Content-Type': 'application/json', apikey: key!, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    body: JSON.stringify(request), signal: AbortSignal.timeout(15000),
  });
  const body = await response.json();
  if (!response.ok) throw new ApiError(body.error ?? 'UNAVAILABLE', response.status);
  return body as T;
}
export function invitationToken(pathname: string): string | null {
  const match = /^\/i\/([a-f0-9]{64})\/?$/.exec(pathname);
  return match?.[1] ?? null;
}
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'DUPLICATE_GUEST') return 'No se importó el lote: ya existe una invitación con el mismo nombre y teléfono (incluidas las archivadas). Revisa la lista y elimina esa fila del CSV.';
    if (error.code === 'BATCH_CONFLICT') return 'El lote cambió. Selecciona de nuevo el archivo y revisa la vista previa.';
    if (error.code === 'RESET_CHANGED') return 'Las invitaciones o respuestas cambiaron. Cancela y vuelve a preparar el reinicio para revisar el total actualizado.';
    if (error.code === 'INVALID_LINK') return 'Esta invitación no está disponible. Solicita tu enlace a la pareja.';
    if (error.code === 'DEADLINE_PASSED') return 'El plazo para responder ha terminado. Contacta a la pareja.';
    if (error.status === 400) return 'Revisa los datos y la fecha límite antes de intentar de nuevo.';
    if (error.status === 429) return 'Has realizado varios intentos. Espera unos minutos antes de intentar de nuevo.';
    if (error.status === 401 || error.status === 403) return 'Tu sesión no tiene acceso. Inicia sesión con una cuenta autorizada.';
    if (error.code === 'NOT_CONFIGURED') return 'Las confirmaciones aún no están disponibles. Contacta a la pareja.';
  }
  return 'No pudimos conectar. Revisa tu conexión e intenta de nuevo.';
}
