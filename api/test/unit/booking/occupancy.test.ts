import { describe, expect, it } from 'vitest';
import { seatState } from '../../../src/modules/booking/domain/occupancy.js';

describe('seatState', () => {
  it.each([
    [false, null, 'available'],
    [true, null, 'unavailable'],
    [false, 'pending', 'reserved'],
    [false, 'confirmed', 'sold'],
    // Reservado e vendido prevalecem sobre indisponível.
    [true, 'pending', 'reserved'],
    [true, 'confirmed', 'sold'],
  ] as const)('manutenção=%s, retenção=%s → %s', (underMaintenance, hold, expected) => {
    expect(seatState(underMaintenance, hold)).toBe(expected);
  });
});
