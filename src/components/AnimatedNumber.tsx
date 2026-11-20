import React, { useEffect, useRef, useState } from 'react';

interface AnimatedNumberProps {
  value: number;
  decimals?: number;
}

export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({ value, decimals = 0 }) => {
  const numericTarget = Number(value) || 0;
  const [displayVal, setDisplayVal] = useState<number>(numericTarget);
  const prevValRef = useRef<number>(numericTarget);

  useEffect(() => {
    const startVal = prevValRef.current;
    const endVal = numericTarget;
    if (Math.abs(endVal - startVal) < 0.01) {
      setDisplayVal(endVal);
      prevValRef.current = endVal;
      return;
    }
    const duration = 320;
    const startTime = performance.now();
    let frameId = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const easeOut = 1 - Math.pow(1 - t, 3);
      const current = startVal + (endVal - startVal) * easeOut;
      setDisplayVal(current);
      if (t < 1) {
        frameId = requestAnimationFrame(tick);
      } else {
        setDisplayVal(endVal);
        prevValRef.current = endVal;
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [numericTarget]);

  if (decimals > 0) return <>{Number(displayVal.toFixed(decimals))}</>;
  const isHalf = Math.abs(numericTarget % 1) > 0.01;
  if (isHalf) return <>{(Math.round(displayVal * 4) / 4).toString()}</>;
  return <>{Math.round(displayVal)}</>;
};
