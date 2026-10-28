import { render } from 'preact';
import { App } from './App.tsx';
import { files } from './lib/filestore.ts';
import { CACHE_LIMIT } from './lib/source.ts';
import { hideSplash, initNative } from './native.ts';
import { hydrateStores } from './store.ts';
import './styles/app.css';

async function boot() {
  try {
    initNative();
  } catch (e) {
    // нативные плагины необязательны для работы словаря — не блокируем запуск
    console.error('initNative failed', e);
  }
  // Настройки нужны до первой отрисовки (язык интерфейса, тема)
  await hydrateStores().catch(() => undefined);
  const root = document.getElementById('app');
  if (!root) {
    hideSplash();
    throw new Error('#app not found');
  }
  render(<App />, root);
  requestAnimationFrame(hideSplash);
  // кэш «на лету» не раздуваем: оставляем последние файлы
  setTimeout(() => void files.trim('cache', CACHE_LIMIT).catch(() => undefined), 4000);
}

void boot();
