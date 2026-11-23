import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { LandingPage } from './components/LandingPage';
import './index.css';
import './styles/ios-optimizations.css';
import './styles/theme-tokens.css';

const isLandingRoute = window.location.pathname === '/landing' || window.location.pathname === '/landing/';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isLandingRoute ? <LandingPage /> : <App />}
  </React.StrictMode>
);
