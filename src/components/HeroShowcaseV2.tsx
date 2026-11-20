import React from 'react';
import './hero-showcase-v2.css';

export interface HeroScheduleItem {
  id: string;
  day: string;
  title: string;
  timeOrMetric: string;
}

export interface HeroShowcaseV2Props {
  brandName?: string;
  headlineLine1?: string;
  headlineLine2?: string;
  description?: string;
  primaryCtaLabel?: string;
  secondaryCtaLabel?: string;
  scheduleTitle?: string;
  scheduleBadge?: string;
  scheduleItems?: HeroScheduleItem[];
  features?: [string, string, string];
  onStartWorkout?: () => void;
  onOpenNutrition?: () => void;
  onOpen3DOrCamera?: () => void;
  onNavigateTab?: (tab: 'workouts' | 'kitchen' | '3d-camera') => void;
}

const DEFAULT_SCHEDULE: HeroScheduleItem[] = [
  {
    id: 'mon',
    day: 'Понедельник',
    title: 'Присед / Жим · Цикл 1ПМ',
    timeOrMetric: '18:00',
  },
  {
    id: 'thu',
    day: 'Четверг',
    title: 'Тяга / Акцент · КБЖУ контроль',
    timeOrMetric: '18:30',
  },
];

const DEFAULT_FEATURES: [string, string, string] = [
  'Расчёт от 1ПМ и таймер',
  'КБЖУ, рецепты и список покупок',
  '3D-нагрузка, видео и Co-op',
];

export const HeroShowcaseV2: React.FC<HeroShowcaseV2Props> = ({
  brandName = 'IRON CORE',
  headlineLine1 = 'Твой личный центр',
  headlineLine2 = 'силы и питания',
  description = 'Онлайн-платформа для тренировок и рациона: расчёт весов от 1ПМ, таймер подходов, КБЖУ, рецепты и совместный зал — в одном месте.',
  primaryCtaLabel = 'Начать тренировку',
  secondaryCtaLabel = 'КБЖУ и рецепты',
  scheduleTitle = 'План и сводка',
  scheduleBadge = '1ПМ · КБЖУ',
  scheduleItems = DEFAULT_SCHEDULE,
  features = DEFAULT_FEATURES,
  onStartWorkout,
  onOpenNutrition,
  onOpen3DOrCamera,
  onNavigateTab,
}) => {
  const handleNav = (tab: 'workouts' | 'kitchen' | '3d-camera') => {
    onNavigateTab?.(tab);
    if (tab === 'workouts') onStartWorkout?.();
    if (tab === 'kitchen') onOpenNutrition?.();
    if (tab === '3d-camera') onOpen3DOrCamera?.();
  };

  return (
    <section
      className="ic-hero-v2"
      style={{
        padding: 'clamp(20px, 3.6vw, 40px)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <div className="ic-hero-v2__texture" aria-hidden="true" />

      <header className="ic-hero-v2__top">
        <div className="ic-hero-v2__brand">
          <span className="ic-hero-v2__mark" aria-hidden="true">
            +
          </span>
          <span>{brandName}</span>
        </div>

        <nav className="ic-hero-v2__nav" aria-label="Основная навигация">
          <button
            type="button"
            className="ic-hero-v2__pill"
            onClick={() => handleNav('workouts')}
          >
            Тренировки
          </button>
          <button
            type="button"
            className="ic-hero-v2__pill"
            onClick={() => handleNav('kitchen')}
          >
            Кухня
          </button>
          <button
            type="button"
            className="ic-hero-v2__pill"
            onClick={() => handleNav('3d-camera')}
          >
            3D / Камера
          </button>
        </nav>
      </header>

      <div className="ic-hero-v2__body-row">
        <div>
          <h1 className="ic-hero-v2__title">
            {headlineLine1}
            <br />
            {headlineLine2}
          </h1>

          <p className="ic-hero-v2__subtitle">{description}</p>

          <div className="ic-hero-v2__actions">
            <button
              type="button"
              className="ic-hero-v2__cta-primary"
              onClick={onStartWorkout ?? (() => handleNav('workouts'))}
            >
              <span>{primaryCtaLabel}</span>
              <span aria-hidden="true">↗</span>
            </button>

            <button
              type="button"
              className="ic-hero-v2__cta-secondary"
              onClick={onOpenNutrition ?? (() => handleNav('kitchen'))}
            >
              <span>{secondaryCtaLabel}</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        <aside className="ic-hero-v2__widget" aria-label={scheduleTitle}>
          <div className="ic-hero-v2__widget-head">
            <span>{scheduleTitle}</span>
            <span>{scheduleBadge}</span>
          </div>

          <div>
            {scheduleItems.slice(0, 2).map((item) => (
              <div key={item.id} className="ic-hero-v2__slot">
                <div className="ic-hero-v2__slot-day">{item.day}</div>
                <div className="ic-hero-v2__slot-meta">
                  <span>{item.title}</span>
                  <span>{item.timeOrMetric}</span>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <footer className="ic-hero-v2__footer">
        <div className="ic-hero-v2__footer-item">{features[0]}</div>
        <div className="ic-hero-v2__footer-item">{features[1]}</div>
        <div className="ic-hero-v2__footer-item">{features[2]}</div>
      </footer>
    </section>
  );
};
