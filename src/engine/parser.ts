import { DEFAULT_EXERCISES } from '../data/programs';
import { ExerciseId, SetBlock, WorkoutDay, WorkoutWeek } from '../types';

export function matchExerciseId(lineLower: string): ExerciseId | null {
  let bestId: ExerciseId | null = null;
  let bestLen = 0;
  for (const ex of DEFAULT_EXERCISES) {
    for (const al of ex.aliases) {
      if (lineLower.includes(al) && al.length > bestLen) {
        bestId = ex.id;
        bestLen = al.length;
      }
    }
  }
  return bestId;
}

export function parseUniversalProgram(rawText: string): WorkoutWeek[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const weeks: WorkoutWeek[] = [];
  let currentWeek: WorkoutWeek | null = null;
  let currentDay: WorkoutDay | null = null;

  const ensureWeek = (num: number, title?: string) => {
    currentWeek = { week: num, title: title || `${num} НЕДЕЛЯ`, days: [] };
    weeks.push(currentWeek);
  };

  const ensureDay = (dayShort: string, title?: string) => {
    if (!currentWeek) ensureWeek(1, '1 НЕДЕЛЯ');
    currentDay = {
      day: dayShort,
      title: title || `${currentWeek!.week} Неделя · ${dayShort}`,
      items: [],
    };
    currentWeek!.days.push(currentDay);
  };

  const weekRe = /^(?:неделя\s*(\d+)|(\d+)\s*неделя|week\s*(\d+))/i;
  const dayRe =
    /^(пн|вт|ср|чт|пт|сб|вс|понедельник|вторник|среда|четверг|пятница|суббота|воскресенье|день\s*\d+|day\s*\d+|тренировка\s*\d+)\b/i;

  const dayShortMap: Record<string, string> = {
    понедельник: 'Пн',
    вторник: 'Вт',
    среда: 'Ср',
    четверг: 'Чт',
    пятница: 'Пт',
    суббота: 'Сб',
    воскресенье: 'Вс',
    пн: 'Пн',
    вт: 'Вт',
    ср: 'Ср',
    чт: 'Чт',
    пт: 'Пт',
    сб: 'Сб',
    вс: 'Вс',
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/^[\d]+\.\s*/, '').trim();
    if (!line) continue;

    const wm = line.match(weekRe);
    if (wm && !line.includes('%') && !/\d+\s*[xх×*]\s*\d+/i.test(line)) {
      const wNum = parseInt(wm[1] || wm[2] || wm[3], 10) || weeks.length + 1;
      ensureWeek(wNum, line.replace(/[:\-–]+$/, '').trim());
      currentDay = null;
      continue;
    }

    const dm = line.match(dayRe);
    if (dm && !line.includes('%') && !/\d+\s*[xх×*]\s*\d+/i.test(line)) {
      const key = dm[1].toLowerCase();
      const shortLabel =
        dayShortMap[key] ||
        dm[1].replace(/день\s*/i, 'Д').replace(/day\s*/i, 'D').replace(/тренировка\s*/i, 'Т');
      if (!currentWeek) ensureWeek(1, '1 НЕДЕЛЯ');
      ensureDay(shortLabel, `${currentWeek!.week} Неделя · ${line.replace(/[:\-–]+$/, '').trim()}`);
      continue;
    }

    if (!currentWeek) ensureWeek(1, '1 НЕДЕЛЯ');
    if (!currentDay) ensureDay('День 1', `${currentWeek!.week} Неделя · День 1`);

    const tripleRe = /(\d+(?:[.,]\d+)?)\s*[xх×*]\s*(\d+)\s*[xх×*]\s*(\d+)/gi;
    const tripleMatches = [...line.matchAll(tripleRe)];

    let blocks: SetBlock[] = [];
    let cleanName = line;

    if (tripleMatches.length > 0) {
      blocks = tripleMatches.map((m) => ({
        pct: parseFloat(m[1].replace(',', '.')),
        reps: parseInt(m[2], 10),
        sets: parseInt(m[3], 10),
      }));
      cleanName = line
        .replace(tripleRe, '')
        .replace(/[;:\-–]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
    } else {
      const multiWaveRe = /(\d+)\s*[xх×*]\s*(\d+)\s*@?\s*(\d+(?:[.,]\d+)?)\s*%/gi;
      const multiWaveMatches = [...line.matchAll(multiWaveRe)];

      if (multiWaveMatches.length > 0) {
        blocks = multiWaveMatches.map((m) => ({
          sets: parseInt(m[1], 10),
          reps: parseInt(m[2], 10),
          pct: parseFloat(m[3].replace(',', '.')),
        }));
        cleanName = line
          .replace(multiWaveRe, '')
          .replace(/\(?\s*rpe\s*\d+(?:[.,]\d+)?\s*\)?/gi, '')
          .replace(/[;:\-–@]+/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim();
      } else {
        const srRe = /(\d+)\s*[xх×*]\s*(\d+)/i;
        const pctRe = /@?\s*(\d+(?:[.,]\d+)?)\s*%/;
        const srM = line.match(srRe);
        const pctM = line.match(pctRe);

        if (!srM && !pctM) continue;

        const sets = srM ? parseInt(srM[1], 10) : 3;
        const reps = srM ? parseInt(srM[2], 10) : 8;
        const pct = pctM ? parseFloat(pctM[1].replace(',', '.')) : 0;

        blocks = [{ pct, reps, sets }];
        cleanName = line
          .replace(srRe, '')
          .replace(pctRe, '')
          .replace(/\(?\s*rpe\s*\d+(?:[.,]\d+)?\s*\)?/gi, '')
          .replace(/[;:\-–@]+/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim();
      }
    }

    if (!cleanName || cleanName.length < 2) continue;

    const exId = matchExerciseId(cleanName.toLowerCase());
    const hasPct = blocks.some((b) => b.pct > 0);
    const isBase = Boolean(exId && hasPct);

    currentDay!.items.push({
      name: cleanName,
      exId: isBase ? exId : null,
      blocks,
      isBase,
      note: isBase ? 'Авторасчет от твоего 1ПМ' : 'Подсобка · вес индивидуально',
    });
  }

  const cleanedWeeks = weeks
    .map((w) => ({ ...w, days: w.days.filter((d) => d.items.length > 0) }))
    .filter((w) => w.days.length > 0);

  return cleanedWeeks.map((w, idx) => ({ ...w, week: idx + 1 }));
}
