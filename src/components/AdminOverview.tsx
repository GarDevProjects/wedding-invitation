import type { AdminSnapshot } from '../../supabase/functions/_shared/contracts';
import { formatDate } from '../lib/dates';
import { statusLabels } from '../lib/admin';

interface Props { snapshot: AdminSnapshot; onFilter: (filter: string) => void }
export default function AdminOverview({ snapshot, onFilter }: Props) {
  const { metrics, invitations } = snapshot;
  const total = metrics.total;
  const percent = (count: number) => total ? Math.round(count / total * 100) : 0;
  const acceptedEnd = total ? metrics.accepted / total * 100 : 0;
  const declinedEnd = acceptedEnd + (total ? metrics.declined / total * 100 : 0);
  const segments = [
    { label: 'Confirmados', value: metrics.accepted, status: 'accepted' },
    { label: 'Pendientes', value: metrics.pending, status: 'pending' },
    { label: 'No asistirán', value: metrics.declined, status: 'declined' },
  ];
  const recent = invitations.filter(row => row.responded_at && !row.archived_at).sort((a,b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5);
  return <>
    <section className="admin-metrics" aria-label="Resumen de asistencia">
      {[
        ['Invitados activos', total, 'Personas con invitación activa'],
        ['Confirmados', metrics.accepted, 'Un asiento por confirmación'],
        ['Pendientes', metrics.pending, 'Aún no han respondido'],
        ['Tasa de respuesta', `${metrics.response_rate}%`, `${metrics.accepted + metrics.declined} de ${total} invitados respondieron`],
      ].map(([label, value, detail]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}
    </section>
    <div className="admin-chart-grid">
      <section className="admin-card"><div className="admin-card-heading"><div><h2>Respuestas de invitados</h2><p>Distribución de las invitaciones activas</p></div><button className="text-link" onClick={() => onFilter('all')}>Ver invitados</button></div>
        <div className="admin-response-chart">
          <div className="admin-donut" role="img" aria-label={total ? `Confirmados: ${metrics.accepted}. Pendientes: ${metrics.pending}. No asistirán: ${metrics.declined}.` : 'Sin invitados todavía'} style={{ background: total ? `conic-gradient(#16a34a 0% ${acceptedEnd}%, #dc2626 ${acceptedEnd}% ${declinedEnd}%, #f59e0b ${declinedEnd}% 100%)` : '#e2e8f0' }}><div><strong>{total}</strong><span>invitados</span></div></div>
          <dl className="admin-chart-legend">{segments.map(segment => <div key={segment.status}><dt><span className={`admin-dot admin-dot--${segment.status}`} />{segment.label}</dt><dd><strong>{segment.value}</strong><span>{percent(segment.value)}%</span></dd></div>)}</dl>
        </div>
      </section>
      <section className="admin-card"><div className="admin-card-heading"><div><h2>Envío de invitaciones</h2><p>Lleva el control de lo que falta compartir</p></div></div>
        <div className="admin-delivery-total"><strong>{percent(metrics.sent)}%</strong><span>de invitaciones marcadas como enviadas</span></div>
        <div className="admin-progress" role="meter" aria-label="Porcentaje de invitaciones enviadas" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent(metrics.sent)}><span style={{ width: `${percent(metrics.sent)}%` }} /></div>
        <div className="admin-delivery-labels"><span><strong>{metrics.sent}</strong> enviadas</span><span><strong>{total - metrics.sent}</strong> sin enviar</span></div>
        <button className="button" onClick={() => onFilter('not_sent')}>Ver invitaciones sin enviar</button>
      </section>
    </div>
    <section className="admin-card admin-recent"><div className="admin-card-heading"><div><h2>Respuestas recientes</h2><p>Los últimos movimientos de tu lista</p></div><button className="text-link" onClick={() => onFilter('pending')}>Ver pendientes</button></div>
      {recent.length ? <ul>{recent.map(row => <li key={row.id}><div className="admin-avatar" aria-hidden="true">{row.full_name.slice(0, 1).toUpperCase()}</div><div><strong>{row.full_name}</strong><span>{formatDate(row.updated_at, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span></div><span className={`status-badge status-badge--${row.status}`}>{statusLabels[row.status]}</span></li>)}</ul> : <div className="admin-empty"><strong>Todavía no hay respuestas</strong><p>Las confirmaciones aparecerán aquí cuando tus invitados respondan.</p></div>}
    </section>
    <p className="fine-print">El resumen excluye invitaciones archivadas. Cada confirmación reserva un asiento.</p>
  </>;
}
