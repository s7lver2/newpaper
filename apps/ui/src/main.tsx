import '@newpaper/ui-kit/fonts';
import '@newpaper/ui-kit';
import './shell/shell.css';
import './pages/pages.css';
import './app.css';
import './features';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
