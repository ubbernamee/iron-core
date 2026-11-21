declare const process: { env: Record<string, string | undefined> };

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb',
    },
  },
};

const FREE_VISION_MODELS = [
  'google/gemma-3-27b-it:free',
  'mistralai/mistral-small-3.1-24b-instruct:free',
  'meta-llama/llama-3.2-11b-vision-instruct:free',
  'qwen/qwen2.5-vl-32b-instruct:free',
  'openrouter/free',
];

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'OPENROUTER_API_KEY не задан в Vercel -> Settings -> Environment Variables.',
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
        : `Ты спортивный нутрициолог. Оцени блюдо на фото и верни СТРОГО валидный JSON без markdown-обёртки и пояснений:
{"name": "Название блюда", "kcal": 450, "p": 35, "f": 12, "c": 48, "portionNote": "Оценка по фото (~350 г)", "ingredients": "Список основных продуктов через запятую"}`;

    let lastError = 'Не удалось получить ответ от бесплатных моделей OpenRouter';

    for (const model of FREE_VISION_MODELS) {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://iron-core-sandy.vercel.app',
          'X-Title': 'IRON CORE',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mimeType};base64,${imageBase64}`,
                  },
                },
              ],
            },
          ],
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        lastError = data?.error?.message || `Модель ${model} недоступна (${response.status})`;
        continue;
      }

      const rawText: string = data?.choices?.[0]?.message?.content || '';
      if (!rawText.trim()) {
        lastError = `Пустой ответ от ${model}`;
        continue;
      }

      if (mode === 'program') {
        return res.status(200).json({
          text: rawText.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim(),
          model,
        });
      }

      const cleanedJson = rawText.replace(/```json\n?/gi, '').replace(/```/g, '').trim();
      const jsonMatch = cleanedJson.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        lastError = `Модель ${model} вернула не JSON`;
        continue;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return res.status(200).json({ meal: parsed, model });
    }

    return res.status(502).json({ error: lastError });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Внутренняя ошибка AI-анализа' });
  }
}
