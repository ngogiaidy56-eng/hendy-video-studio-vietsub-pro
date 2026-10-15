import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root mount node');
createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);

// The service worker caches only the app shell/static assets; API responses and signed media are never cached.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(error => console.warn('Hendy Studio offline shell registration failed', error));
  }, { once: true });
}
