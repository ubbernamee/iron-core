import { FRIDGE_PRODUCTS } from '../data/programs';
import { MealTemplate } from '../types';

export interface BlockOverride {
  weightKg?: number | null;
  reps?: number;
  sets?: number;
}

export interface DayItemOverride {
  name?: string;
  note?: string;
  blocks?: Record<number, BlockOverride>;
}

export interface ExtraWorkoutItem {
  id: string;
  name: string;
  note?: string;
  weightKg: number | null;
  reps: number;
  sets: number;
}

export interface DayOverride {
  items?: Record<number, DayItemOverride>;
  extraItems?: ExtraWorkoutItem[];
}

export const FREESTYLE_QUICK_EXERCISES = [
  'Жим штанги лежа',
  'Приседания со штангой',
  'Становая тяга',
  'Подтягивания',
  'Отжимания на брусьях',
  'Жим гантелей 30°',
  'Тяга верхнего блока',
  'Сгибание на бицепс',
  'Махи на плечи',
  'Пресс',
];

export function normalizeExKey(name: string): string {
  return name.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, ' ').trim();
}

export function loadLocalJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export type UserGender = 'male' | 'female';

export interface UserProfile {
  name: string;
  gender: UserGender;
  avatarColor: string;
  syncCode: string;
  onboarded: boolean;
}

export const AVATAR_COLORS = [
  { id: 'sky', hex: '#38BDF8', bg: 'bg-sky-400', text: 'text-slate-950' },
  { id: 'emerald', hex: '#34D399', bg: 'bg-emerald-400', text: 'text-slate-950' },
  { id: 'rose', hex: '#FB7185', bg: 'bg-rose-400', text: 'text-slate-950' },
  { id: 'violet', hex: '#A78BFA', bg: 'bg-violet-400', text: 'text-slate-950' },
  { id: 'amber', hex: '#FBBF24', bg: 'bg-amber-400', text: 'text-slate-950' },
  { id: 'slate', hex: '#E2E8F0', bg: 'bg-slate-200', text: 'text-slate-950' },
];

export function generateUniqueSyncCode(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `iron-${suffix}`;
}

export function getPeerAvatarStyle(name: string): { bg: string; text: string; initial: string } {
  const clean = (name || 'А').trim();
  const initial = clean.charAt(0).toUpperCase() || 'А';
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
  }
  const col = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  return { bg: col.bg, text: col.text, initial };
}

export function calculateFemaleDOTS(totalKg: number, bwKg: number): number {
  if (!totalKg || totalKg <= 0 || !bwKg || bwKg <= 0) return 0;
  const bw = Math.max(40, Math.min(150, bwKg));
  const a = -57.96288;
  const b = 13.6175032;
  const c = -0.1126655495;
  const d = 0.0005158568;
  const e = -0.0000010706;
  const denom = a + b * bw + c * bw ** 2 + d * bw ** 3 + e * bw ** 4;
  if (denom <= 0) return 0;
  return Number(((totalKg * 500) / denom).toFixed(1));
}

export type VisualTheme = 'ocean-glass' | 'obsidian' | 'oled' | 'titanium';
export type AccentPreset = 'auto' | 'sky' | 'emerald' | 'rose' | 'violet' | 'amber';

export const ACCENT_PRESETS: { id: AccentPreset; label: string; hex: string; rgb: string }[] = [
  { id: 'auto', label: 'Авто', hex: '#38BDF8', rgb: '56, 189, 248' },
  { id: 'sky', label: 'Cyan', hex: '#38BDF8', rgb: '56, 189, 248' },
  { id: 'emerald', label: 'Mint', hex: '#34D399', rgb: '52, 211, 153' },
  { id: 'rose', label: 'Crimson', hex: '#FB7185', rgb: '251, 113, 133' },
  { id: 'violet', label: 'Violet', hex: '#A78BFA', rgb: '167, 139, 250' },
  { id: 'amber', label: 'Gold', hex: '#FBBF24', rgb: '251, 191, 36' },
];

export type KitchenSubTab = 'ration' | 'fridge' | 'shopping';
export type RecipeSortMode = 'default' | 'protein' | 'light' | 'video';
export type MealSlot = 'Завтрак' | 'Обед' | 'Ужин' | 'Перекус';

export const RECIPE_CATEGORIES = ['Все', 'Избранное', 'Завтрак', 'Обед', 'Ужин', 'Десерты', 'Салаты', 'Выпечка'];

export const QUICK_SNACK_PRESETS: { name: string; kcal: number; p: number; f: number; c: number; slot: MealSlot }[] = [
  { name: 'Протеин (30 г)', kcal: 120, p: 24, f: 1, c: 3, slot: 'Перекус' },
  { name: 'Банан (1 шт)', kcal: 105, p: 1, f: 0, c: 27, slot: 'Перекус' },
  { name: 'Яйца варёные / глазунья (2 шт)', kcal: 155, p: 13, f: 11, c: 1, slot: 'Завтрак' },
  { name: 'Творог 5% (200 г)', kcal: 242, p: 32, f: 10, c: 6, slot: 'Ужин' },
  { name: 'Греческий йогурт (150 г)', kcal: 100, p: 12, f: 3, c: 6, slot: 'Перекус' },
  { name: 'Протеиновый батончик', kcal: 195, p: 20, f: 6, c: 12, slot: 'Перекус' },
];

export const DAILY_SUPPLEMENTS = [
  { id: 'creatine', label: 'Креатин 5 г' },
  { id: 'omega3', label: 'Омега-3' },
  { id: 'vitd', label: 'Витамин D3' },
  { id: 'magnesium', label: 'Магний' },
];

export function getTodayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getMealSlot(category?: string): MealSlot {
  if (category === 'Завтрак') return 'Завтрак';
  if (category === 'Обед' || category === 'Салаты') return 'Обед';
  if (category === 'Ужин') return 'Ужин';
  return 'Перекус';
}

export function scaleIngredientText(text: string, scale: number): string {
  if (scale === 1) return text;
  return text.replace(
    /(\d+(?:[.,]\d+)?)\s*(г|гр|мл|шт\.?|ст\.?\s*л\.?|ч\.?\s*л\.?|уп\.?)/gi,
    (_m, numStr: string, unit: string) => {
      const val = parseFloat(numStr.replace(',', '.'));
      if (Number.isNaN(val)) return _m;
      const scaled = val * scale;
      const formatted = Number.isInteger(scaled) ? String(scaled) : scaled.toFixed(1).replace(/\.0$/, '');
      return `${formatted} ${unit}`;
    }
  );
}

export function extractCookMinutes(steps: string): number[] {
  const found = new Set<number>();
  const regex = /(\d+)(?:\s*[–-]\s*(\d+))?\s*(?:мин(?:ут[ыа]?)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(steps)) !== null) {
    const first = parseInt(m[1], 10);
    if (first >= 1 && first <= 180) found.add(first);
  }
  return Array.from(found).slice(0, 3);
}

export function generateChefRecipe(selectedIds: string[], remainKcal: number, remainProt: number): MealTemplate {
  const labels = FRIDGE_PRODUCTS.filter((p) => selectedIds.includes(p.id)).map((p) => p.label.split(' / ')[0]);
  const baseList = labels.length > 0 ? labels : ['Творог', 'Яйца', 'Овсянка'];
  const targetK = Math.max(280, Math.min(720, remainKcal > 150 ? Math.round(remainKcal * 0.85) : 450));
  const targetP = Math.max(24, Math.min(62, remainProt > 15 ? Math.round(remainProt * 0.8) : 38));
  const targetF = Math.max(6, Math.round((targetK * 0.22) / 9));
  const targetC = Math.max(12, Math.round((targetK - targetP * 4 - targetF * 9) / 4));

  const hasSweet = selectedIds.some((id) => ['творог', 'овсян', 'вишн', 'йогурт', 'пудинг'].includes(id));
  const title = hasSweet
    ? `Шеф-боул: ${baseList.slice(0, 3).join(' + ')}`
    : `Белковая сковорода: ${baseList.slice(0, 3).join(' + ')}`;

  const ingredients = baseList
    .map((item, i) => `${item} — ${i === 0 ? 150 : i === 1 ? 100 : 60} г`)
    .join(', ') + ', специи / соль по вкусу.';

  const steps = hasSweet
    ? `Смешай ${baseList.slice(0, 2).join(' и ')} до однородности, добавь остальные ингредиенты и дай настояться 10 минут (или запеки 15 минут при 180 °C).`
    : `Нарежь ${baseList.slice(0, 2).join(' и ')}, обжарь на антипригарной сковороде 8 минут, добавь остальное и туши под крышкой ещё 7 минут.`;

  return {
    id: `chef-${Date.now()}`,
    category: hasSweet ? 'Завтрак' : 'Обед',
    name: title,
    kcal: targetK,
    p: targetP,
    f: targetF,
    c: targetC,
    portionNote: 'AI-Шеф под остаток КБЖУ',
    video: '',
    ingredients,
    steps,
  };
}

export function spawnCelebrationBurst(): void {
  const colors = ['#38BDF8', '#34D399', '#FBBF24', '#A78BFA', '#F8FAFC'];
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight * 0.45;
  for (let i = 0; i < 28; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-dot';
    el.style.left = `${cx}px`;
    el.style.top = `${cy}px`;
    el.style.backgroundColor = colors[i % colors.length];
    const angle = (Math.PI * 2 * i) / 28 + (Math.random() - 0.5) * 0.3;
    const dist = 90 + Math.random() * 140;
    el.style.setProperty('--tx', `${Math.cos(angle) * dist}px`);
    el.style.setProperty('--ty', `${Math.sin(angle) * dist - 40}px`);
    el.style.setProperty('--rot', `${Math.round((Math.random() - 0.5) * 540)}deg`);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }
}

