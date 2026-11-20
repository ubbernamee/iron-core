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
  const [entered, setEntered] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDragY(0);
      setIsDragging(false);
      onDragProgress?.(0);
      document.body.style.overflow = 'hidden';
      const raf = requestAnimationFrame(() => setEntered(true));
      return () => {
        cancelAnimationFrame(raf);
        document.body.style.overflow = '';
      };
    } else {
      setEntered(false);
      setDragY(0);
      setIsDragging(false);
      document.body.style.overflow = '';
      onDragProgress?.(1);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const beginDrag = (clientY: number) => {
    startYRef.current = clientY;
    setIsDragging(true);
  };

  const moveDrag = (clientY: number) => {
    if (startYRef.current === null) return;
    const delta = Math.max(0, clientY - startYRef.current);
    setDragY(delta);
    onDragProgress?.(Math.min(1, delta / 260));
  };

  const endDrag = () => {
    if (startYRef.current === null) return;
    setIsDragging(false);
    if (dragY > 95) {
      NativeiOSBridge.haptic('light', hapticsEnabled);
      onClose();
    } else {
      setDragY(0);
      onDragProgress?.(0);
    }
    startYRef.current = null;
  };

  const backdropOpacity = entered ? Math.max(0, 0.78 * (1 - dragY / 340)) : 0;
  const sheetTransform = !entered ? 'translate3d(0, 100%, 0)' : `translate3d(0, ${dragY}px, 0)`;

  return (
    <div
      onClick={() => {
        NativeiOSBridge.haptic('light', hapticsEnabled);
        onClose();
      }}
      style={{
        backgroundColor: `rgba(2, 4, 9, ${backdropOpacity})`,
        transition: isDragging ? 'none' : 'background-color 0.32s var(--spring-ios)',
      }}
      className="fixed inset-0 backdrop-blur-md z-[80] flex items-end sm:items-center justify-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          transform: sheetTransform,
          transition: isDragging ? 'none' : 'transform 0.36s var(--spring-ios)',
          background: 'linear-gradient(180deg, rgba(16, 23, 40, 0.98) 0%, rgba(7, 10, 19, 0.995) 100%)',
          borderTop: '1px solid rgba(148, 179, 235, 0.2)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 -24px 64px rgba(0,0,0,0.96)',
        }}
        className="w-full max-w-lg rounded-t-[30px] sm:rounded-[28px] max-h-[88dvh] flex flex-col will-change-transform"
      >
        {/* Drag Handle & Header */}
        <div
          onTouchStart={(e) => beginDrag(e.touches[0].clientY)}
          onTouchMove={(e) => moveDrag(e.touches[0].clientY)}
          onTouchEnd={endDrag}
          onTouchCancel={endDrag}
          onPointerDown={(e) => {
            if (e.pointerType === 'mouse') beginDrag(e.clientY);
          }}
          onPointerMove={(e) => {
            if (e.pointerType === 'mouse' && isDragging) moveDrag(e.clientY);
          }}
          onPointerUp={(e) => {
            if (e.pointerType === 'mouse') endDrag();
          }}
          className="pt-3 pb-3 px-5 cursor-grab active:cursor-grabbing select-none shrink-0 touch-none border-b border-slate-400/10"
        >
          <div className="w-12 h-1.5 rounded-full bg-slate-500/60 mx-auto mb-3" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {subtitle && (
                <div className="text-[10px] font-mono uppercase tracking-widest text-sky-300 font-semibold truncate">
                  {subtitle}
                </div>
              )}
              <h3 className="text-base font-bold text-slate-50 leading-snug mt-0.5 truncate">{title}</h3>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                NativeiOSBridge.haptic('light', hapticsEnabled);
                onClose();
              }}
              className="w-8 h-8 rounded-full bg-slate-800/90 text-slate-300 hover:text-white flex items-center justify-center font-mono text-xs shrink-0 active:scale-90 transition-transform"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div
          style={{ WebkitOverflowScrolling: 'touch' }}
          className="px-5 pt-3 pb-[max(1.75rem,calc(1.25rem+env(safe-area-inset-bottom)))] overflow-y-auto overscroll-contain flex-1"
        >
          {children}
        </div>
      </div>
    </div>
  );
};
