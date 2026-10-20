import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { bootTheme } from './lib/theme';
import { App } from './App';
import './styles/index.css';

bootTheme();

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
