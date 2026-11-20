import React, { useEffect, useRef, useState } from 'react';
import { NativeiOSBridge } from '../engine/iosBridge';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onDragProgress?: (ratio: number) => void;
  title: string;
  subtitle?: string;
  hapticsEnabled: boolean;
  children: React.ReactNode;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  onDragProgress,
  title,
  subtitle,
  hapticsEnabled,
  children,
}) => {
  const [dragY, setDragY] = useState(0);
  const startYRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDragY(0);
      onDragProgress?.(0);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      onDragProgress?.(1);
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTouchStart = (e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (startYRef.current === null) return;
    const delta = Math.max(0, e.touches[0].clientY - startYRef.current);
    setDragY(delta);
    onDragProgress?.(Math.min(1, delta / 260));
  };
  const handleTouchEnd = () => {
    if (dragY > 105) {
      NativeiOSBridge.haptic('light', hapticsEnabled);
      onClose();
    } else {
      setDragY(0);
      onDragProgress?.(0);
    }
    startYRef.current = null;
  };

  const backdropOpacity = Math.max(0, 0.82 * (1 - dragY / 320));

  return (
    <div
      onClick={() => {
        NativeiOSBridge.haptic('light', hapticsEnabled);
        onClose();
      }}
      style={{
        backgroundColor: `rgba(2, 4, 9, ${backdropOpacity})`,
        transition: dragY === 0 ? 'background-color 0.34s var(--spring-ios)' : 'none',
      }}
      className="fixed inset-0 backdrop-blur-md z-50 flex items-end sm:items-center justify-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          transform: `translateY(${dragY}px)`,
          transition: dragY === 0 ? 'transform 0.38s var(--spring-ios)' : 'none',
          background: 'linear-gradient(180deg, rgba(14, 20, 35, 0.97) 0%, rgba(7, 10, 19, 0.99) 100%)',
          borderTop: '1px solid rgba(148, 179, 235, 0.18)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 -24px 64px rgba(0,0,0,0.96)',
        }}
        className="animate-sheet-spring w-full max-w-lg rounded-t-[32px] sm:rounded-[28px] max-h-[89vh] flex flex-col pb-[env(safe-area-inset-bottom)]"
      >
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="pt-3.5 pb-3 px-5 cursor-grab active:cursor-grabbing select-none shrink-0"
        >
          <div className="w-11 h-1.5 rounded-full bg-slate-600/60 mx-auto mb-3.5" />
          <div className="flex items-start justify-between gap-3">
            <div>
              {subtitle && (
                <div className="text-[10px] font-mono uppercase tracking-widest text-sky-300 font-semibold">
                  {subtitle}
                </div>
              )}
              <h3 className="text-base font-bold text-slate-50 leading-snug mt-0.5">{title}</h3>
            </div>
            <button
              onClick={() => {
                NativeiOSBridge.haptic('light', hapticsEnabled);
                onClose();
              }}
              className="w-8 h-8 rounded-full bg-slate-800/80 text-slate-300 hover:text-white flex items-center justify-center font-mono text-xs shrink-0 active:scale-90 transition-transform"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="px-5 pb-6 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
};
