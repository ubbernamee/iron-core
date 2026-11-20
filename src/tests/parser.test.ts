import { describe, expect, it } from 'vitest';
import { parseUniversalProgram } from '../engine/parser';

describe('IRON CORE Universal Program Parser', () => {
  it('parses standard sets x reps @ pct% format', () => {
    const sample = `
Неделя 1
Пн
Жим штанги лежа 5х5 @ 80%
Присед 4x6 @ 75%
Разводка гантелей 3x12
`;
    const weeks = parseUniversalProgram(sample);
    expect(weeks).toHaveLength(1);
    expect(weeks[0].days).toHaveLength(1);
    const items = weeks[0].days[0].items;
    expect(items).toHaveLength(3);

    expect(items[0].exId).toBe('bench');
    expect(items[0].isBase).toBe(true);
    expect(items[0].blocks).toEqual([{ pct: 80, reps: 5, sets: 5 }]);

    expect(items[1].exId).toBe('squat');
    expect(items[1].blocks).toEqual([{ pct: 75, reps: 6, sets: 4 }]);

    expect(items[2].isBase).toBe(false);
    expect(items[2].blocks).toEqual([{ pct: 0, reps: 12, sets: 3 }]);
  });

  it('parses triple (% x reps x sets) multi-wave lines with comma decimals', () => {
    const sample = `
Неделя 2
Ср
Жим лежа 72,5x3x2; 80x2x5
Тяга становая 65x5x5
`;
    const weeks = parseUniversalProgram(sample);
    const items = weeks[0].days[0].items;
    expect(items[0].blocks).toEqual([
      { pct: 72.5, reps: 3, sets: 2 },
      { pct: 80, reps: 2, sets: 5 },
    ]);
    expect(items[1].exId).toBe('deadlift');
  });

  it('parses inline multi-wave sets*reps pct% format from TATWOLE', () => {
    const sample = `
Неделя 1
День 1
Присед со штангой 4*4 75% 2*8 60%
`;
    const weeks = parseUniversalProgram(sample);
    const item = weeks[0].days[0].items[0];
    expect(item.exId).toBe('squat');
    expect(item.blocks).toEqual([
      { sets: 4, reps: 4, pct: 75 },
      { sets: 2, reps: 8, pct: 60 },
    ]);
  });
});
