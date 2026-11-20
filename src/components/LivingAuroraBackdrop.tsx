import React from 'react';
import { TabId } from '../types';

export interface TabTheme {
  orb1: string;
  orb2: string;
  orb3: string;
  accentHex: string;
  accentRgb: string;
  accentText: string;
  accentBg: string;
}

export const TAB_THEMES: Record<TabId, TabTheme> = {
  workout: {
    orb1: 'rgba(56, 189, 248, 0.16)',
    orb2: 'rgba(16, 185, 129, 0.11)',
    orb3: 'rgba(99, 102, 241, 0.12)',
    accentHex: '#38BDF8',
    accentRgb: '56, 189, 248',
    accentText: 'text-sky-300',
    accentBg: 'bg-sky-400 hover:bg-sky-300 text-slate-950',
  },
  recipes: {
    orb1: 'rgba(245, 158, 11, 0.15)',
    orb2: 'rgba(249, 115, 22, 0.1)',
    orb3: 'rgba(56, 189, 248, 0.09)',
    accentHex: '#FBBF24',
    accentRgb: '251, 191, 36',
    accentText: 'text-amber-300',
    accentBg: 'bg-amber-400 hover:bg-amber-300 text-slate-950',
  },
  fridge: {
    orb1: 'rgba(45, 212, 191, 0.16)',
    orb2: 'rgba(56, 189, 248, 0.11)',
    orb3: 'rgba(16, 185, 129, 0.1)',
    accentHex: '#2DD4BF',
    accentRgb: '45, 212, 191',
    accentText: 'text-teal-300',
    accentBg: 'bg-teal-400 hover:bg-teal-300 text-slate-950',
  },
  calc: {
    orb1: 'rgba(139, 92, 246, 0.16)',
    orb2: 'rgba(56, 189, 248, 0.11)',
    orb3: 'rgba(236, 72, 153, 0.08)',
    accentHex: '#A78BFA',
    accentRgb: '167, 139, 250',
    accentText: 'text-violet-300',
    accentBg: 'bg-violet-400 hover:bg-violet-300 text-slate-950',
  },
};

interface LivingAuroraBackdropProps {
  activeTab: TabId;
  timerRunning: boolean;
}

export const LivingAuroraBackdrop: React.FC<LivingAuroraBackdropProps> = ({ activeTab, timerRunning }) => {
  const theme = TAB_THEMES[activeTab] || TAB_THEMES.workout;
  return (
    <div className="aurora-canvas" aria-hidden="true">
      <div
        style={{ background: timerRunning ? 'rgba(16, 185, 129, 0.2)' : theme.orb1 }}
        className="aurora-orb orb-1 -top-24 -left-20 w-[360px] h-[360px] sm:w-[520px] sm:h-[520px]"
      />
      <div
        style={{ background: theme.orb2 }}
        className="aurora-orb orb-2 top-1/3 -right-24 w-[320px] h-[320px] sm:w-[460px] sm:h-[460px]"
      />
      <div
        style={{ background: theme.orb3 }}
        className="aurora-orb orb-3 -bottom-24 left-1/4 w-[340px] h-[340px] sm:w-[480px] sm:h-[480px]"
      />
    </div>
  );
};
