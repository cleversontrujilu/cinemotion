/**
 * Mapa de assentos: fileiras nomeadas A, B, ..., Z, AA, AB, ... e números 1..N.
 * É definido na criação da Sala e nunca muda depois; só mudam as marcações.
 */

export const MAX_ROWS = 30;
export const MAX_SEATS_PER_ROW = 99;

export interface SeatPosition {
  row: string;
  number: number;
}

/** 1 → A, 26 → Z, 27 → AA (numeração bijetiva em base 26, como colunas de planilha). */
export function rowLabel(index: number): string {
  if (!Number.isInteger(index) || index < 1) throw new RangeError(`fileira inválida: ${index}`);
  let label = '';
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) {
    label = String.fromCharCode(65 + ((n - 1) % 26)) + label;
  }
  return label;
}

export const seatLabel = ({ row, number }: SeatPosition): string => `${row}${number}`;

/** "A10" → { row: 'A', number: 10 }. Devolve null se o rótulo não tiver o formato. */
export function parseSeatLabel(label: string): SeatPosition | null {
  const match = /^([A-Z]{1,3})([1-9][0-9]?)$/.exec(label.trim().toUpperCase());
  return match ? { row: match[1]!, number: Number(match[2]) } : null;
}

/** Todas as posições de uma Sala com `rows` fileiras e `seatsPerRow` assentos cada. */
export function buildSeatMap(rows: number, seatsPerRow: number): SeatPosition[] {
  if (rows < 1 || rows > MAX_ROWS) throw new RangeError(`rows deve estar entre 1 e ${MAX_ROWS}`);
  if (seatsPerRow < 1 || seatsPerRow > MAX_SEATS_PER_ROW) {
    throw new RangeError(`seatsPerRow deve estar entre 1 e ${MAX_SEATS_PER_ROW}`);
  }
  const map: SeatPosition[] = [];
  for (let r = 1; r <= rows; r++) {
    for (let n = 1; n <= seatsPerRow; n++) map.push({ row: rowLabel(r), number: n });
  }
  return map;
}

/** Rótulos de `labels` que não existem em `map` (ou estão malformados). */
export function unknownSeatLabels(map: SeatPosition[], labels: string[]): string[] {
  const existing = new Set(map.map(seatLabel));
  return labels.filter((label) => {
    const position = parseSeatLabel(label);
    return !position || !existing.has(seatLabel(position));
  });
}
