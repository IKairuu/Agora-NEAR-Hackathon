import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { storage } from './store/store';
import { loadAppData } from './lib/live';
import './styles/agora.css';
import './styles/responsive.css';
import './styles/filters.css';

// the prototype gates its entrance animations on a .js class, and remembers light or dark per viewer
document.documentElement.classList.add('js');
const theme = storage.get('agora-theme');
if (theme) document.documentElement.setAttribute('data-theme', theme);

// every record the app shows comes from the backend: the public market and the demo story
void loadAppData();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
