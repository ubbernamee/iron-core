import { PlateSpec } from '../types';

export const PLATE_INVENTORY: PlateSpec[] = [
  { weight: 25, color: '#EF4444', edge: '#991B1B', height: 86, width: 13, label: '25' },
  { weight: 20, color: '#3B82F6', edge: '#1E40AF', height: 82, width: 12, label: '20' },
  { weight: 15, color: '#EAB308', edge: '#854D0E', height: 70, width: 11, label: '15' },
  { weight: 10, color: '#22C55E', edge: '#166534', height: 60, width: 10, label: '10' },
  { weight: 5, color: '#F4F4F5', edge: '#A1A1AA', height: 48, width: 8, label: '5' },
  { weight: 2.5, color: '#475569', edge: '#1E293B', height: 38, width: 7, label: '2.5' },
  { weight: 1.25, color: '#CBD5E1', edge: '#64748B', height: 30, width: 6, label: '1.25' },
];

export function roundToStep(rawWeight: number, step = 2.5, minWeight = 20): number {
  if (!rawWeight || Number.isNaN(rawWeight)) return minWeight;
  const rounded = Math.round(rawWeight / step) * step;
  return Math.max(minWeight, Number(rounded.toFixed(2)));
}

export function calculatePlatesPerSide(
  targetWeight: number,
  barbellWeight = 20
): { plates: PlateSpec[]; perSideKg: number } {
  if (targetWeight <= barbellWeight) return { plates: [], perSideKg: 0 };
  let remainingPerSide = Number(((targetWeight - barbellWeight) / 2).toFixed(3));
  const plates: PlateSpec[] = [];
  for (const plate of PLATE_INVENTORY) {
    while (remainingPerSide >= plate.weight - 0.001) {
      plates.push(plate);
      remainingPerSide = Number((remainingPerSide - plate.weight).toFixed(3));
    }
  }
  return {
    plates,
    perSideKg: Number(((targetWeight - barbellWeight) / 2).toFixed(2)),
  };
}

export function calculateE1RM(weight: number, reps: number): number {
  if (!weight || !reps || reps <= 0) return 0;
  if (reps === 1) return weight;
  const epley = weight * (1 + reps / 30);
  const brzycki = reps < 37 ? weight * (36 / (37 - reps)) : epley;
  return Number(((epley + brzycki) / 2).toFixed(1));
}

export function calculateDOTS(totalKg: number, bwKg: number): number {
  if (!totalKg || !bwKg || bwKg < 40) return 0;
  const a = -0.000001093;
  const b = 0.0007391293;
  const c = -0.1918759221;
  const d = 24.0900756;
  const e = -307.75076;
  const denom = a * Math.pow(bwKg, 4) + b * Math.pow(bwKg, 3) + c * Math.pow(bwKg, 2) + d * bwKg + e;
  return denom > 0 ? Number(((totalKg * 500) / denom).toFixed(1)) : 0;
}

export function formatTime(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}
