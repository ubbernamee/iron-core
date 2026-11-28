import { describe, expect, it } from 'vitest';
import { calculateDOTS, calculateE1RM, calculatePlatesPerSide, formatTime, roundToStep } from '../engine/math';

describe('IRON CORE Math Engine', () => {
  it('rounds weights to 2.5 kg increments with barbell floor', () => {
    expect(roundToStep(72.3, 2.5, 20)).toBe(72.5);
    expect(roundToStep(71.1, 2.5, 20)).toBe(70);
    expect(roundToStep(12, 2.5, 20)).toBe(20);
  });

  it('calculates exact IPF plate loading per side', () => {
    const res100 = calculatePlatesPerSide(100, 20);
    expect(res100.perSideKg).toBe(40);
    expect(res100.plates.map((p) => p.weight)).toEqual([25, 15]);

    const res87_5 = calculatePlatesPerSide(87.5, 20);
    expect(res87_5.perSideKg).toBe(33.75);
    expect(res87_5.plates.map((p) => p.weight)).toEqual([25, 5, 2.5, 1.25]);

    const empty = calculatePlatesPerSide(20, 20);
    expect(empty.plates).toHaveLength(0);
    expect(empty.perSideKg).toBe(0);
  });

  it('computes e1RM (average of Epley and Brzycki)', () => {
    expect(calculateE1RM(100, 1)).toBe(100);
    expect(calculateE1RM(85, 5)).toBe(97.4);
    expect(calculateE1RM(0, 5)).toBe(0);
  });

  it('computes valid DOTS score and formats timer strings', () => {
    expect(calculateDOTS(330, 78)).toBeGreaterThan(220);
    expect(calculateDOTS(330, 78)).toBeLessThan(240);
    expect(formatTime(185)).toBe('3:05');
    expect(formatTime(60)).toBe('1:00');
  });
});
