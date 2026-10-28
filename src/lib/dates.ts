import { wedding } from '../config/wedding';

export const formatDate = (value: string, options: Intl.DateTimeFormatOptions = {}) =>
  new Intl.DateTimeFormat('es-CR', { timeZone: wedding.timeZone, ...options }).format(new Date(value));
const capital = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
export const display = {
  ...wedding,
  dayName: capital(formatDate(wedding.weddingDate, { weekday: 'long' })),
  dayNumber: formatDate(wedding.weddingDate, { day: '2-digit' }),
  monthName: capital(formatDate(wedding.weddingDate, { month: 'long' })),
  year: formatDate(wedding.weddingDate, { year: 'numeric' }),
  shortDate: formatDate(wedding.weddingDate, { day: '2-digit', month: '2-digit', year: 'numeric' }).replaceAll('/', ' · '),
  fullDate: capital(formatDate(wedding.weddingDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })),
  time: formatDate(wedding.weddingDate, { hour: 'numeric', minute: '2-digit' }),
  rsvpDeadline: formatDate(wedding.rsvpDeadline, { day: 'numeric', month: 'long', year: 'numeric' }),
};

export function calendarFile(now = new Date()) {
  const date = new Date(wedding.weddingDate);
  const stamp = (value: Date) => value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Akion & Mariamalia//Wedding//ES',
    'BEGIN:VEVENT', `UID:wedding-${date.getTime()}@akion-mariamalia`, `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(date)}`, `DTEND:${stamp(new Date(date.getTime() + 21600000))}`,
    `SUMMARY:${escape(`Boda de ${wedding.partnerOne} & ${wedding.partnerTwo}`)}`,
    `LOCATION:${escape(`${wedding.venueName}, ${wedding.venueAddress}`)}`,
    `DESCRIPTION:${escape(wedding.invitationMessage)}`, 'END:VEVENT', 'END:VCALENDAR',
  ];
  // RFC 5545: fold at 75 UTF-8 octets, without splitting a Unicode character.
  return lines.map(line => {
    let result = '', bytes = 0;
    for (const char of line) {
      const size = new TextEncoder().encode(char).length;
      if (bytes + size > 75) { result += '\r\n '; bytes = 1; }
      result += char; bytes += size;
    }
    return result;
  }).join('\r\n') + '\r\n';
}
