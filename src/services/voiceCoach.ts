export type VoiceCommand =
  | { type: 'complete_set'; outcome?: 'easy' | 'solid' | 'hard' }
  | { type: 'start_timer'; seconds: number }
  | { type: 'stop_timer' }
  | { type: 'whats_next' }
  | { type: 'check_timer' }
  | { type: 'readiness'; delta: number }
  | { type: 'stop_voice' };

export function isVoiceSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as any;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function parseVoiceCommand(raw: string): VoiceCommand | null {
  const t = raw.toLowerCase().replace(/ё/g, 'е').trim();
  if (!t) return null;

  // Выключить голосовой режим
  if (/(выключи|отключи|стоп голос|тихо|хватит)/.test(t)) {
    return { type: 'stop_voice' };
  }

  // Остановить таймер
  if (/(стоп таймер|останови таймер|сбрось таймер|сброс таймер|отмени таймер)/.test(t)) {
    return { type: 'stop_timer' };
  }

  // Сколько осталось отдыхать
  if (/(сколько осталось|сколько времени|сколько отдыха)/.test(t)) {
    return { type: 'check_timer' };
  }

  // Что дальше / какой вес
  if (/(что дальше|какой вес|сколько вешать|следующий|что делать|статус)/.test(t)) {
    return { type: 'whats_next' };
  }

  // Авто-регуляция дня (-2.5% / +2.5%)
  if (/(полегче|убавь|минус)/.test(t)) {
    return { type: 'readiness', delta: -2.5 };
  }
  if (/(потяжелее|прибавь|плюс два)/.test(t)) {
    return { type: 'readiness', delta: 2.5 };
  }

  // Запуск таймера отдыха
  if (/(таймер|отдых|минут|секунд)/.test(t)) {
    if (/(полторы|90)/.test(t)) return { type: 'start_timer', seconds: 90 };
    if (/(пять|5)/.test(t)) return { type: 'start_timer', seconds: 300 };
    if (/(четыре|4)/.test(t)) return { type: 'start_timer', seconds: 240 };
    if (/(три|3)/.test(t)) return { type: 'start_timer', seconds: 180 };
    if (/(две|два|2)/.test(t)) return { type: 'start_timer', seconds: 120 };
    if (/(одна|одну|1|60|минут)/.test(t)) return { type: 'start_timer', seconds: 60 };
  }

  // Закрытие подхода с оценкой тяжести (RPE)
  if (/(легко|изи|просто)/.test(t)) {
    return { type: 'complete_set', outcome: 'easy' };
  }
  if (/(тяжело|жестко|еле|сложно|хард)/.test(t)) {
    return { type: 'complete_set', outcome: 'hard' };
  }
  if (/(норм|нормально|хорошо|отлично|четко)/.test(t)) {
    return { type: 'complete_set', outcome: 'solid' };
  }
  if (/(готово|сделал|подход|засчитай|дальше|есть|закрыл)/.test(t)) {
    return { type: 'complete_set' };
  }

  return null;
}

export interface VoiceCoachController {
  start: () => void;
  stop: () => void;
  speak: (text: string) => void;
}

export function createVoiceCoach(callbacks: {
  onCommand: (cmd: VoiceCommand, transcript: string) => void;
  onTranscript?: (text: string) => void;
  onStateChange: (active: boolean) => void;
  onError?: (msg: string) => void;
}): VoiceCoachController {
  let recognition: any = null;
  let shouldKeepListening = false;
  let isSpeaking = false;
  let lastTriggerAt = 0;
  let restartTimer: number | null = null;

  const clearRestart = () => {
    if (restartTimer !== null) {
      window.clearTimeout(restartTimer);
      restartTimer = null;
    }
  };

  const startRecognition = () => {
    const w = window as any;
    const SpeechRec = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SpeechRec) {
      callbacks.onError?.('Голосовое управление не поддерживается в этом браузере.');
      callbacks.onStateChange(false);
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.lang = 'ru-RU';
      rec.continuous = true;
      rec.interimResults = false;
      rec.maxAlternatives = 3;

      rec.onresult = (event: any) => {
        if (isSpeaking) return;
        const result = event.results[event.results.length - 1];
        if (!result || !result.isFinal) return;

        // Проверяем до 3 вариантов распознавания — точнее в шумном зале
        for (let i = 0; i < result.length; i++) {
          const phrase = String(result[i]?.transcript || '').trim();
          if (!phrase) continue;
          if (i === 0) callbacks.onTranscript?.(phrase);

          const cmd = parseVoiceCommand(phrase);
          if (cmd) {
            const now = Date.now();
            if (now - lastTriggerAt < 1400) return; // защита от двойного срабатывания
            lastTriggerAt = now;
            callbacks.onCommand(cmd, phrase);
            return;
          }
        }
      };

      rec.onerror = (event: any) => {
        const err = String(event?.error || '');
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          shouldKeepListening = false;
          callbacks.onStateChange(false);
          callbacks.onError?.('Нет доступа к микрофону. Разреши микрофон в настройках iOS.');
        }
      };

      rec.onend = () => {
        if (shouldKeepListening && !isSpeaking) {
          clearRestart();
          restartTimer = window.setTimeout(() => {
            if (shouldKeepListening && !isSpeaking) startRecognition();
          }, 350);
        }
      };

      recognition = rec;
      rec.start();
    } catch {
      callbacks.onStateChange(false);
      callbacks.onError?.('Не удалось запустить микрофон.');
    }
  };

  const speak = (text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'ru-RU';
      utter.rate = 1.08;

      const voices = window.speechSynthesis.getVoices();
      const ruVoice = voices.find((v) => v.lang.toLowerCase().startsWith('ru'));
      if (ruVoice) utter.voice = ruVoice;

      isSpeaking = true;
      // Страховка для iOS Safari, если событие onend не придёт
      const fallbackTimer = window.setTimeout(() => {
        isSpeaking = false;
      }, 4500);

      utter.onend = () => {
        window.clearTimeout(fallbackTimer);
        isSpeaking = false;
      };
      utter.onerror = () => {
        window.clearTimeout(fallbackTimer);
        isSpeaking = false;
      };

      window.speechSynthesis.speak(utter);
    } catch {
      isSpeaking = false;
    }
  };

  return {
    start: () => {
      if (!isVoiceSupported()) {
        callbacks.onError?.('Браузер не поддерживает распознавание речи.');
        return;
      }
      shouldKeepListening = true;
      callbacks.onStateChange(true);
      startRecognition();
    },
    stop: () => {
      shouldKeepListening = false;
      clearRestart();
      try {
        recognition?.stop();
      } catch {}
      recognition = null;
      callbacks.onStateChange(false);
    },
    speak,
  };
}
