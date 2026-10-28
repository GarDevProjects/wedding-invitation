import { useCallback, useEffect, useRef, useState, type SubmitEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { api, ApiError, errorMessage } from '../lib/api';
import { wedding } from '../config/wedding';
import { formatDate } from '../lib/dates';
import { filterInvitations, fromCostaRicaInput, invitationsCsv, statusLabels, toCostaRicaInput } from '../lib/admin';
import { guestFields, type AdminInvitation, type AdminSnapshot, type ApiRequest } from '../../supabase/functions/_shared/contracts';

export default function AdminDashboard() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [connection, setConnection] = useState('Conectando…');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<AdminInvitation | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [latestLink, setLatestLink] = useState<{ id: string; url: string } | null>(null);
  const requestNumber = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);
  const authorizedRequest = useCallback(async <T,>(request: ApiRequest) => {
    const { data, error } = await supabase!.auth.getSession();
    if (error || !data.session) throw new ApiError('UNAUTHORIZED', 401);
    return api<T>(request, data.session.access_token);
  }, []);
  const refresh = useCallback(async () => {
    const sequence = ++requestNumber.current;
    try {
      const data = await authorizedRequest<AdminSnapshot>({ action: 'list' });
      if (sequence === requestNumber.current) setSnapshot(data);
      return true;
    } catch (error) {
      if (sequence === requestNumber.current) {
        setMessage(errorMessage(error));
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) setSnapshot(null);
        setConnection('Sin conexión · reintento cada 30 segundos');
      }
      return false;
    }
  }, [authorizedRequest]);
  const userId = session?.user.id;
  useEffect(() => {
    setSnapshot(null); setLinks({}); setLatestLink(null); setMessage('');
    if (!userId || !supabase) return;
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    let debounce: ReturnType<typeof setTimeout>;
    const changed = () => { clearTimeout(debounce); debounce = setTimeout(() => { void refresh(); }, 300); };
    void refresh().then(authorized => {
      if (!active || !authorized) return;
      channel = supabase!.channel(`admin-${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'invitations' }, changed)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rsvps' }, changed)
        .subscribe(status => {
          if (!active) return;
          setConnection(status === 'SUBSCRIBED' ? 'En vivo' : 'Reconectando · actualización cada 30 segundos');
          if (status === 'SUBSCRIBED') void refresh();
        });
    });
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 30000);
    const online = () => { void refresh(); };
    const offline = () => setConnection('Sin conexión · reintentaremos al reconectar');
    addEventListener('online', online); addEventListener('offline', offline);
    const visible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => {
      active = false; ++requestNumber.current; clearTimeout(debounce); clearInterval(timer);
      removeEventListener('online', online); removeEventListener('offline', offline); document.removeEventListener('visibilitychange', visible);
      if (channel) void supabase!.removeChannel(channel);
    };
  }, [userId, refresh]);

  const login = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setMessage('');
    const fields = new FormData(event.currentTarget);
    const { error } = await supabase!.auth.signInWithPassword({ email: String(fields.get('email')).trim(), password: String(fields.get('password')) });
    if (error) setMessage('No pudimos iniciar sesión. Verifica tu correo y contraseña.');
    setBusy(false);
  };
  const mutate = async (request: ApiRequest, success: string) => {
    setBusy(true); setMessage('');
    try {
      const result = await authorizedRequest<{ id?: string; token?: string }>(request);
      if (result.id && result.token) {
        const url = `${location.origin}/i/${result.token}`;
        setLinks(previous => ({ ...previous, [result.id!]: url })); setLatestLink({ id: result.id, url });
      }
      if ((request.action === 'revoke' || request.action === 'archive') && 'id' in request) {
        setLinks(previous => { const next = { ...previous }; delete next[request.id]; return next; });
        setLatestLink(previous => previous?.id === request.id ? null : previous);
      }
      setMessage(success); await refresh(); return true;
    } catch (error) { setMessage(errorMessage(error)); return false; }
    finally { setBusy(false); }
  };
  const saveGuest = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    let expiry: string;
    try { expiry = fromCostaRicaInput(String(fields.get('expires_at'))); }
    catch { setMessage('Indica una fecha límite válida.'); return; }
    const validation = guestFields.safeParse({ full_name: fields.get('full_name'), phone: fields.get('phone'), expires_at: expiry });
    if (!validation.success || new Date(expiry).getTime() <= Date.now()) { setMessage('Revisa el nombre, contacto y una fecha límite futura.'); return; }
    const saved = await mutate(editing ? { action: 'edit', id: editing.id, ...validation.data } : { action: 'create', ...validation.data }, editing ? 'Invitación actualizada.' : 'Invitación creada. Guarda el enlace antes de salir.');
    if (saved) { setFormVisible(false); setEditing(null); }
  };
  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); setMessage('Enlace copiado.'); }
    catch { setMessage('Selecciona y copia el enlace visible.'); }
  };
  const edit = (row: AdminInvitation | null) => {
    setEditing(row); setFormVisible(true);
    setTimeout(() => { formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); formRef.current?.querySelector('input')?.focus(); }, 0);
  };
  const logout = async () => {
    const { error } = await supabase!.auth.signOut({ scope: 'local' });
    if (error) setMessage('No pudimos cerrar la sesión. Intenta de nuevo.');
  };
  if (!ready) return <p role="status">Cargando administración…</p>;
  if (!supabase) return <div className="admin-login"><p className="eyebrow">Administración</p><h1>Configuración pendiente</h1><p>Configura las variables públicas de Supabase y vuelve a compilar. Consulta <code>MANUAL_SETUP.md</code> en el repositorio.</p><a href="/">Volver a la invitación</a></div>;
  if (!session) return <div className="admin-login"><p className="eyebrow">Akion & Mariamalia</p><h1>Un día para recordar.<br />Todo en orden.</h1><p>Administración de invitaciones</p>
    <form onSubmit={login} className="admin-form"><label>Correo<input name="email" type="email" autoComplete="username" required /></label><label>Contraseña<input name="password" type="password" autoComplete="current-password" required /></label><button className="button button--dark" disabled={busy}>Iniciar sesión</button></form>
    <p role="status">{message}</p><a href="/">Volver a la invitación</a></div>;
  const rows = filterInvitations(snapshot?.invitations ?? [], search, filter, archived);
  const metrics = snapshot?.metrics;
  const recent = (snapshot?.invitations ?? []).filter(row => row.responded_at && !row.archived_at).sort((a,b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5);
  return <>
    <header className="admin-header"><div><p className="eyebrow">Akion & Mariamalia · 29.01.2027</p><h1>Lista de invitados</h1><p>Una invitación. Una persona. Un lugar.</p></div><div className="flex flex-wrap gap-3"><a className="text-link" href="/">Ver invitación</a><button className="text-link" onClick={logout}>Cerrar sesión</button></div></header>
    <p className="admin-status"><span>{connection}</span>{snapshot && <span>Última actualización: {formatDate(snapshot.fetched_at, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}</p>
    <p className="admin-notice" role="status" aria-live="polite">{message}</p>
    {!snapshot ? <div><p>{message ? "No se pudo cargar la lista de invitados." : "Verificando acceso y cargando invitaciones…"}</p><button className="button" onClick={() => void refresh()}>Reintentar</button></div> : <>
      <section className="admin-metrics" aria-label="Resumen de asistencia">{[
        ['Personas invitadas', metrics!.total], ['Enviadas', metrics!.sent], ['Confirmados · asientos', metrics!.accepted], ['No asistirán', metrics!.declined], ['Pendientes', metrics!.pending], ['Respuestas', `${metrics!.response_rate}%`],
      ].map(([label,value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>
      <p className="fine-print">Totales de invitaciones sin archivar. Tasa de respuesta = (confirmados + declinados) / personas invitadas. Cada confirmación equivale a un asiento.</p>
      <div className="admin-toolbar"><button className="button button--dark" disabled={busy} onClick={() => edit(null)}>Nueva invitación</button><button className="button" disabled={busy} onClick={() => void refresh()}>Actualizar</button><button className="button" onClick={() => {
        const url = URL.createObjectURL(new Blob([invitationsCsv(rows)], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url; link.download = 'invitaciones.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}>Exportar vista CSV ({rows.length})</button></div>
      {latestLink && <aside className="admin-link"><strong>Guarda este enlace personal</strong><p>El enlace completo solo está disponible durante esta sesión. Si lo pierdes, genera uno nuevo; el anterior dejará de funcionar.</p><input aria-label="Enlace personal recién generado" readOnly value={latestLink.url} onFocus={event => event.target.select()} /><button className="text-link" onClick={() => void copy(latestLink.url)}>Copiar enlace</button></aside>}
      {formVisible && <form key={editing?.id ?? 'new'} ref={formRef} className="admin-form admin-editor" onSubmit={saveGuest}><h2>{editing ? 'Editar invitación' : 'Un nuevo invitado'}</h2><label>Nombre completo<input name="full_name" minLength={2} maxLength={120} required defaultValue={editing?.full_name ?? ''} /></label><label>Teléfono (opcional, incluye código de país)<input name="phone" type="tel" maxLength={30} defaultValue={editing?.phone ?? ''} /></label><label>Fecha límite · hora de Costa Rica<input name="expires_at" type="datetime-local" step="1" required defaultValue={toCostaRicaInput(editing?.expires_at ?? wedding.rsvpDeadline)} /></label><div className="flex flex-wrap gap-3"><button className="button button--dark" disabled={busy}>Guardar</button><button className="button" type="button" disabled={busy} onClick={() => setFormVisible(false)}>Cancelar</button></div></form>}
      <section className="admin-filters" aria-label="Filtrar invitaciones"><label>Buscar por nombre<input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label><label>Estado<select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">Todos</option><option value="pending">Pendientes</option><option value="accepted">Confirmados</option><option value="declined">No asistirán</option><option value="not_sent">Sin enviar</option></select></label><label className="admin-check"><input type="checkbox" checked={archived} onChange={event => setArchived(event.target.checked)} /> Ver archivadas</label></section>
      <p>{rows.length} invitaciones en esta vista</p>
      <div className="admin-table-wrap"><table className="admin-table"><caption className="sr-only">Invitaciones y respuestas</caption><thead><tr><th>Invitado</th><th>Respuesta</th><th>Envío</th><th>Fecha límite</th><th>Acciones</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}>
        <td><strong>{row.full_name}</strong>{row.phone && <small>{row.phone}</small>}{row.notes && <p className="admin-note">{row.notes}</p>}{row.revoked && <small>Enlace revocado</small>}</td>
        <td><span className={`status-badge status-badge--${row.status}`}>{statusLabels[row.status]}</span>{row.responded_at && <small>{formatDate(row.updated_at, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</small>}</td>
        <td>{row.sent_at ? formatDate(row.sent_at, { day: 'numeric', month: 'short' }) : 'Sin enviar'}</td>
        <td>{formatDate(row.expires_at, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
        <td><div className="admin-actions"><button disabled={busy} onClick={() => edit(row)}>Editar</button>
          {!row.archived_at && <>
            {links[row.id] && !row.revoked ? <><button disabled={busy} onClick={() => void copy(links[row.id])}>Copiar</button><a target="_blank" rel="noopener noreferrer" href={`https://wa.me/${row.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${row.full_name}, queremos celebrar contigo. Tu invitación personal: ${links[row.id]}`)}`}>WhatsApp ↗</a></> : <button disabled={busy} onClick={() => { if (confirm(`¿Generar un enlace nuevo para ${row.full_name}? El enlace anterior dejará de funcionar. Deberás reenviarlo.`)) void mutate({ action: 'rotate', id: row.id }, 'Enlace renovado. Recuerda compartir el nuevo enlace.'); }}>Generar enlace nuevo</button>}
            {!row.sent_at && <button disabled={busy || row.revoked} onClick={() => void mutate({ action: 'sent', id: row.id }, 'Marcada como enviada.')}>Marcar enviada</button>}
            {!row.revoked && <button disabled={busy} onClick={() => { if (confirm(`¿Revocar el enlace de ${row.full_name}?`)) void mutate({ action: 'revoke', id: row.id }, 'Enlace revocado.'); }}>Revocar</button>}
          </>}
          <button disabled={busy} onClick={() => { if (confirm(row.archived_at ? '¿Restaurar esta invitación?' : '¿Archivar esta invitación? Su enlace quedará inactivo y saldrá de los totales.')) void mutate({ action: 'archive', id: row.id, archived: !row.archived_at }, row.archived_at ? 'Invitación restaurada.' : 'Invitación archivada.'); }}>{row.archived_at ? 'Restaurar' : 'Archivar'}</button>
        </div></td>
      </tr>)}</tbody></table>{!rows.length && <p className="admin-empty">No hay invitaciones en esta vista.</p>}</div>
      <section className="admin-recent"><h2>Respuestas recientes</h2>{recent.length ? <ul>{recent.map(row => <li key={row.id}><strong>{row.full_name}</strong> · {statusLabels[row.status]} <span>{formatDate(row.updated_at, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span></li>)}</ul> : <p>Aún no hay respuestas.</p>}</section>
    </>}
  </>;
}
