import '@fontsource-variable/inter';
import { render } from 'preact';
import { App } from './App.tsx';
import { hideSplash, initNative } from './native.ts';
import { hydrateStores } from './store.ts';
import './styles/app.css';

async function boot() {
  initNative();
  // Настройки нужны до первой отрисовки (язык интерфейса, тема)
  await hydrateStores().catch(() => undefined);
  const root = document.getElementById('app');
  if (!root) throw new Error('#app not found');
  render(<App />, root);
  requestAnimationFrame(hideSplash);
}

void boot();
