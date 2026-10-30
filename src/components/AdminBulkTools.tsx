import { useRef, useState, type ChangeEvent, type SubmitEvent } from 'react';
import { MAX_IMPORT_ROWS, RESET_CONFIRMATION, type ApiRequest, type ImportedInvitation, type ImportResult, type ResetPreview } from '../../supabase/functions/_shared/contracts';
import { parseInvitationsCsv, importTemplate, importedLinksCsv, downloadCsv, MAX_CSV_BYTES, type ImportPreview } from '../lib/import-invitations';
import { ApiError, errorMessage } from '../lib/api';
import { formatDate } from '../lib/dates';

interface Props {
  defaultDeadline: string;
  busy: boolean;
  setBusy: (value: boolean) => void;
  request: <T>(input: ApiRequest) => Promise<T>;
  refresh: () => Promise<boolean>;
  onImported: (rows: ImportedInvitation[]) => void;
  onReset: () => void;
}

export default function AdminBulkTools({ defaultDeadline, busy, setBusy, request, refresh, onImported, onReset }: Props) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [batchId, setBatchId] = useState('');
  const [filename, setFilename] = useState('');
  const [importMessage, setImportMessage] = useState('');
  const [imported, setImported] = useState<ImportedInvitation[]>([]);
  const [reset, setReset] = useState<ResetPreview | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const pending = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setPreview(null); setBatchId(''); setImportMessage(''); setFilename(file?.name ?? '');
    if (!file || pending.current) return;
    pending.current = true; setBusy(true);
    try {
      if (file.size > MAX_CSV_BYTES) throw new Error('El archivo supera 128 KB.');
      let text: string;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
      catch { throw new Error('No se pudo leer el archivo. Guárdalo como CSV UTF-8 y vuelve a seleccionarlo.'); }
      setPreview(parseInvitationsCsv(text, defaultDeadline)); setBatchId(crypto.randomUUID());
    } catch (error) { setImportMessage((error as Error).message); }
    finally { pending.current = false; setBusy(false); }
  };
  const importGuests = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending.current || busy || !preview?.guests.length || preview.errors.length || !batchId) return;
    pending.current = true; setBusy(true); setImportMessage('');
    try {
      const result = await request<ImportResult>({ action: 'import', batch_id: batchId, guests: preview.guests });
      if (result.already_imported) {
        setImportMessage(`Este lote de ${result.created_count} invitaciones ya se había guardado. No se crearon duplicados. Si perdiste los enlaces, usa «Generar enlace nuevo» en la lista.`);
      } else {
        const rows = result.invitations ?? [];
        setImported(rows); onImported(rows);
        setImportMessage(`${result.created_count} invitaciones creadas. Descarga sus enlaces antes de salir de esta página.`);
      }
      setPreview(null); setFilename(''); setBatchId('');
      if (fileInput.current) fileInput.current.value = '';
      await refresh();
    } catch (error) {
      setImportMessage(`${errorMessage(error)} Si la conexión se interrumpió, reintenta con esta misma vista previa: el lote no se duplicará.`);
    } finally { pending.current = false; setBusy(false); }
  };
  const prepareReset = async () => {
    if (pending.current || busy) return;
    pending.current = true; setBusy(true); setResetMessage(''); setConfirmation(''); setReset(null);
    try { setReset(await request<ResetPreview>({ action: 'reset_preview' })); }
    catch (error) { setResetMessage(errorMessage(error)); }
    finally { pending.current = false; setBusy(false); }
  };
  const resetGuests = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending.current || busy || !reset?.count || confirmation !== RESET_CONFIRMATION) return;
    pending.current = true; setBusy(true); setResetMessage('');
    try {
      const result = await request<{ deleted_count: number }>({ action: 'reset', confirmation: RESET_CONFIRMATION, version: reset.version });
      setReset(null); setConfirmation(''); setPreview(null); setBatchId(''); setFilename(''); setImported([]); setImportMessage('');
      if (fileInput.current) fileInput.current.value = '';
      onReset();
      setResetMessage(`Reinicio completado: ${result.deleted_count} invitaciones eliminadas. Puedes comenzar de cero.`);
      await refresh();
    } catch (error) {
      setResetMessage(errorMessage(error));
      if (error instanceof ApiError && error.code === 'RESET_CHANGED') { setReset(null); setConfirmation(''); }
    } finally { pending.current = false; setBusy(false); }
  };

  return <div className="admin-bulk-tools">
    <details className="admin-bulk">
      <summary>Importar invitaciones desde CSV</summary>
      <p>Una fila por persona. Máximo {MAX_IMPORT_ROWS} invitados y 128 KB por archivo. Revisa la vista previa antes de crear el lote.</p>
      <p>Columnas: <code>nombre</code>, <code>telefono</code> y <code>fecha_limite</code>. Solo el nombre es obligatorio. La fecha usa <code>AAAA-MM-DD HH:mm</code>, hora de Costa Rica; si queda vacía, se usará {formatDate(defaultDeadline, { dateStyle: 'long', timeStyle: 'medium' })}.</p>
      <button type="button" className="text-link" onClick={() => downloadCsv(importTemplate(), 'plantilla-invitaciones.csv')}>Descargar plantilla CSV</button>
      <form className="admin-form" onSubmit={importGuests}>
        <label>Archivo CSV<input ref={fileInput} type="file" accept=".csv,text/csv" disabled={busy} onChange={readFile} /></label>
        {preview && <div>
          <p><strong>{filename}</strong> · {preview.guests.length} filas válidas</p>
          {preview.errors.length > 0 && <div role="alert"><p>Corrige estos errores y vuelve a seleccionar el archivo. No se importará ninguna fila hasta corregirlos.</p><ul>{preview.errors.map((error, index) => <li key={index}>{error}</li>)}</ul></div>}
          {preview.guests.length > 0 && <div className="admin-table-wrap admin-import-preview"><table className="admin-table"><caption>Vista previa de invitados</caption><thead><tr><th>Nombre</th><th>Teléfono</th><th>Fecha límite · Costa Rica</th></tr></thead><tbody>{preview.guests.map((guest, index) => <tr key={index}><td>{guest.full_name}</td><td>{guest.phone || '—'}</td><td>{formatDate(guest.expires_at, { dateStyle: 'short', timeStyle: 'medium' })}</td></tr>)}</tbody></table></div>}
          <p className="fine-print">Se rechaza el lote completo si ya existe el mismo nombre y teléfono, incluso en invitaciones archivadas. Las personas con el mismo nombre y contacto que sean distintas se pueden agregar individualmente.</p>
          <button className="button button--dark" disabled={busy || !!preview.errors.length || !preview.guests.length}>Crear {preview.guests.length} invitaciones</button>
        </div>}
      </form>
      <p role="status" aria-live="polite">{importMessage}</p>
      {imported.length > 0 && <aside className="admin-link"><strong>Enlaces del último lote ({imported.length})</strong><p>Guarda este archivo: los enlaces personales solo están disponibles en esta sesión. Compártelo únicamente con quienes administran las invitaciones.</p><button className="button" type="button" onClick={() => downloadCsv(importedLinksCsv(imported, location.origin), 'enlaces-invitaciones.csv')}>Descargar CSV con enlaces</button></aside>}
    </details>
    <details className="admin-bulk admin-reset">
      <summary>Herramientas de prueba: reiniciar invitaciones</summary>
      <p>Elimina permanentemente <strong>todas las invitaciones, incluidas las archivadas</strong>, sus respuestas y su historial. Todos los enlaces anteriores dejarán de funcionar. Las cuentas de administrador se conservan.</p>
      <p className="fine-print">Este reinicio afecta la base de datos configurada: <strong>{import.meta.env.PUBLIC_SUPABASE_URL}</strong>. También desde localhost se modifican los datos de ese proyecto.</p>
      {!reset ? <button className="button" type="button" disabled={busy} onClick={() => void prepareReset()}>Preparar reinicio</button> : <form className="admin-form" onSubmit={resetGuests}>
        <p><strong>Se eliminarán {reset.count} invitaciones.</strong> Esta acción no se puede deshacer. Descarga antes el reporte si necesitas conservarlo.</p>
        <label>Escribe BORRAR TODO para confirmar<input value={confirmation} autoComplete="off" spellCheck={false} disabled={busy} onChange={event => setConfirmation(event.target.value)} /></label>
        <div className="flex flex-wrap gap-3"><button className="button button--danger" disabled={busy || !reset.count || confirmation !== RESET_CONFIRMATION}>Eliminar todas las invitaciones</button><button className="button" type="button" disabled={busy} onClick={() => { setReset(null); setConfirmation(''); }}>Cancelar reinicio</button></div>
      </form>}
      <p role="status" aria-live="polite">{resetMessage}</p>
    </details>
  </div>;
}
