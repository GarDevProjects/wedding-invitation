import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { seatingTableFields, type AdminSnapshot, type ApiRequest, type SeatingTable } from '../../supabase/functions/_shared/contracts';
import { errorMessage } from '../lib/api';
import { statusLabels } from '../lib/admin';
import AdminIcon from './AdminIcon';

interface Props {
  active: boolean; snapshot: AdminSnapshot; busy: boolean;
  setBusy: (value: boolean) => void;
  request: <T>(input: ApiRequest) => Promise<T>;
  refresh: () => Promise<boolean>;
}

export default function AdminSeating({ active, snapshot, busy, setBusy, request, refresh }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SeatingTable | null>(null);
  const [message, setMessage] = useState('');
  const [assignmentTableId, setAssignmentTableId] = useState<string | null>(null);
  const [selectedGuests, setSelectedGuests] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [includeAssigned, setIncludeAssigned] = useState(false);
  const [deleting, setDeleting] = useState<SeatingTable | null>(null);
  const assignDialog = useRef<HTMLDialogElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const pending = useRef(false);
  const editor = useRef<HTMLFormElement>(null);
  const container = useRef<HTMLElement>(null);
  const restoreFocus = () => requestAnimationFrame(() => {
    const target = container.current?.querySelector<HTMLButtonElement>('.admin-seating-card[aria-pressed=true]') ?? container.current?.querySelector<HTMLButtonElement>('[data-new-table]');
    target?.focus({ preventScroll: true });
  });
  useEffect(() => { if (assignmentTableId) assignDialog.current?.showModal(); else assignDialog.current?.close(); }, [assignmentTableId]);
  useEffect(() => { if (deleting) deleteDialog.current?.showModal(); else deleteDialog.current?.close(); }, [deleting]);

  const plan = snapshot.seating;
  const tables = plan?.tables ?? [];
  const assignments = plan?.assignments ?? [];
  const guests = new Map(snapshot.invitations.map(guest => [guest.id, guest]));
  const guestTables = new Map(assignments.map(assignment => [assignment.invitation_id, assignment.table_id]));
  const tableNames = new Map(tables.map(table => [table.id, table.name]));
  const members = (tableId: string) => assignments.filter(assignment => assignment.table_id === tableId);
  const countStatus = (tableId: string, status: string) => members(tableId).filter(member => guests.get(member.invitation_id)?.status === status).length;
  const selectedTable = tables.find(table => table.id === selectedId) ?? tables[0];
  const assignmentTable = tables.find(table => table.id === assignmentTableId);
  const available = assignmentTable ? assignmentTable.capacity - members(assignmentTable.id).length : 0;
  const candidates = snapshot.invitations.filter(guest => !guest.archived_at && guest.status !== 'declined' && guestTables.get(guest.id) !== assignmentTableId && (includeAssigned || !guestTables.has(guest.id)));
  const eligibleIds = new Set(candidates.map(guest => guest.id));
  const selection = selectedGuests.filter(id => eligibleIds.has(id));
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
  const filtered = candidates.filter(guest => normalize(guest.full_name).includes(normalize(search)));
  const confirmedWithoutTable = snapshot.invitations.filter(guest => !guest.archived_at && guest.status === 'accepted' && !guestTables.has(guest.id)).length;
  const capacity = tables.reduce((sum, table) => sum + table.capacity, 0);

  const commit = async (input: ApiRequest, success: string) => {
    if (pending.current || busy) return null;
    pending.current = true; setBusy(true); setMessage('');
    try {
      const result = await request<{ id?: string }>(input);
      await refresh(); setMessage(success); return result;
    } catch (error) { setMessage(errorMessage(error)); return null; }
    finally { pending.current = false; setBusy(false); }
  };
  const openEditor = (table: SeatingTable | null) => {
    setEditing(table); setEditorOpen(true); setMessage('');
    setTimeout(() => { editor.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); editor.current?.querySelector('input')?.focus(); }, 0);
  };
  const saveTable = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const validation = seatingTableFields.safeParse({ name: fields.get('name'), capacity: Number(fields.get('capacity')) });
    if (!validation.success) { setMessage('Indica un nombre de 2 a 60 caracteres y una capacidad de 1 a 100 personas.'); return; }
    const result = await commit(editing ? { action: 'seating_edit', id: editing.id, ...validation.data } : { action: 'seating_create', ...validation.data }, editing ? 'Mesa actualizada.' : 'Mesa creada. Ya puedes asignar invitados.');
    if (result) { if (result.id) setSelectedId(result.id); setEditorOpen(false); setEditing(null); }
  };
  const openAssignment = () => {
    if (!selectedTable) return;
    setMessage(''); setSearch(''); setSelectedGuests([]); setIncludeAssigned(false); setAssignmentTableId(selectedTable.id);
  };
  const assign = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!assignmentTable || !selection.length || selection.length > available) return;
    if (await commit({ action: 'seating_assign', table_id: assignmentTable.id, invitation_ids: selection }, `${selection.length} ${selection.length === 1 ? 'persona asignada' : 'personas asignadas'} a ${assignmentTable.name}.`)) setAssignmentTableId(null);
  };

  if (!plan) return <section hidden={!active} className="admin-card"><h2>Configuración de mesas pendiente</h2><p>Actualiza la base de datos y la función de Supabase con la migración de mesas. Consulta <code>ADMIN_MESAS.md</code>.</p></section>;
  return <section ref={container} className="admin-seating" hidden={!active} aria-label="Organización de mesas">
    <div className="admin-seating-toolbar"><p className="fine-print">Organización interna: los invitados no ven las mesas ni sus asignaciones.</p><button data-new-table className="button button--dark" disabled={busy} onClick={() => openEditor(null)}><AdminIcon name="plus" /> Nueva mesa</button></div>
    <div className="admin-metrics admin-seating-metrics">
      <article><span>Mesas creadas</span><strong>{tables.length}</strong><small>{capacity} plazas en total</small></article>
      <article><span>Plazas disponibles</span><strong>{capacity - assignments.length}</strong><small>{assignments.length} personas con lugar reservado</small></article>
      <article><span>Confirmados sin mesa</span><strong>{confirmedWithoutTable}</strong><small>Personas que ya confirmaron y necesitan lugar</small></article>
    </div>
    {message && <p role="status" className="admin-notice">{message}</p>}
    {editorOpen && <form key={editing?.id ?? 'new'} className="admin-card admin-form" ref={editor} onSubmit={saveTable}>
      <div className="admin-card-heading"><h2>{editing ? 'Editar mesa' : 'Crear mesa'}</h2><button className="admin-icon-button" type="button" aria-label="Cerrar formulario de mesa" disabled={busy} onClick={() => setEditorOpen(false)}><AdminIcon name="close" /></button></div>
      <div className="admin-form-grid"><label>Nombre de la mesa<input name="name" placeholder="Por ejemplo: Mesa 1 o Familia" minLength={2} maxLength={60} required defaultValue={editing?.name ?? ''} /></label><label>Capacidad (personas)<input name="capacity" type="number" inputMode="numeric" min={editing ? Math.max(1, members(editing.id).length) : 1} max={100} step={1} required defaultValue={editing?.capacity ?? 8} /></label></div>
      <p className="fine-print">Cada invitado ocupa una plaza, aunque todavía esté pendiente de confirmar. Para reducir la capacidad, primero quita o mueve a las personas que excedan el nuevo límite.</p>
      <div className="admin-form-actions"><button className="button button--dark" disabled={busy}>Guardar mesa</button><button className="button" type="button" disabled={busy} onClick={() => setEditorOpen(false)}>Cancelar</button></div>
    </form>}
    {!tables.length ? <div className="admin-card admin-empty"><AdminIcon name="tables" /><strong>Todavía no hay mesas</strong><p>Crea tu primera mesa, define su capacidad y comienza a distribuir a tus invitados.</p><button className="button" disabled={busy} onClick={() => openEditor(null)}>Crear primera mesa</button></div> : <div className="admin-seating-layout">
      <div className="admin-table-cards">{tables.map(table => {
        const occupied = members(table.id).length;
        const declined = countStatus(table.id, 'declined');
        return <button key={table.id} className="admin-seating-card" aria-pressed={selectedTable?.id === table.id} aria-label={`${table.name}, ${occupied} de ${table.capacity} plazas asignadas`} onClick={() => setSelectedId(table.id)}>
          <span className="admin-seating-card-title"><AdminIcon name="tables" /><strong>{table.name}</strong></span>
          <span className="admin-seat-count"><strong>{occupied}</strong> / {table.capacity}<small>plazas asignadas</small></span>
          <span className="admin-progress"><span style={{ width: `${occupied / table.capacity * 100}%` }} /></span>
          <span className="admin-seat-card-status"><span>Confirmados: {countStatus(table.id, 'accepted')}</span><span>Pendientes: {countStatus(table.id, 'pending')}</span></span>
          {declined > 0 && <span className="admin-danger-text">{declined} {declined === 1 ? 'persona no asistirá' : 'personas no asistirán'} · revisar lugares</span>}
          <span className="admin-seat-free">{occupied === table.capacity ? 'Mesa completa' : `${table.capacity - occupied} ${table.capacity - occupied === 1 ? 'plaza disponible' : 'plazas disponibles'}`}</span>
        </button>;
      })}</div>
      {selectedTable && <section className="admin-card admin-seating-detail" aria-label={`Detalle de ${selectedTable.name}`}>
        <div className="admin-card-heading"><div><h2>{selectedTable.name}</h2><p>{members(selectedTable.id).length} de {selectedTable.capacity} plazas asignadas</p></div><div className="admin-seat-table-actions"><button className="text-link" disabled={busy} onClick={() => openEditor(selectedTable)}>Editar mesa</button><button className="admin-icon-button admin-danger-text" aria-label="Eliminar mesa" disabled={busy} onClick={() => { setMessage(''); setDeleting(selectedTable); }}><AdminIcon name="trash" /></button></div></div>
        <button className="button" disabled={busy || members(selectedTable.id).length >= selectedTable.capacity} onClick={openAssignment}><AdminIcon name="plus" /> Asignar invitados</button>
        {members(selectedTable.id).length ? <ul className="admin-seat-members">{members(selectedTable.id).map(member => {
          const guest = guests.get(member.invitation_id);
          return <li key={member.invitation_id}><div className="admin-seat-person"><strong>{guest?.full_name ?? 'Invitado no disponible'}</strong><span className={`status-badge status-badge--${guest?.status ?? 'pending'}`}>{guest ? statusLabels[guest.status] : 'Actualizando'}</span></div><button className="text-link" disabled={busy} aria-label={`Quitar de la mesa a ${guest?.full_name ?? 'invitado'}`} onClick={() => void commit({ action: 'seating_assign', table_id: null, invitation_ids: [member.invitation_id] }, 'La persona quedó sin mesa asignada.')}>Quitar</button></li>;
        })}</ul> : <div className="admin-empty"><strong>Esta mesa aún está vacía</strong><p>Asigna invitados confirmados o pendientes para reservarles un lugar.</p></div>}
        {countStatus(selectedTable.id, 'declined') > 0 && <p className="admin-seat-warning">Hay personas que indicaron que no asistirán. Sus plazas siguen reservadas hasta que las quites de la mesa.</p>}
      </section>}
    </div>}
    <dialog ref={assignDialog} className="admin-dialog admin-seat-dialog" aria-labelledby="assign-title" onCancel={event => { if (busy) event.preventDefault(); }} onClose={() => { setAssignmentTableId(null); restoreFocus(); }}>
      <form onSubmit={assign}><h2 id="assign-title">Asignar invitados{assignmentTable ? ` a ${assignmentTable.name}` : ''}</h2>
        {!assignmentTable ? <p role="alert">Esta mesa ya no está disponible. Cierra esta ventana y actualiza la lista.</p> : <>
          <p>Plazas disponibles: {available} · Personas seleccionadas: {selection.length}</p>
          <label className="admin-seat-search">Buscar invitados para asignar<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nombre del invitado" /></label>
          <label className="admin-check admin-seat-move-toggle"><input type="checkbox" checked={includeAssigned} onChange={event => setIncludeAssigned(event.target.checked)} /> Incluir invitados de otras mesas</label>
          {includeAssigned && <p className="fine-print">Al asignarlos aquí, se moverán de su mesa anterior. Cada persona solo puede ocupar un lugar.</p>}
          <div className="admin-seat-options">{filtered.length ? filtered.map(guest => <label key={guest.id} className="admin-seat-option"><input type="checkbox" checked={selection.includes(guest.id)} onChange={event => setSelectedGuests(previous => event.target.checked ? [...previous, guest.id] : previous.filter(id => id !== guest.id))} /><span><strong>{guest.full_name}</strong><small>{guestTables.has(guest.id) ? `Actualmente: ${tableNames.get(guestTables.get(guest.id)!)}` : 'Sin mesa asignada'}</small></span><span className={`status-badge status-badge--${guest.status}`}>{statusLabels[guest.status]}</span></label>) : <p className="admin-empty">No hay invitados disponibles con estos filtros.</p>}</div>
          {selection.length > available && <p role="alert" className="admin-danger-text">La selección supera las {available} plazas disponibles. Selecciona menos personas o amplía la mesa.</p>}
        </>}
        {message && <p role="alert" className="admin-danger-text">{message}</p>}
        <div className="admin-dialog-actions"><button className="button" type="button" disabled={busy} onClick={() => setAssignmentTableId(null)}>Cancelar</button><button className="button button--dark" disabled={busy || !assignmentTable || !selection.length || selection.length > available}>Asignar {selection.length} {selection.length === 1 ? 'invitado' : 'invitados'}</button></div>
      </form>
    </dialog>
    <dialog ref={deleteDialog} className="admin-dialog" aria-labelledby="delete-table-title" onCancel={event => { if (busy) event.preventDefault(); }} onClose={() => { setDeleting(null); restoreFocus(); }}>
      {deleting && <><h2 id="delete-table-title">¿Eliminar la mesa {deleting.name}?</h2><p>Sus {members(deleting.id).length} personas quedarán sin mesa asignada. Sus invitaciones y confirmaciones se conservan.</p>{message && <p role="alert" className="admin-danger-text">{message}</p>}<div className="admin-dialog-actions"><button className="button" disabled={busy} onClick={() => setDeleting(null)}>Cancelar</button><button className="button button--danger" disabled={busy} onClick={async () => { if (await commit({ action: 'seating_delete', id: deleting.id }, 'Mesa eliminada. Sus invitados quedaron sin mesa asignada.')) { if (editing?.id === deleting.id) setEditorOpen(false); setDeleting(null); } }}>Eliminar mesa</button></div></>}
    </dialog>
  </section>;
}
