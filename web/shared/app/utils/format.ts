// Datas chegam da API em UTC e são sempre exibidas e digitadas no fuso da rede
// (ADR 0002). O navegador pode estar em qualquer fuso; o que vale é o do cinema.

export const NETWORK_TIMEZONE = 'America/Sao_Paulo'

const parts = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: NETWORK_TIMEZONE, ...options })

const weekdayDate = parts({ weekday: 'short', day: '2-digit', month: '2-digit' })
const longDate = parts({ weekday: 'long', day: 'numeric', month: 'long' })
const time = parts({ hour: '2-digit', minute: '2-digit' })
const dateTime = parts({ day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** "sex., 20/11 · 19:30" */
export const formatSessionTime = (iso: string) => `${weekdayDate.format(new Date(iso))} · ${time.format(new Date(iso))}`
/** "sexta-feira, 20 de novembro" */
export const formatLongDate = (iso: string) => longDate.format(new Date(iso))
/** "19:30" */
export const formatTime = (iso: string) => time.format(new Date(iso))
/** "20/11/2026, 19:30" */
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso))
/** "R$ 32,50" */
export const formatPrice = (value: number) => money.format(value)
/** "1h44" */
export const formatDuration = (minutes: number) =>
  minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`

/** "YYYY-MM-DD" de um instante, no fuso da rede. */
export function networkDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: NETWORK_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(date)
}

/** "HH:mm" de um instante, no fuso da rede. */
export function networkTime(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: NETWORK_TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(date)
}

/** Offset do fuso da rede num instante, no formato "-03:00". */
function networkOffset(date: Date): string {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: NETWORK_TIMEZONE, timeZoneName: 'longOffset' })
    .formatToParts(date)
    .find(part => part.type === 'timeZoneName')?.value ?? 'GMT'
  return name === 'GMT' ? '+00:00' : name.slice(3)
}

/**
 * Data e hora digitadas (no fuso da rede) para o ISO 8601 com offset explícito que a API
 * exige: ("2026-11-20", "19:30") → "2026-11-20T19:30:00-03:00".
 */
export function toNetworkIso(date: string, hhmm: string): string {
  const approx = new Date(`${date}T${hhmm}:00Z`)
  return `${date}T${hhmm}:00${networkOffset(approx)}`
}
