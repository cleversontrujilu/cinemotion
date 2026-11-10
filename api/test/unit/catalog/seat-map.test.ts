import { describe, expect, it } from 'vitest';
import {
  buildSeatMap,
  parseSeatLabel,
  rowLabel,
  seatLabel,
  unknownSeatLabels,
} from '../../../src/modules/catalog/domain/seat-map.js';

describe('rowLabel', () => {
  it.each([
    [1, 'A'],
    [10, 'J'],
    [26, 'Z'],
    [27, 'AA'],
    [30, 'AD'],
    [52, 'AZ'],
    [53, 'BA'],
  ])('%i → %s', (index, label) => {
    expect(rowLabel(index)).toBe(label);
  });

  it('recusa índice inválido', () => {
    expect(() => rowLabel(0)).toThrow(RangeError);
  });
});

describe('buildSeatMap', () => {
  it('gera A1 a J12 para 10 fileiras de 12 (exemplo do enunciado)', () => {
    const map = buildSeatMap(10, 12);
    expect(map).toHaveLength(120);
    expect(seatLabel(map[0]!)).toBe('A1');
    expect(seatLabel(map.at(-1)!)).toBe('J12');
  });

  it.each([
    [0, 10],
    [31, 10],
    [10, 0],
    [10, 100],
  ])('recusa %i fileiras × %i assentos', (rows, perRow) => {
    expect(() => buildSeatMap(rows, perRow)).toThrow(RangeError);
  });
});

describe('parseSeatLabel', () => {
  it('lê fileira e número, ignorando caixa e espaços', () => {
    expect(parseSeatLabel(' aa12 ')).toEqual({ row: 'AA', number: 12 });
  });

  it.each(['A0', 'A100', '12', 'A', 'A-1', 'ABCD1'])('recusa %s', (label) => {
    expect(parseSeatLabel(label)).toBeNull();
  });
});

describe('unknownSeatLabels', () => {
  it('aponta rótulos fora do mapa ou malformados', () => {
    const map = buildSeatMap(2, 3); // A1..B3
    expect(unknownSeatLabels(map, ['a1', 'B3', 'C1', 'A4', 'xx'])).toEqual(['C1', 'A4', 'xx']);
  });
});
