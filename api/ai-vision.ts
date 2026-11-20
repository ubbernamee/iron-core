export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb',
    },
  },
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'GEMINI_API_KEY не задан в Vercel -> Settings -> Environment Variables.',
    });
  }

  try {
    const { mode, imageBase64, mimeType = 'image/jpeg' } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ error: 'Не передано изображение.' });
    }

    const prompt =
      mode === 'program'
        ? `Ты парсер программ силовых тренировок. Извлеки программу с изображения строго в текстовом формате по неделям и дням, например:
Неделя 1
Пн
Присед 4х6 @ 75%
Жим лежа 5х5 @ 80%
Подтягивания 4х10
Верни ТОЛЬКО чистый текст программы без пояснений и markdown-блоков.`
        : `Ты спортивный нутрициолог. Оцени блюдо на фото и верни СТРОГО валидный JSON без markdown-обёртки:
{"name": "Название блюда", "kcal": 450, "p": 35, "f": 12, "c": 48, "portionNote": "Оценка по фото (~350 г)", "ingredients": "Список основных продуктов через запятую"}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inline_data: { mime_type: mimeType, data: imageBase64 } },
              ],
            },
          ],
        }),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message || 'Ошибка Gemini API' });
    }

    const rawText: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (mode === 'program') {
      return res.status(200).json({ text: rawText.replace(/```[a-z]*
?/gi, '').replace(/```/g, '').trim() });
    }

    const cleanedJson = rawText.replace(/```json
?/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanedJson);
    return res.status(200).json({ meal: parsed });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Внутренняя ошибка AI-анализа' });
  }
}
