import { useSyncExternalStore } from 'react';
import { NativeiOSBridge } from '../engine/iosBridge';
import { scheduleBackgroundPush, sendLocalRestNotification } from '../services/webPush';

export interface RestTimerSnapshot {
  timerSec: number;
  timerTotal: number;
  timerRunning: boolean;
  timerEndTime: number | null;
}

interface TimerConfig {
  hapticsEnabled: boolean;
  soundEffectsEnabled: boolean;
  shortcutsIslandEnabled: boolean;
  shortcutName: string;
  isNativeApp: boolean;
  onPersist?: (endTime: number | null, total: number) => void;
}

let state: RestTimerSnapshot = {
  timerSec: 0,
  timerTotal: 180,
  timerRunning: false,
  timerEndTime: null,
};

let config: TimerConfig = {
  hapticsEnabled: true,
  soundEffectsEnabled: true,
  shortcutsIslandEnabled: false,
  shortcutName: 'IronCoreTimer',
  isNativeApp: false,
};

let intervalId: number | null = null;
let preCueFiredFor: number | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function clearTick() {
  if (intervalId !== null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
}

function startTick() {
  clearTick();
  intervalId = window.setInterval(() => {
    if (!state.timerRunning || !state.timerEndTime) {
      clearTick();
      return;
    }
    const left = Math.max(0, Math.round((state.timerEndTime - Date.now()) / 1000));
    if (left > 0 && left <= 5 && preCueFiredFor !== state.timerEndTime) {
      preCueFiredFor = state.timerEndTime;
      NativeiOSBridge.haptic('light', config.hapticsEnabled);
      window.setTimeout(() => NativeiOSBridge.haptic('light', config.hapticsEnabled), 150);
    }

    if (left <= 0) {
      clearTick();
      state = { ...state, timerSec: 0, timerRunning: false, timerEndTime: null };
      emit();
      config.onPersist?.(null, state.timerTotal);
      if (config.soundEffectsEnabled) NativeiOSBridge.playChime();
      sendLocalRestNotification('IRON CORE · Отдых завершён!', 'Пора выходить на следующий подход');
      NativeiOSBridge.haptic('heavy', config.hapticsEnabled);
      return;
    }

    if (left !== state.timerSec) {
      state = { ...state, timerSec: left };
      emit();
    }
  }, 400);
}

export const restTimerStore = {
  configure(next: Partial<TimerConfig>) {
    config = { ...config, ...next };
  },
  hydrate(endTime: number | null, total: number) {
    if (!endTime) return;
    const rem = Math.max(0, Math.round((endTime - Date.now()) / 1000));
    if (rem > 0) {
      state = {
        timerSec: rem,
        timerTotal: total || 180,
        timerRunning: true,
        timerEndTime: endTime,
      };
      emit();
      startTick();
    }
  },
  start(sec: number) {
    NativeiOSBridge.haptic('medium', config.hapticsEnabled);
    const end = Date.now() + sec * 1000;
    state = {
      timerSec: sec,
      timerTotal: sec,
      timerRunning: true,
      timerEndTime: end,
    };
    emit();
    startTick();
    config.onPersist?.(end, sec);
    void scheduleBackgroundPush(sec, 'IRON CORE · Отдых завершён!', 'Пора выходить на следующий подход');
    if (!config.isNativeApp && config.shortcutsIslandEnabled) {
      NativeiOSBridge.triggerShortcutsDynamicIslandTimer(sec, config.shortcutName);
    }
  },
  stop() {
    NativeiOSBridge.haptic('light', config.hapticsEnabled);
    clearTick();
    state = {
      ...state,
      timerSec: 0,
      timerRunning: false,
      timerEndTime: null,
    };
    emit();
    config.onPersist?.(null, state.timerTotal);
  },
  getSnapshot(): RestTimerSnapshot {
    return state;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useRestTimer(): RestTimerSnapshot {
  return useSyncExternalStore(restTimerStore.subscribe, restTimerStore.getSnapshot, restTimerStore.getSnapshot);
}
