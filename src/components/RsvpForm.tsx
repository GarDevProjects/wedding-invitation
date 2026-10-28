import { useEffect, useState, type SubmitEvent } from 'react';
import type { GuestInvitation } from '../../supabase/functions/_shared/contracts';
import { api, configured, errorMessage, invitationToken } from '../lib/api';
import { formatDate } from '../lib/dates';

export default function RsvpForm() {
  const [guest, setGuest] = useState<GuestInvitation | null>(null);
  const [status, setStatus] = useState<'accepted' | 'declined' | ''>('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('Cargando tu invitación…');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [reload, setReload] = useState(0);
  const [retry, setRetry] = useState(false);
  useEffect(() => {
    if (!guest) return;
    document.querySelectorAll<HTMLElement>('[data-personalized-welcome]').forEach(element => {
      element.textContent = `Con cariño, para ${guest.full_name}`; element.hidden = false;
    });
    document.querySelectorAll<HTMLElement>('[data-text="rsvpDeadline"]').forEach(element => {
      element.textContent = formatDate(guest.expires_at, { day: 'numeric', month: 'long', year: 'numeric' });
    });
  }, [guest]);
  useEffect(() => {
    let cancelled = false;
    const token = invitationToken(location.pathname);
    if (!token || !configured) {
      setMessage(!token ? 'Para confirmar, abre el enlace personal que te compartimos. Esta invitación reserva un lugar por persona.' : 'Las confirmaciones aún no están disponibles. Contacta a la pareja.');
      setLoading(false); return;
    }
    setLoading(true); setRetry(false);
    api<GuestInvitation>({ action: 'resolve', token }).then(data => {
      if (cancelled) return;
      setGuest(data); setStatus(data.status === 'pending' ? '' : data.status); setNotes(data.notes);
      setMessage(data.can_respond ? 'Puedes actualizar tu respuesta hasta la fecha indicada.' : 'El plazo para responder ha terminado. Contacta a la pareja si necesitas un cambio.');
    }).catch(error => { if (!cancelled) { setMessage(errorMessage(error)); setRetry(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reload]);
  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const token = invitationToken(location.pathname);
    if (!token || !status || !guest) return;
    setBusy(true); setSuccess(false); setMessage('Enviando tu respuesta…');
    try {
      const updated = await api<GuestInvitation>({ action: 'respond', token, status, notes });
      setGuest(updated); setSuccess(true);
      setMessage(status === 'accepted' ? '¡Gracias! Tu lugar está confirmado. Nos vemos pronto ✦' : 'Gracias por avisarnos. Te tendremos presente con mucho cariño.');
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  };
  return <div aria-busy={loading || busy}>
    {guest && <>
      <p className="guest-welcome">Con cariño, para <strong>{guest.full_name}</strong></p>
      <p className="fine-print">Una persona · Un lugar · Responde antes del {formatDate(guest.expires_at, { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' })} (Costa Rica)</p>
      <form className="rsvp-form" onSubmit={submit}>
        <fieldset className="field attendance-field" disabled={busy || !guest.can_respond}>
          <legend>¿Nos acompañas?</legend>
          <label><input type="radio" name="attendance" value="accepted" required checked={status === 'accepted'} onChange={() => setStatus('accepted')} /> Sí, con mucho gusto</label>
          <label><input type="radio" name="attendance" value="declined" required checked={status === 'declined'} onChange={() => setStatus('declined')} /> No podré asistir</label>
        </fieldset>
        <div className="field field--full"><label htmlFor="guest-notes">Un mensaje para nosotros (opcional)</label>
          <textarea id="guest-notes" maxLength={1000} rows={3} value={notes} disabled={busy || !guest.can_respond} onChange={event => setNotes(event.target.value)} />
        </div>
        <button className={`button button--dark submit-button ${busy ? 'is-loading' : ''}`} disabled={busy || !guest.can_respond} type="submit"><span>{guest.status === 'pending' ? 'Enviar respuesta' : 'Actualizar respuesta'}</span><i aria-hidden="true" /></button>
      </form>
    </>}
    <p className={`form-status ${success ? 'is-success' : ''}`} role="status" aria-live="polite">{message}</p>
    {retry && <button type="button" className="text-link" onClick={() => setReload(value => value + 1)}>Intentar de nuevo</button>}
  </div>;
}
