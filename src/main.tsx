import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import './styles/ios-optimizations.css';
import './styles/theme-tokens.css';

const LandingPage = lazy(() => import('./components/LandingPage').then((m) => ({ default: m.LandingPage })));
const isLandingRoute = window.location.pathname === '/landing' || window.location.pathname === '/landing/';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isLandingRoute ? (
      <Suspense fallback={<div className="min-h-dvh bg-[#090a0c]" />}>
        <LandingPage />
      </Suspense>
    ) : (
      <ErrorBoundary moduleName="IRON CORE">
        <App />
      </ErrorBoundary>
    )}
  </React.StrictMode>
);
