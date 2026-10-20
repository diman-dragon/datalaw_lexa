import '@fontsource-variable/inter';
import { render } from 'preact';
import { App } from './App.tsx';
import { cacheTrim } from './lib/cache.ts';
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
  // Уборка кэша — после первого кадра, чтобы не мешать запуску
  setTimeout(() => void cacheTrim(), 4000);
}

void boot();
