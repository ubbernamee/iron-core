export const NativeiOSBridge = {
  isNativeCapacitor(): boolean {
    const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
    return Boolean(w.Capacitor?.isNativePlatform?.());
  },
  getPlugin(): Record<string, (args?: unknown) => Promise<unknown>> | null {
    const w = window as unknown as {
      Capacitor?: { Plugins?: { IronCoreLiveActivity?: Record<string, (args?: unknown) => Promise<unknown>> } };
    };
    return w.Capacitor?.Plugins?.IronCoreLiveActivity || null;
  },
  haptic(style: 'light' | 'medium' | 'heavy' = 'medium', enabled = true): void {
    if (!enabled) return;
    try {
      const plugin = this.getPlugin();
      if (plugin?.triggerHaptic) {
        void plugin.triggerHaptic({ style });
        return;
      }
      const lbl = document.getElementById('ios-haptic-label');
      if (lbl) lbl.click();
      if (navigator.vibrate) navigator.vibrate(style === 'heavy' ? 18 : style === 'light' ? 6 : 11);
    } catch {}
  },
  async syncLiveActivity(payload: Record<string, unknown>): Promise<boolean> {
    try {
      const plugin = this.getPlugin();
      if (plugin?.startOrUpdateActivity) {
        await plugin.startOrUpdateActivity(payload);
        return true;
      }
    } catch {}
    return false;
  },
  async endLiveActivity(): Promise<void> {
    try {
      const plugin = this.getPlugin();
      if (plugin?.endActivity) await plugin.endActivity();
    } catch {}
  },
  triggerShortcutsDynamicIslandTimer(seconds: number, shortcutName = 'IronCoreTimer'): void {
    try {
      const encodedName = encodeURIComponent(shortcutName || 'IronCoreTimer');
      window.location.href = `shortcuts://run-shortcut?name=${encodedName}&input=text&text=${Math.round(seconds)}`;
    } catch {}
  },
  wakeLockSentinel: null as WakeLockSentinel | null,
  async setKeepAwake(enabled: boolean): Promise<boolean> {
    try {
      const plugin = this.getPlugin();
      if (plugin?.setKeepAwake) {
        await plugin.setKeepAwake({ enabled });
        return true;
      }
      if ('wakeLock' in navigator) {
        if (enabled) {
          if (!this.wakeLockSentinel) {
            this.wakeLockSentinel = await navigator.wakeLock.request('screen');
            this.wakeLockSentinel.addEventListener('release', () => {
              this.wakeLockSentinel = null;
            });
          }
          return true;
        } else if (this.wakeLockSentinel) {
          await this.wakeLockSentinel.release();
          this.wakeLockSentinel = null;
        }
      }
    } catch {}
    return false;
  },
  async shareText(title: string, text: string): Promise<boolean> {
    if (navigator.share) {
      try {
        await navigator.share({ title, text });
        return true;
      } catch {
        return false;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  },
  playChime(): void {
    try {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      [880, 1174.66].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.14);
        gain.gain.setValueAtTime(0.16, now + i * 0.14);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.14 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.14);
        osc.stop(now + i * 0.14 + 0.36);
      });
    } catch {}
  },
};
