import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyLook, readLook } from './lib/look';
import './styles/tokens.css';
import './styles/base.css';
import './styles/landing.css';

// apply the saved accent, fill and theme before the first paint
applyLook(readLook());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
