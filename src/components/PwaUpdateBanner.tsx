import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { NativeiOSBridge } from '../engine/iosBridge';

interface PwaUpdateBannerProps {
  hapticsEnabled: boolean;
}

export const PwaUpdateBanner: React.FC<PwaUpdateBannerProps> = ({ hapticsEnabled }) => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        setInterval(() => {
          void registration.update();
        }, 60 * 30 * 1000);
      }
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="fixed top-[calc(3.8rem+env(safe-area-inset-top))] left-0 right-0 px-4 z-50 flex justify-center pointer-events-none">
      <div className="pointer-events-auto ios-glass-card rounded-2xl px-4 py-2.5 flex items-center gap-3 max-w-md w-full animate-cascade">
        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-slate-50">Доступно обновление</div>
          <div className="text-[10px] text-slate-400">Новая версия готова к запуску</div>
        </div>
        <button
          onClick={() => {
            NativeiOSBridge.haptic('medium', hapticsEnabled);
            void updateServiceWorker(true);
          }}
          className="px-3 py-1.5 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 text-xs font-extrabold shrink-0 active:scale-90 transition-transform"
        >
          Обновить
        </button>
        <button
          onClick={() => setNeedRefresh(false)}
          className="text-slate-400 hover:text-white font-mono text-xs px-1"
          title="Позже"
        >
          ✕
        </button>
      </div>
    </div>
  );
};
