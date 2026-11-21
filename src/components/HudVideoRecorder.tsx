import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NativeiOSBridge } from '../engine/iosBridge';
import { subscribeAppLifecycle } from '../utils/ios-lifecycle';

export interface HudTelemetryTarget {
  exerciseName: string;
  weightKg: number | null;
  reps: number;
  setNumber: number;
  effectivePct: number;
  programTitle: string;
}

interface HudVideoRecorderProps {
  isOpen: boolean;
  onClose: () => void;
  target: HudTelemetryTarget;
  hapticsEnabled: boolean;
}

type HudTheme = 'cyan' | 'red' | 'minimal';

function pickSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const type of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {}
  }
  return '';
}

function formatRecTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

export const HudVideoRecorder: React.FC<HudVideoRecorderProps> = ({
  isOpen,
  onClose,
  target,
  hapticsEnabled,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number | null>(null);
  const recStartRef = useRef<number>(0);
  const isBgPausedRef = useRef<boolean>(false);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hudTheme, setHudTheme] = useState<HudTheme>('cyan');
  const [showGrid, setShowGrid] = useState(true);
  const [liveReps, setLiveReps] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recMs, setRecMs] = useState(0);
  const [cameraError, setCameraError] = useState('');
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedMime, setRecordedMime] = useState<string>('video/mp4');
  const [shareStatus, setShareStatus] = useState('');

  // Keep latest state in refs for the 30fps canvas draw loop
  const stateRef = useRef({
    target,
    hudTheme,
    showGrid,
    liveReps,
    isRecording,
    facingMode,
  });
  stateRef.current = {
    target,
    hudTheme,
    showGrid,
    liveReps,
    isRecording,
    facingMode,
  };

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {}
    }
    recorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const drawHudFrame = useCallback(() => {
    if (isBgPausedRef.current && !stateRef.current.isRecording) {
      rafRef.current = requestAnimationFrame(drawHudFrame);
      return;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      rafRef.current = requestAnimationFrame(drawHudFrame);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      rafRef.current = requestAnimationFrame(drawHudFrame);
      return;
    }

    const cw = canvas.width;
    const ch = canvas.height;
    const {
      target: curTarget,
      hudTheme: curTheme,
      showGrid: curGrid,
      liveReps: curReps,
      isRecording: curRec,
      facingMode: curFacing,
    } = stateRef.current;

    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, cw, ch);

    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const scale = Math.max(cw / vw, ch / vh);
      const dw = vw * scale;
      const dh = vh * scale;
      const dx = (cw - dw) / 2;
      const dy = (ch - dh) / 2;

      ctx.save();
      if (curFacing === 'user') {
        ctx.translate(cw, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, dx, dy, dw, dh);
      ctx.restore();
    }

    // Subtle cinematic vignette
    const gradTop = ctx.createLinearGradient(0, 0, 0, 150);
    gradTop.addColorStop(0, 'rgba(2, 6, 23, 0.72)');
    gradTop.addColorStop(1, 'rgba(2, 6, 23, 0)');
    ctx.fillStyle = gradTop;
    ctx.fillRect(0, 0, cw, 150);

    const gradBot = ctx.createLinearGradient(0, ch - 230, 0, ch);
    gradBot.addColorStop(0, 'rgba(2, 6, 23, 0)');
    gradBot.addColorStop(1, 'rgba(2, 6, 23, 0.86)');
    ctx.fillStyle = gradBot;
    ctx.fillRect(0, ch - 230, cw, 230);

    const accent =
      curTheme === 'red' ? '#FB7185' : curTheme === 'minimal' ? '#F8FAFC' : '#38BDF8';
    const accentBg =
      curTheme === 'red'
        ? 'rgba(244, 63, 94, 0.18)'
        : curTheme === 'minimal'
        ? 'rgba(248, 250, 252, 0.12)'
        : 'rgba(56, 189, 248, 0.18)';

    // Optional vertical bar-path alignment grid
    if (curGrid) {
      ctx.save();
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.16)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(cw / 2, 110);
      ctx.lineTo(cw / 2, ch - 210);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(248, 250, 252, 0.08)';
      ctx.beginPath();
      ctx.moveTo(40, ch / 2);
      ctx.lineTo(cw - 40, ch / 2);
      ctx.stroke();
      ctx.restore();
    }

    // Corner HUD brackets
    if (curTheme !== 'minimal') {
      const m = 24;
      const len = 26;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      // Top-left
      ctx.moveTo(m, m + len);
      ctx.lineTo(m, m);
      ctx.lineTo(m + len, m);
      // Top-right
      ctx.moveTo(cw - m - len, m);
      ctx.lineTo(cw - m, m);
      ctx.lineTo(cw - m, m + len);
      // Bottom-left
      ctx.moveTo(m, ch - m - len);
      ctx.lineTo(m, ch - m);
      ctx.lineTo(m + len, ch - m);
      // Bottom-right
      ctx.moveTo(cw - m - len, ch - m);
      ctx.lineTo(cw - m, ch - m);
      ctx.lineTo(cw - m, ch - m - len);
      ctx.stroke();
    }

    // Top-left badge: IRON CORE // TELEMETRY + REC
    const padX = 36;
    const topY = 44;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    ctx.beginPath();
    ctx.roundRect(padX, topY, 275, 44, 12);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Status dot
    ctx.beginPath();
    ctx.arc(padX + 20, topY + 22, 6, 0, Math.PI * 2);
    ctx.fillStyle = curRec ? '#EF4444' : '#34D399';
    ctx.fill();

    ctx.fillStyle = '#F8FAFC';
    ctx.font = 'bold 17px ui-monospace, SFMono-Regular, Menlo, monospace';
    const elapsed = curRec ? Date.now() - recStartRef.current : 0;
    const statusLabel = curRec ? `REC ${formatRecTime(elapsed)}` : 'IRON CORE · HUD';
    ctx.fillText(statusLabel, padX + 36, topY + 28);

    // Top-right: Program + Date
    ctx.textAlign = 'right';
    ctx.fillStyle = accent;
    ctx.font = 'bold 15px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(curTarget.programTitle.slice(0, 22).toUpperCase(), cw - padX, topY + 18);
    ctx.fillStyle = 'rgba(226, 232, 240, 0.75)';
    ctx.font = '13px ui-monospace, SFMono-Regular, Menlo, monospace';
    const nowStr = new Date().toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    ctx.fillText(nowStr, cw - padX, topY + 38);
    ctx.textAlign = 'left';

    // Bottom Telemetry Panel (F1 / GoPro style)
    const panelW = cw - padX * 2;
    const panelH = 148;
    const panelY = ch - panelH - 36;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.76)';
    ctx.beginPath();
    ctx.roundRect(padX, panelY, panelW, panelH, 20);
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Accent bar on left side of panel
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.roundRect(padX + 12, panelY + 16, 6, panelH - 32, 3);
    ctx.fill();

    // Exercise Name
    ctx.fillStyle = accent;
    ctx.font = 'bold 15px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(
      `ПОДХОД #${curTarget.setNumber}${curTarget.effectivePct > 0 ? ` · ${curTarget.effectivePct}% 1ПМ` : ''}`,
      padX + 32,
      panelY + 34
    );

    ctx.fillStyle = '#F8FAFC';
    ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
    const exLabel =
      curTarget.exerciseName.length > 28
        ? `${curTarget.exerciseName.slice(0, 28)}…`
        : curTarget.exerciseName;
    ctx.fillText(exLabel, padX + 32, panelY + 68);

    // Metric pills row: WEIGHT + REPS
    const pillY = panelY + 86;
    ctx.fillStyle = accentBg;
    ctx.beginPath();
    ctx.roundRect(padX + 32, pillY, 180, 44, 12);
    ctx.fill();
    ctx.fillStyle = '#F8FAFC';
    ctx.font = 'bold 22px ui-monospace, SFMono-Regular, Menlo, monospace';
    const weightText = curTarget.weightKg ? `${curTarget.weightKg} КГ` : 'СВОЙ ВЕС';
    ctx.fillText(weightText, padX + 46, pillY + 30);

    ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
    ctx.beginPath();
    ctx.roundRect(padX + 224, pillY, 175, 44, 12);
    ctx.fill();
    ctx.fillStyle = '#E2E8F0';
    ctx.font = 'bold 20px ui-monospace, SFMono-Regular, Menlo, monospace';
    const repLabel = curReps > 0 ? `ПОВТ ${curReps}/${curTarget.reps}` : `ПЛАН ×${curTarget.reps}`;
    ctx.fillText(repLabel, padX + 238, pillY + 29);

    if (curRec) {
      setRecMs(Date.now() - recStartRef.current);
    }

    rafRef.current = requestAnimationFrame(drawHudFrame);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError('');
    stopCamera();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Камера недоступна в этом браузере.');
      return;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
      } catch {
        // Fallback without audio if mic blocked
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      rafRef.current = requestAnimationFrame(drawHudFrame);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Нет доступа к камере';
      setCameraError(`Ошибка камеры: ${msg}. Разреши доступ в настройках iOS.`);
    }
  }, [facingMode, stopCamera, drawHudFrame]);

  useEffect(() => {
    const unsubscribe = subscribeAppLifecycle((state) => {
      isBgPausedRef.current = state === 'background' || state === 'hidden';
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }
    setLiveReps(0);
    setShareStatus('');
    if (!recordedUrl) {
      void startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode, recordedUrl, startCamera, stopCamera]);

  useEffect(() => {
    return () => {
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, [recordedUrl]);

  const handleStartRecording = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (typeof MediaRecorder === 'undefined') {
      setCameraError('Запись видео (MediaRecorder) не поддерживается этим браузером.');
      return;
    }

    NativeiOSBridge.haptic('heavy', hapticsEnabled);
    chunksRef.current = [];
    setLiveReps(0);
    setShareStatus('');

    try {
      const canvasStream = canvas.captureStream(30);
      const audioTracks = streamRef.current?.getAudioTracks() || [];
      audioTracks.forEach((track) => canvasStream.addTrack(track));

      const mime = pickSupportedMimeType();
      const recorder = mime
        ? new MediaRecorder(canvasStream, { mimeType: mime, videoBitsPerSecond: 4_000_000 })
        : new MediaRecorder(canvasStream);

      const finalMime = recorder.mimeType || mime || 'video/mp4';
      setRecordedMime(finalMime);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: finalMime });
        const url = URL.createObjectURL(blob);
        setRecordedBlob(blob);
        setRecordedUrl(url);
        setIsRecording(false);
        stopCamera();
      };

      recorderRef.current = recorder;
      recStartRef.current = Date.now();
      setRecMs(0);
      recorder.start(250);
      setIsRecording(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setCameraError(`Не удалось начать запись: ${msg}`);
    }
  };

  const handleStopRecording = () => {
    NativeiOSBridge.haptic('heavy', hapticsEnabled);
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  };

  const handleShareOrSave = async () => {
    if (!recordedBlob) return;
    NativeiOSBridge.haptic('medium', hapticsEnabled);
    const ext = recordedMime.includes('webm') ? 'webm' : 'mp4';
    const fileName = `ironcore_hud_${Date.now()}.${ext}`;
    const file = new File([recordedBlob], fileName, { type: recordedMime });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `IRON CORE · ${target.exerciseName}`,
          text: target.weightKg
            ? `${target.exerciseName} — ${target.weightKg} кг × ${target.reps}`
            : `${target.exerciseName} × ${target.reps}`,
        });
        setShareStatus('Готово ✓');
        return;
      } catch {
        // User cancelled or share failed; fall through
      }
    }

    // Direct download fallback
    if (recordedUrl) {
      const a = document.createElement('a');
      a.href = recordedUrl;
      a.download = fileName;
      a.click();
      setShareStatus('Файл скачан ✓');
    }
  };

  const handleRetake = () => {
    NativeiOSBridge.haptic('light', hapticsEnabled);
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl(null);
    setRecordedBlob(null);
    setShareStatus('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-slate-950 text-slate-50 flex flex-col">
      {/* Top Bar */}
      <div className="px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-2.5 flex items-center justify-between gap-2 bg-slate-950/90 border-b border-slate-400/10">
        <div className="min-w-0">
          <div className="text-xs font-extrabold tracking-wide text-sky-300 font-mono">
            🎬 HUD VIDEO TELEMETRY
          </div>
          <div className="text-[11px] text-slate-400 truncate">
            {target.exerciseName} {target.weightKg ? `· ${target.weightKg} кг` : ''} × {target.reps}
          </div>
        </div>
        <button
          onClick={() => {
            stopCamera();
            onClose();
          }}
          className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-400/15 text-xs font-bold text-slate-200 active:scale-90"
        >
          Закрыть ✕
        </button>
      </div>

      {/* Viewport */}
      <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden">
        <video ref={videoRef} playsInline muted className="hidden" />

        {recordedUrl ? (
          <video
            src={recordedUrl}
            controls
            playsInline
            autoPlay
            loop
            className="w-full h-full object-contain bg-black"
          />
        ) : (
          <canvas
            ref={canvasRef}
            width={720}
            height={1280}
            className="w-full h-full object-contain bg-black"
          />
        )}

        {cameraError && (
          <div className="absolute inset-x-4 top-4 p-3 rounded-2xl bg-rose-500/20 border border-rose-400/40 text-xs text-rose-200 font-mono">
            {cameraError}
          </div>
        )}

        {isRecording && (
          <button
            onClick={() => {
              NativeiOSBridge.haptic('light', hapticsEnabled);
              setLiveReps((r) => r + 1);
            }}
            className="absolute right-4 bottom-4 px-4 py-3 rounded-2xl bg-sky-400/25 border border-sky-400/60 backdrop-blur-md text-sky-100 font-mono text-xs font-extrabold active:scale-90"
          >
            +1 Повт ({liveReps})
          </button>
        )}
      </div>

      {/* Controls Footer */}
      <div className="px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-slate-950 border-t border-slate-400/10 space-y-3">
        {recordedUrl ? (
          <div className="space-y-2">
            {shareStatus && (
              <div className="text-center font-mono text-[11px] text-emerald-300">{shareStatus}</div>
            )}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={handleRetake}
                className="py-3.5 rounded-2xl bg-slate-900 border border-slate-400/15 text-slate-200 text-xs font-bold active:scale-95"
              >
                ↺ Переснять
              </button>
              <button
                onClick={() => void handleShareOrSave()}
                className="py-3.5 rounded-2xl bg-sky-400 text-slate-950 text-xs font-extrabold shadow-lg shadow-sky-400/25 active:scale-95"
              >
                ↗ Сохранить / Поделиться
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* HUD Style & Grid toggles */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {(['cyan', 'red', 'minimal'] as HudTheme[]).map((th) => (
                  <button
                    key={th}
                    onClick={() => {
                      NativeiOSBridge.haptic('light', hapticsEnabled);
                      setHudTheme(th);
                    }}
                    className={`px-2.5 py-1.5 rounded-xl font-mono text-[11px] font-bold transition-all ${
                      hudTheme === th
                        ? 'bg-sky-400 text-slate-950'
                        : 'bg-slate-900 text-slate-400'
                    }`}
                  >
                    {th === 'cyan' ? 'F1 Cyan' : th === 'red' ? 'Pro Red' : 'Minimal'}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    NativeiOSBridge.haptic('light', hapticsEnabled);
                    setShowGrid((g) => !g);
                  }}
                  className={`px-2.5 py-1.5 rounded-xl font-mono text-[11px] font-bold ${
                    showGrid ? 'bg-slate-800 text-sky-300' : 'bg-slate-900 text-slate-500'
                  }`}
                >
                  Сетка
                </button>
                <button
                  disabled={isRecording}
                  onClick={() => {
                    NativeiOSBridge.haptic('light', hapticsEnabled);
                    setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'));
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-900 text-slate-200 font-mono text-[11px] font-bold disabled:opacity-40"
                >
                  🔄 Камера
                </button>
              </div>
            </div>

            {/* Record Button */}
            <div className="flex items-center justify-center gap-4">
              {isRecording ? (
                <button
                  onClick={handleStopRecording}
                  className="w-full py-3.5 rounded-2xl bg-rose-500 text-white font-mono text-sm font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-rose-500/30 active:scale-95"
                >
                  <span>■</span>
                  <span>ОСТАНОВИТЬ ({formatRecTime(recMs)})</span>
                </button>
              ) : (
                <button
                  onClick={handleStartRecording}
                  className="w-full py-3.5 rounded-2xl bg-sky-400 text-slate-950 font-mono text-sm font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-sky-400/25 active:scale-95"
                >
                  <span>●</span>
                  <span>НАЧАТЬ ЗАПИСЬ С HUD</span>
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
