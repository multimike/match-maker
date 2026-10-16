import '@fontsource-variable/anybody/standard.css';
import '@fontsource-variable/atkinson-hyperlegible-next';
import './styles/base.css';
import './styles/court.css';
import './styles/organiser.css';
import './styles/tv.css';
import './styles/phone.css';

import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, Shell } from './App.tsx';
import { cloudConfigured } from './cloud/config.ts';
import { localStorageBackend } from './storage.ts';
import { StoreContext, createStore } from './store.ts';

const root = createRoot(document.getElementById('root')!);
const render = (node: ReactNode) => root.render(<StrictMode><Shell>{node}</Shell></StrictMode>);

if (cloudConfigured) {
  // Firebase only loads when the cloud is set up.
  void import('./cloud/CloudApp.tsx').then(({ CloudApp }) => render(<CloudApp />));
} else {
  const store = createStore(localStorageBackend());
  render(
    <StoreContext.Provider value={store}>
      <App />
    </StoreContext.Provider>,
  );
}
