import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, PoseLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { NativeiOSBridge } from '../engine/iosBridge';

interface FormCheckVisionProps {
  isOpen: boolean;
  onClose: () => void;
  hapticsEnabled: boolean;
}

interface FormMetrics {
  kneeAngleDeg: number;
  shoulderTiltDeg: number;
  valgusAlert: boolean;
  depthStatus: 'Стоим' | 'Недосед' | 'Параллель ✓' | 'Глубоко ✓';
}

function calcAngle(a: NormalizedLandmark, b: NormalizedLandmark, c: NormalizedLandmark): number {
  const rad = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let deg = Math.abs((rad * 180) / Math.PI);
  if (deg > 180) deg = 360 - deg;
  return Math.round(deg);
}

const POSE_CONNECTIONS: [number, number][] = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
];

export const FormCheckVision: React.FC<FormCheckVisionProps> = ({ isOpen, onClose, hapticsEnabled }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<string>('Загрузка GPU-модели MediaPipe...');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [metrics, setMetrics] = useState<FormMetrics>({
    kneeAngleDeg: 180,
    shoulderTiltDeg: 0,
    valgusAlert: false,
    depthStatus: 'Стоим',
  });

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    let stream: MediaStream | null = null;
    let landmarker: PoseLandmarker | null = null;
    let rafId = 0;

    const start = async () => {
      try {
        setStatus('Запуск камеры и GPU-скелета...');
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (!active || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
        );
        if (!active) return;

        landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
        });

        if (!active) return;
        setStatus('Активно · Анализ биомеханики на GPU');

        let lastVideoTime = -1;
        const loop = () => {
          if (!active || !videoRef.current || !canvasRef.current || !landmarker) return;
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            const ctx = canvas.getContext('2d')!;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const res = landmarker.detectForVideo(video, performance.now());
            const lm = res.landmarks?.[0];
            if (lm && lm.length >= 29) {
              // Draw skeleton
              ctx.lineWidth = 4;
              ctx.strokeStyle = '#38BDF8';
              POSE_CONNECTIONS.forEach(([i, j]) => {
                const p1 = lm[i];
                const p2 = lm[j];
                if ((p1.visibility ?? 1) > 0.4 && (p2.visibility ?? 1) > 0.4) {
                  ctx.beginPath();
                  ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
                  ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
                  ctx.stroke();
                }
              });

              // Key joints
              [11, 12, 23, 24, 25, 26, 27, 28].forEach((idx) => {
                const p = lm[idx];
                ctx.fillStyle = '#34D399';
                ctx.beginPath();
                ctx.arc(p.x * canvas.width, p.y * canvas.height, 6, 0, Math.PI * 2);
                ctx.fill();
              });

              // Biomechanics: Knee Angle (Left/Right average)
              const lKnee = calcAngle(lm[23], lm[25], lm[27]);
              const rKnee = calcAngle(lm[24], lm[26], lm[28]);
              const avgKnee = Math.round((lKnee + rKnee) / 2);

              // Shoulder tilt (bar levelness)
              const shoulderTilt = Math.round(
                Math.abs((Math.atan2(lm[12].y - lm[11].y, lm[12].x - lm[11].x) * 180) / Math.PI)
              );
              const normalizedTilt = shoulderTilt > 90 ? 180 - shoulderTilt : shoulderTilt;

              // Knee Valgus check (front view: knee distance narrower than ankle distance during squat)
              const kneeDist = Math.abs(lm[25].x - lm[26].x);
              const ankleDist = Math.abs(lm[27].x - lm[28].x);
              const valgus = avgKnee < 135 && ankleDist > 0.05 && kneeDist < ankleDist * 0.78;

              let depthStatus: FormMetrics['depthStatus'] = 'Стоим';
              if (avgKnee <= 82) depthStatus = 'Глубоко ✓';
              else if (avgKnee <= 98) depthStatus = 'Параллель ✓';
              else if (avgKnee <= 135) depthStatus = 'Недосед';

              setMetrics({
                kneeAngleDeg: avgKnee,
                shoulderTiltDeg: normalizedTilt,
                valgusAlert: valgus,
                depthStatus,
              });
            }
          }
          rafId = requestAnimationFrame(loop);
        };
        rafId = requestAnimationFrame(loop);
      } catch (err) {
        setStatus(err instanceof Error ? `Ошибка камеры/GPU: ${err.message}` : 'Нет доступа к камере');
      }
    };

    void start();

    return () => {
      active = false;
      cancelAnimationFrame(rafId);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      landmarker?.close();
    };
  }, [isOpen, facingMode]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[75] bg-[#03050A]/98 backdrop-blur-2xl flex flex-col justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between gap-2 max-w-xl w-full mx-auto">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-sky-300 font-bold">
            MediaPipe GPU · AI Form Check
          </div>
          <div className="text-xs text-slate-400 mt-0.5">{status}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              NativeiOSBridge.haptic('light', hapticsEnabled);
              setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'));
            }}
            className="px-3 py-2 rounded-xl slate-pill text-xs font-mono text-slate-100 active:scale-90"
          >
            🔄 Камера
          </button>
          <button
            onClick={() => {
              NativeiOSBridge.haptic('light', hapticsEnabled);
              onClose();
            }}
            className="px-3 py-2 rounded-xl slate-pill text-xs font-bold text-slate-100 active:scale-90"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Camera + Live Skeleton Canvas */}
      <div className="relative flex-1 max-w-xl w-full mx-auto my-3 rounded-[26px] overflow-hidden slate-well">
        <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover pointer-events-none" />

        {metrics.valgusAlert && (
          <div className="absolute top-3 inset-x-3 py-2 px-3 rounded-2xl bg-red-500/85 text-white font-mono text-xs font-extrabold text-center animate-pulse">
            ⚠️ Внимание: завал коленей внутрь (Вальгус)
          </div>
        )}
      </div>

      {/* Live Biomechanics Telemetry Cards */}
      <div className="grid grid-cols-3 gap-2 max-w-xl w-full mx-auto">
        <div className="slate-card rounded-2xl p-3 text-center">
          <div className="text-[10px] text-slate-400">Угол колена</div>
          <div className="font-mono tabular text-lg font-extrabold text-sky-300 mt-0.5">{metrics.kneeAngleDeg}°</div>
        </div>
        <div className="slate-card rounded-2xl p-3 text-center">
          <div className="text-[10px] text-slate-400">Глубина</div>
          <div className="font-mono text-xs font-extrabold text-emerald-300 mt-1.5">{metrics.depthStatus}</div>
        </div>
        <div className="slate-card rounded-2xl p-3 text-center">
          <div className="text-[10px] text-slate-400">Перекос плеч</div>
          <div
            className={`font-mono tabular text-lg font-extrabold mt-0.5 ${
              metrics.shoulderTiltDeg > 8 ? 'text-amber-300' : 'text-slate-100'
            }`}
          >
            {metrics.shoulderTiltDeg}°
          </div>
        </div>
      </div>
    </div>
  );
};
