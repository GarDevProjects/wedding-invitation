import { useCallback, useEffect, useRef, useState, type SubmitEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { api, ApiError, errorMessage } from '../lib/api';
import { wedding } from '../config/wedding';
import { formatDate } from '../lib/dates';
import { filterInvitations, fromCostaRicaInput, invitationsCsv, statusLabels, toCostaRicaInput } from '../lib/admin';
import { guestFields, type AdminInvitation, type AdminSnapshot, type ApiRequest } from '../../supabase/functions/_shared/contracts';
import AdminBulkTools from './AdminBulkTools';
import AdminOverview from './AdminOverview';
import AdminIcon from './AdminIcon';
import { downloadCsv } from '../lib/import-invitations';

type AdminView = 'overview' | 'guests' | 'import' | 'reset';

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
  const [view, setView] = useState<AdminView>('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState<AdminInvitation | null>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [latestLink, setLatestLink] = useState<{ id: string; url: string } | null>(null);
  const requestNumber = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (deleting) deleteDialog.current?.showModal(); else deleteDialog.current?.close(); }, [deleting]);
  useEffect(() => {
    const closeMenu = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', closeMenu);
    return () => document.removeEventListener('keydown', closeMenu);
  }, []);

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
    setSnapshot(null); setLinks({}); setLatestLink(null); setMessage(''); setDeleting(null); setView('overview'); setMenuOpen(false);
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
      if ((request.action === 'revoke' || request.action === 'archive' || request.action === 'delete') && 'id' in request) {
        setLinks(previous => { const next = { ...previous }; delete next[request.id]; return next; });
        setLatestLink(previous => previous?.id === request.id ? null : previous);
      }
      if (request.action === 'delete') {
        setSnapshot(previous => {
          if (!previous) return previous;
          const invitations = previous.invitations.filter(row => row.id !== request.id);
          const active = invitations.filter(row => !row.archived_at);
          const count = (status: string) => active.filter(row => row.status === status).length;
          return { invitations, fetched_at: new Date().toISOString(), metrics: {
            total: active.length, sent: active.filter(row => row.sent_at).length,
            accepted: count('accepted'), declined: count('declined'), pending: count('pending'),
            response_rate: active.length ? Math.round((count('accepted') + count('declined')) / active.length * 1000) / 10 : 0,
          } };
        });
        if (editing?.id === request.id) { setEditing(null); setFormVisible(false); }
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
    setView('guests'); setMenuOpen(false); setEditing(row); setFormVisible(true);
    setTimeout(() => { formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); formRef.current?.querySelector('input')?.focus(); }, 0);
  };
  const logout = async () => {
    const { error } = await supabase!.auth.signOut({ scope: 'local' });
    if (error) setMessage('No pudimos cerrar la sesión. Intenta de nuevo.');
  };
  if (!ready) return <main className="admin-auth"><p role="status">Cargando administración…</p></main>;
  if (!supabase) return <main className="admin-auth"><div className="admin-login"><div className="admin-auth-brand"><AdminIcon name="overview" /> Invitaciones</div><h1>Configuración pendiente</h1><p>Configura las variables públicas de Supabase y vuelve a compilar. Consulta <code>MANUAL_SETUP.md</code> en el repositorio.</p><a href="/">Volver a la invitación</a></div></main>;
  if (!session) return <main className="admin-auth"><div className="admin-login"><div className="admin-auth-brand"><AdminIcon name="overview" /> Invitaciones</div><h1>Inicia sesión</h1><p>Gestiona invitados, envíos y respuestas desde un solo lugar.</p>
    <form onSubmit={login} className="admin-form"><label>Correo<input name="email" type="email" autoComplete="username" placeholder="tu@correo.com" required /></label><label>Contraseña<input name="password" type="password" autoComplete="current-password" required /></label><button className="button button--dark" disabled={busy}>{busy ? 'Iniciando sesión…' : 'Iniciar sesión'}</button></form>
    <p className="admin-notice" role="status">{message}</p><a href="/">Volver a la invitación</a></div></main>;
  const rows = filterInvitations(snapshot?.invitations ?? [], search, filter, archived);
  const metrics = snapshot?.metrics;
  const navigate = (next: AdminView) => { setView(next); setMenuOpen(false); };
  const showFilter = (next: string) => { setFilter(next); setArchived(false); setSearch(''); navigate('guests'); };
  const headings = { overview: ['Resumen', 'Una vista general de tus invitaciones y respuestas.'], guests: ['Lista de invitados', 'Organiza tus invitados y administra cada invitación.'], import: ['Importar invitaciones desde CSV', 'Carga varios invitados y genera sus enlaces en un solo paso.'], reset: ['Herramientas de prueba', 'Reinicia las invitaciones cuando necesites comenzar de cero.'] };
  return <div className="admin-app">
    <a href="#admin-main" className="admin-skip">Saltar al contenido</a>
    {menuOpen && <button className="admin-menu-backdrop" aria-label="Cerrar menú lateral" onClick={() => setMenuOpen(false)} />}
    <aside id="admin-sidebar" className={`admin-sidebar${menuOpen ? ' is-open' : ''}`} aria-label="Menú lateral">
      <div className="admin-brand"><span><AdminIcon name="overview" /></span><div><strong>Invitaciones</strong><small>Panel de administración</small></div><button className="admin-menu-close" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)}><AdminIcon name="close" /></button></div>
      <div className="admin-event"><span>EVENTO</span><strong>Akion & Mariamalia</strong><small>29 de enero de 2027</small></div>
      <nav aria-label="Navegación de administración">
        {([
          ['overview', 'Resumen', 'overview'], ['guests', 'Invitados', 'guests'], ['import', 'Importar CSV', 'import'], ['reset', 'Herramientas de prueba', 'reset'],
        ] as const).map(([target,label,icon]) => <button key={target} aria-current={view === target ? 'page' : undefined} onClick={() => navigate(target)}><AdminIcon name={icon} /><span>{label}</span>{target === 'guests' && metrics && <small>{metrics.total}</small>}</button>)}
      </nav>
      <a className="admin-public-link" href="/" target="_blank" rel="noopener noreferrer"><AdminIcon name="external" /> Ver invitación pública</a>
      <div className="admin-account"><div className="admin-avatar" aria-hidden="true">{session.user.email?.slice(0, 1).toUpperCase() || 'A'}</div><div><strong>Administrador</strong><span title={session.user.email}>{session.user.email}</span></div><button aria-label="Cerrar sesión" title="Cerrar sesión" disabled={busy} onClick={logout}><AdminIcon name="logout" /></button></div>
    </aside>
    <main className="admin-workspace" id="admin-main" tabIndex={-1}>
      <div className="admin-topbar"><button className="button admin-menu-toggle" aria-expanded={menuOpen} aria-controls="admin-sidebar" onClick={() => setMenuOpen(!menuOpen)}><AdminIcon name="menu" /> Menú</button><span>Administración / {headings[view][0]}</span><div className="admin-connection"><i className={connection === 'En vivo' ? 'is-live' : ''} aria-hidden="true" />{connection}</div></div>
      <div className="admin-content">
        <header className="admin-header"><div><h1>{headings[view][0]}</h1><p>{headings[view][1]}</p></div><div className="admin-header-actions"><button className="button" disabled={busy || !snapshot} onClick={() => navigate('import')}><AdminIcon name="import" /> Importar invitaciones desde CSV</button><button className="button button--dark" disabled={busy || !snapshot} onClick={() => edit(null)}><AdminIcon name="plus" /> Nueva invitación</button></div></header>
        <div className="admin-utility-bar"><span>{snapshot ? `Actualizado ${formatDate(snapshot.fetched_at, { hour: '2-digit', minute: '2-digit' })}` : 'Verificando acceso…'}</span><div><button className="text-link" disabled={busy} onClick={() => void refresh()}>Actualizar</button><button className="text-link admin-danger-link" disabled={busy || !snapshot} onClick={() => navigate('reset')}>Reiniciar invitaciones</button></div></div>
        {message && <p className="admin-notice" role="status" aria-live="polite">{message}</p>}
        {!snapshot ? <section className="admin-card admin-empty"><p>{message ? 'No se pudo cargar la lista de invitados.' : 'Verificando acceso y cargando invitaciones…'}</p><button className="button" onClick={() => void refresh()}>Reintentar</button></section> : <>
          {view === 'overview' && <AdminOverview snapshot={snapshot} onFilter={showFilter} />}
          <AdminBulkTools key={userId} activeTab={view === 'import' ? 'import' : view === 'reset' ? 'reset' : null} links={links} defaultDeadline={wedding.rsvpDeadline} busy={busy} setBusy={setBusy} request={authorizedRequest} refresh={refresh}
            onImported={items => setLinks(previous => ({ ...previous, ...Object.fromEntries(items.map(item => [item.id, `${location.origin}/i/${item.token}`])) }))}
            onReset={() => {
              setLinks({}); setLatestLink(null); setEditing(null); setFormVisible(false); setSearch(''); setFilter('all'); setArchived(false); setMessage('');
              setSnapshot(previous => previous && { invitations: [], metrics: { total: 0, sent: 0, pending: 0, accepted: 0, declined: 0, response_rate: 0 }, fetched_at: new Date().toISOString() });
            }} />
          {view === 'guests' && <>
            {latestLink && <aside className="admin-link"><strong>Guarda este enlace personal</strong><p>El enlace completo solo está disponible durante esta sesión. Si lo pierdes, genera uno nuevo y comparte el enlace actualizado.</p><div className="admin-link-copy"><input aria-label="Enlace personal recién generado" readOnly value={latestLink.url} onFocus={event => event.target.select()} /><button className="button" onClick={() => void copy(latestLink.url)}>Copiar enlace</button></div></aside>}
            {formVisible && <section className="admin-card"><form key={editing?.id ?? 'new'} ref={formRef} className="admin-form admin-editor" onSubmit={saveGuest}><div className="admin-card-heading"><h2>{editing ? 'Editar invitación' : 'Un nuevo invitado'}</h2><button type="button" className="admin-icon-button" aria-label="Cerrar formulario" disabled={busy} onClick={() => setFormVisible(false)}><AdminIcon name="close" /></button></div><div className="admin-form-grid"><label>Nombre completo<input name="full_name" minLength={2} maxLength={120} required defaultValue={editing?.full_name ?? ''} /></label><label>Teléfono (opcional, incluye código de país)<input name="phone" type="tel" maxLength={30} defaultValue={editing?.phone ?? ''} /></label><label>Fecha límite · hora de Costa Rica<input name="expires_at" type="datetime-local" step="1" required defaultValue={toCostaRicaInput(editing?.expires_at ?? wedding.rsvpDeadline)} /></label></div><div className="admin-form-actions"><button className="button button--dark" disabled={busy}>Guardar</button><button className="button" type="button" disabled={busy} onClick={() => setFormVisible(false)}>Cancelar</button></div></form></section>}
            <section className="admin-card admin-guest-list" aria-label="Gestión de invitados">
              <div className="admin-list-heading"><div><h2>Invitaciones {archived ? 'archivadas' : 'activas'}</h2><p>{rows.length} invitaciones en esta vista</p></div><button className="button" onClick={() => downloadCsv(invitationsCsv(rows), 'invitaciones.csv')}>Exportar vista CSV ({rows.length})</button></div>
              <div className="admin-filters"><label>Buscar por nombre<input type="search" placeholder="Buscar un invitado…" value={search} onChange={event => setSearch(event.target.value)} /></label><label>Estado<select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">Todos</option><option value="pending">Pendientes</option><option value="accepted">Confirmados</option><option value="declined">No asistirán</option><option value="not_sent">Sin enviar</option></select></label><label className="admin-check"><input type="checkbox" checked={archived} onChange={event => setArchived(event.target.checked)} /> Ver archivadas</label></div>
              <div className="admin-table-wrap"><table className="admin-table"><caption className="sr-only">Invitaciones y respuestas</caption><thead><tr><th>Invitado</th><th>Respuesta</th><th>Envío</th><th>Fecha límite</th><th>Acciones</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}>
                <td><strong>{row.full_name}</strong>{row.phone && <small>{row.phone}</small>}{row.notes && <p className="admin-note">{row.notes}</p>}{row.revoked && <small className="admin-danger-text">Enlace revocado</small>}</td>
                <td><span className={`status-badge status-badge--${row.status}`}>{statusLabels[row.status]}</span>{row.responded_at && <small>{formatDate(row.updated_at, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</small>}</td>
                <td><span className={`admin-send-status${row.sent_at ? ' is-sent' : ''}`}>{row.sent_at ? 'Enviada' : 'Sin enviar'}</span>{row.sent_at && <small>{formatDate(row.sent_at, { day: 'numeric', month: 'short' })}</small>}</td>
                <td>{formatDate(row.expires_at, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                <td><div className="admin-actions"><button disabled={busy} onClick={() => edit(row)}>Editar</button>
                  {!row.archived_at && <>
                    {links[row.id] && !row.revoked ? <><button disabled={busy} onClick={() => void copy(links[row.id])}>Copiar</button><a target="_blank" rel="noopener noreferrer" href={`https://wa.me/${row.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${row.full_name}, queremos celebrar contigo. Tu invitación personal: ${links[row.id]}`)}`}>WhatsApp ↗</a></> : <button disabled={busy} onClick={() => { if (confirm(`¿Generar un enlace nuevo para ${row.full_name}? El enlace anterior dejará de funcionar. Deberás reenviarlo.`)) void mutate({ action: 'rotate', id: row.id }, 'Enlace renovado. Recuerda compartir el nuevo enlace.'); }}>Generar enlace nuevo</button>}
                    {!row.sent_at && <button disabled={busy || row.revoked} onClick={() => void mutate({ action: 'sent', id: row.id }, 'Marcada como enviada.')}>Marcar enviada</button>}
                    {!row.revoked && <button disabled={busy} onClick={() => { if (confirm(`¿Revocar el enlace de ${row.full_name}?`)) void mutate({ action: 'revoke', id: row.id }, 'Enlace revocado.'); }}>Revocar</button>}
                  </>}
                  <button disabled={busy} onClick={() => { if (confirm(row.archived_at ? '¿Restaurar esta invitación?' : '¿Archivar esta invitación? Su enlace quedará inactivo y saldrá de los totales.')) void mutate({ action: 'archive', id: row.id, archived: !row.archived_at }, row.archived_at ? 'Invitación restaurada.' : 'Invitación archivada.'); }}>{row.archived_at ? 'Restaurar' : 'Archivar'}</button>
                  <button className="admin-delete-button" disabled={busy} onClick={() => { setMessage(''); setDeleting(row); }}><AdminIcon name="trash" /> Eliminar</button>
                </div></td>
              </tr>)}</tbody></table>{!rows.length && <div className="admin-empty"><AdminIcon name="guests" /><strong>No hay invitaciones en esta vista.</strong><p>{search || filter !== 'all' ? 'Prueba con otro nombre o cambia los filtros.' : archived ? 'Las invitaciones que archives aparecerán aquí.' : 'Crea una invitación o importa tus invitados desde un CSV.'}</p></div>}</div>
            </section>
          </>}
        </>}
      </div>
    </main>
    <dialog className="admin-dialog" ref={deleteDialog} aria-labelledby="delete-title" onCancel={event => { if (busy) event.preventDefault(); }} onClose={() => setDeleting(null)}>
      {deleting && <><div className="admin-dialog-icon"><AdminIcon name="trash" /></div><h2 id="delete-title">¿Eliminar esta invitación?</h2><p>Se eliminará permanentemente la invitación de <strong>{deleting.full_name}</strong>, su respuesta y su historial. Su enlace dejará de funcionar.</p><p className="fine-print">Esta acción no se puede deshacer. Si solo deseas ocultarla, puedes archivarla.</p>{message && <p role="alert" className="admin-danger-text">{message}</p>}<div className="admin-dialog-actions"><button className="button" disabled={busy} onClick={() => setDeleting(null)}>Cancelar</button><button className="button button--danger" disabled={busy} onClick={async () => { if (await mutate({ action: 'delete', id: deleting.id }, 'Invitación eliminada permanentemente.')) setDeleting(null); }}>{busy ? 'Eliminando…' : 'Eliminar invitación'}</button></div></>}
    </dialog>
  </div>;
}
