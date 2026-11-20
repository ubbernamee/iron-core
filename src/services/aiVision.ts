import { MealTemplate } from '../types';

async function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve({ base64, mimeType: file.type || 'image/jpeg' });
    };
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
}

export async function analyzeFoodPhotoAI(file: File): Promise<{ meal?: MealTemplate; error?: string }> {
  try {
    const { base64, mimeType } = await fileToBase64(file);
    const res = await fetch('/api/ai-vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'food', imageBase64: base64, mimeType }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || 'Ошибка AI-сервера' };
    const m = data.meal;
    return {
      meal: {
        id: `ai-${Date.now()}`,
        category: 'Обед',
        name: m.name || 'Блюдо по фото (AI)',
        kcal: Number(m.kcal) || 0,
        p: Number(m.p) || 0,
        f: Number(m.f) || 0,
        c: Number(m.c) || 0,
        portionNote: m.portionNote || 'Оценка по фото AI',
        ingredients: m.ingredients || '',
        steps: 'Распознано через IRON CORE AI Vision.',
      },
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Нет связи с /api/ai-vision' };
  }
}

export async function analyzeProgramPhotoAI(file: File): Promise<{ text?: string; error?: string }> {
  try {
    const { base64, mimeType } = await fileToBase64(file);
    const res = await fetch('/api/ai-vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'program', imageBase64: base64, mimeType }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || 'Ошибка AI-сервера' };
    return { text: data.text || '' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Нет связи с /api/ai-vision' };
  }
}
