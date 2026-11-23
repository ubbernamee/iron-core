import React from 'react';
import './landing-page.css';

type ScreenProps = { label: string; children: React.ReactNode; className?: string };

function PhoneFrame({ label, children, className = '' }: ScreenProps) {
  return (
    <div className={`landing-phone ${className}`} role="img" aria-label={label}>
      <div className="landing-phone__island" />
      <div className="landing-phone__status"><span>9:41</span><span>● ● ▰</span></div>
      <div className="landing-phone__screen">{children}</div>
      <div className="landing-phone__home" />
    </div>
  );
}

function WorkoutScreen() {
  return (
    <PhoneFrame label="Макет экрана IRON CORE с планом силовой тренировки">
      <div className="landing-phone__eyebrow">ПЛАН · НЕДЕЛЯ 1</div>
      <h3>Силовая база</h3>
      <p className="landing-phone__muted">День A · 4 упражнения</p>
      <div className="landing-phone__exercise"><span>Приседания со штангой</span><b>4 × 6</b><small>82,5 кг</small></div>
      <div className="landing-phone__exercise"><span>Жим лёжа</span><b>4 × 8</b><small>60 кг</small></div>
      <div className="landing-phone__exercise"><span>Тяга штанги</span><b>3 × 8</b><small>52,5 кг</small></div>
      <div className="landing-phone__timer"><span>Отдых</span><b>02:00</b><span>Запустить таймер</span></div>
    </PhoneFrame>
  );
}

function NutritionScreen() {
  return (
    <PhoneFrame label="Макет экрана IRON CORE с дневником питания" className="landing-phone--nutrition">
      <div className="landing-phone__eyebrow">ПИТАНИЕ · СЕГОДНЯ</div>
      <h3>Рацион дня</h3>
      <div className="landing-nutrition-ring"><span><b>1 640</b><small>из 2 200 ккал</small></span></div>
      <div className="landing-macros"><span><b>Белки</b>112 г</span><span><b>Жиры</b>58 г</span><span><b>Углеводы</b>176 г</span></div>
      <div className="landing-phone__meal"><span>Завтрак</span><b>Овсяная каша</b><small>420 ккал</small></div>
      <div className="landing-phone__meal"><span>Обед</span><b>Курица с рисом</b><small>610 ккал</small></div>
    </PhoneFrame>
  );
}

function ProfileScreen() {
  return (
    <PhoneFrame label="Макет экрана IRON CORE с профилем и облачной синхронизацией" className="landing-phone--profile">
      <div className="landing-phone__eyebrow">ПРОФИЛЬ · ДАННЫЕ</div>
      <h3>Твой прогресс</h3>
      <div className="landing-profile-row"><span>Цель</span><b>Сила и выносливость</b></div>
      <div className="landing-profile-row"><span>Программа</span><b>Силовая база</b></div>
      <div className="landing-profile-row"><span>Тренировок</span><b>История занятий</b></div>
      <div className="landing-sync"><i /> Данные хранятся на устройстве</div>
      <div className="landing-data-panel"><div><i /><i /><i /><span>iron core · backup</span></div><b>Резервная копия</b><small>Синхронизация через Supabase</small></div>
    </PhoneFrame>
  );
}

export function LandingPage() {
  return (
    <div className="landing-page">
      <a className="landing-skip" href="#main-content">Перейти к содержимому</a>
      <header className="landing-header">
        <a className="landing-brand" href="#top" aria-label="IRON CORE — наверх"><span className="landing-brand__mark" aria-hidden="true">+</span><span>IRON CORE</span></a>
        <nav className="landing-nav" aria-label="Разделы страницы">
          <a href="#training">Тренировки</a><a href="#nutrition">Питание</a><a href="#data">Данные</a>
        </nav>
        <a className="landing-header__cta" href="/">Открыть приложение <span aria-hidden="true">↗</span></a>
      </header>

      <main id="main-content">
        <section className="landing-hero" id="top" data-enter>
          <div className="landing-hero__copy">
            <p className="landing-kicker"><span /> Тренировки и питание в одном приложении</p>
            <h1>Силовые тренировки. Питание. <em>В одном месте.</em></h1>
            <p className="landing-hero__lead">IRON CORE помогает вести программу, рассчитывать рабочие веса и записывать рацион. Данные можно хранить на устройстве.</p>
            <a className="landing-button" href="/">Открыть IRON CORE <span aria-hidden="true">↗</span></a>
            <p className="landing-hero__note">Приложение для силовых тренировок и учёта питания</p>
          </div>
          <div className="landing-hero__visual" role="group" aria-label="Экраны приложения IRON CORE">
            <div className="landing-visual__glow" aria-hidden="true" />
            <WorkoutScreen />
            <NutritionScreen />
            <ProfileScreen />
            <span className="landing-visual__spark landing-visual__spark--one" aria-hidden="true">✳</span>
            <span className="landing-visual__spark landing-visual__spark--two" aria-hidden="true">✳</span>
          </div>
          <div className="landing-hero__edge" aria-hidden="true"><span>IRON CORE · СИЛОВЫЕ ТРЕНИРОВКИ</span><span>01 / 03</span></div>
        </section>

        <section className="landing-section landing-section--training" id="training">
          <div className="landing-section__intro"><p className="landing-kicker">01 · ПРОГРАММЫ</p><h2>План тренировки<br />с понятными весами.</h2><p>IRON CORE рассчитывает рабочие веса от одноповторного максимума и помогает отмечать подходы по ходу занятия.</p><a className="landing-text-link" href="/">Перейти к тренировке <span aria-hidden="true">↗</span></a></div>
          <div className="landing-section__art landing-section__art--training"><WorkoutScreen /><div className="landing-data-chip"><span>РАСЧЁТ ВЕСА</span><b>от 1ПМ</b><small>Для каждого упражнения</small></div></div>
        </section>

        <section className="landing-section landing-section--nutrition" id="nutrition">
          <div className="landing-section__art landing-section__art--nutrition"><NutritionScreen /><div className="landing-recipe-card"><span className="landing-recipe-card__icon" aria-hidden="true">◒</span><div><b>Рацион и рецепты</b><small>Дневник питания и КБЖУ</small></div><span aria-hidden="true">↗</span></div></div>
          <div className="landing-section__intro"><p className="landing-kicker">02 · ПИТАНИЕ</p><h2>Рацион рядом<br />с планом занятий.</h2><p>Записывай приёмы пищи, следи за калориями и макронутриентами. Рецепты и список покупок находятся в той же кухонной вкладке.</p><a className="landing-text-link" href="/">Открыть кухню <span aria-hidden="true">↗</span></a></div>
        </section>

        <section className="landing-section landing-section--data" id="data">
          <div className="landing-section__intro"><p className="landing-kicker">03 · ИСТОРИЯ И ДАННЫЕ</p><h2>Твои занятия<br />и настройки.</h2><p>Сохраняй историю тренировок на устройстве. При подключённом Supabase доступны облачная резервная копия и совместный зал.</p><a className="landing-text-link" href="/">Посмотреть приложение <span aria-hidden="true">↗</span></a></div>
          <div className="landing-section__art landing-section__art--data"><ProfileScreen /><div className="landing-data-grid"><div><span>РАСЧЁТЫ</span><b>1ПМ</b></div><div><span>ПЛАНЫ</span><b>Программы</b></div><div><span>ПИТАНИЕ</span><b>КБЖУ</b></div><div><span>СИНХРОНИЗАЦИЯ</span><b>Supabase</b></div></div></div>
        </section>

        <section className="landing-close"><div><p className="landing-kicker">IRON CORE</p><h2>Открой приложение<br />и начни с плана.</h2></div><a className="landing-button" href="/">Открыть IRON CORE <span aria-hidden="true">↗</span></a><span className="landing-close__plus" aria-hidden="true">+</span></section>
      </main>
      <footer className="landing-footer"><a className="landing-brand" href="#top"><span className="landing-brand__mark" aria-hidden="true">+</span><span>IRON CORE</span></a><span>Тренировки, питание и история занятий</span><a href="/">Перейти в приложение <span aria-hidden="true">↗</span></a></footer>
    </div>
  );
}
