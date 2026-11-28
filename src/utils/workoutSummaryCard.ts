import { PendingSetInfo } from '../components/DynamicIslandBar';
import { ACCENT_PRESETS, AccentPreset, VisualTheme } from './appHelpers';

export interface SummaryCardExercise {
  name: string;
  computedBlocks: { weightKg: number | null; reps: number; sets: number }[];
}

export interface WorkoutSummaryCardParams {
  titleText: string;
  visualTheme: VisualTheme;
  accentPreset: AccentPreset;
  dayTonnage: number;
  completedSetsCount: number;
  flatDaySets: PendingSetInfo[];
  computedDayItems: SummaryCardExercise[];
}

export async function generateWorkoutSummaryBlob(params: WorkoutSummaryCardParams): Promise<Blob | null> {
  const {
    titleText,
    visualTheme,
    accentPreset,
    dayTonnage,
    completedSetsCount,
    flatDaySets,
    computedDayItems,
  } = params;

  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const baseBg = visualTheme === 'ios-dark' ? '#000000' : '#090a0c';
  ctx.fillStyle = baseBg;
  ctx.fillRect(0, 0, 1080, 1350);

  const topSheen = ctx.createRadialGradient(540, 0, 40, 540, 0, 760);
  topSheen.addColorStop(0, 'rgba(255, 255, 255, 0.045)');
  topSheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = topSheen;
  ctx.fillRect(0, 0, 1080, 1350);

  const presetObj = ACCENT_PRESETS.find((p) => p.id === accentPreset);
  const accentHex = presetObj ? presetObj.hex : '#C8F550';

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(44, 44, 992, 1262, 36);
  ctx.stroke();

  ctx.fillStyle = accentHex;
  ctx.beginPath();
  ctx.roundRect(90, 98, 14, 28, 4);
  ctx.fill();

  ctx.fillStyle = '#F7F7F9';
  ctx.font = '800 26px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('IRON CORE', 118, 122);

  ctx.fillStyle = '#848792';
  ctx.font = '600 22px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'right';
  ctx.fillText(new Date().toLocaleDateString('ru-RU'), 990, 122);
  ctx.textAlign = 'left';

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 44px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif';
  const shortTitle = titleText.length > 34 ? `${titleText.slice(0, 34)}…` : titleText;
  ctx.fillText(shortTitle, 90, 196);

  const topSet = flatDaySets
    .filter((s) => s.weightKg && s.weightKg > 0)
    .sort((a, b) => (b.weightKg || 0) - (a.weightKg || 0))[0];
  const pctDone = flatDaySets.length > 0 ? Math.round((completedSetsCount / flatDaySets.length) * 100) : 0;

  const drawStatBox = (x: number, y: number, w: number, h: number, label: string, val: string, color: string) => {
    const cardGrad = ctx.createLinearGradient(x, y, x, y + h);
    cardGrad.addColorStop(0, '#17181d');
    cardGrad.addColorStop(1, '#111216');
    ctx.fillStyle = cardGrad;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 24);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.075)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#848792';
    ctx.font = '700 18px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(label, x + 28, y + 46);

    ctx.fillStyle = color;
    ctx.font = '800 46px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(val, x + 28, y + 110);
  };

  drawStatBox(90, 240, 438, 146, 'ТОННАЖ ДНЯ', `${dayTonnage} КГ`, '#FFFFFF');
  drawStatBox(552, 240, 438, 146, 'ВЫПОЛНЕНО', `${completedSetsCount}/${flatDaySets.length} (${pctDone}%)`, accentHex);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.beginPath();
  ctx.roundRect(90, 412, 900, 8, 4);
  ctx.fill();
  ctx.fillStyle = accentHex;
  ctx.beginPath();
  ctx.roundRect(90, 412, Math.max(8, (900 * pctDone) / 100), 8, 4);
  ctx.fill();

  if (topSet && topSet.weightKg) {
    ctx.fillStyle = '#141519';
    ctx.beginPath();
    ctx.roundRect(90, 448, 900, 96, 20);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = accentHex;
    ctx.beginPath();
    ctx.roundRect(90, 448, 6, 96, 3);
    ctx.fill();

    ctx.fillStyle = '#848792';
    ctx.font = '700 18px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText('ТОП-ПОДХОД', 120, 486);

    ctx.fillStyle = '#F7F7F9';
    ctx.font = '700 28px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif';
    ctx.fillText(
      `${topSet.exerciseName.slice(0, 28)} · ${topSet.weightKg} кг × ${topSet.reps}`,
      120,
      524
    );
  }

  let curY = topSet && topSet.weightKg ? 600 : 495;
  ctx.fillStyle = '#848792';
  ctx.font = '700 19px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('ВЫПОЛНЕННАЯ РАБОТА', 90, curY);
  curY += 38;

  computedDayItems.slice(0, 7).forEach((it, i) => {
    const desc = it.computedBlocks
      .map((b) => (b.weightKg ? `${b.weightKg} кг × ${b.reps} × ${b.sets}` : `${b.reps} × ${b.sets}`))
      .join('  |  ');

    ctx.fillStyle = 'rgba(255, 255, 255, 0.028)';
    ctx.beginPath();
    ctx.roundRect(90, curY - 30, 900, 72, 16);
    ctx.fill();

    ctx.fillStyle = '#F7F7F9';
    ctx.font = '600 25px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif';
    const nm = `${i + 1}. ${it.name}`;
    ctx.fillText(nm.length > 32 ? `${nm.slice(0, 32)}…` : nm, 116, curY + 13);

    ctx.textAlign = 'right';
    ctx.fillStyle = i === 0 ? accentHex : '#D4D4D8';
    ctx.font = '700 23px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(desc.slice(0, 28), 964, curY + 13);
    ctx.textAlign = 'left';

    curY += 84;
  });

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(90, 1218);
  ctx.lineTo(990, 1218);
  ctx.stroke();

  ctx.fillStyle = '#848792';
  ctx.font = '600 19px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('iron-core-sandy.vercel.app', 90, 1265);
  ctx.textAlign = 'right';
  ctx.fillStyle = accentHex;
  ctx.font = '700 20px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('IRON CORE · MATTE CARBON', 990, 1265);
  ctx.textAlign = 'left';

  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
}
