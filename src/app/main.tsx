import '@fontsource-variable/anybody/standard.css';
import '@fontsource-variable/atkinson-hyperlegible-next';
import './styles/base.css';
import './styles/court.css';
import './styles/organiser.css';
import './styles/tv.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { localStorageBackend } from './storage.ts';
import { StoreContext, createStore } from './store.ts';

const store = createStore(localStorageBackend());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreContext.Provider value={store}>
      <App />
    </StoreContext.Provider>
  </StrictMode>,
);
