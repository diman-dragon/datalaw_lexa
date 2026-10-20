import { useEffect, useRef } from 'preact/hooks';
import { Icon } from './components/Icon.tsx';
import type { IconName } from './components/Icon.tsx';
import { t } from './i18n.ts';
import { syncStatusBar, tap } from './native.ts';
import { navigate, tabOf, useRoute } from './router.ts';
import { AboutScreen } from './screens/About.tsx';
import { FindScreen } from './screens/Find.tsx';
import { HistoryScreen } from './screens/History.tsx';
import { HomeScreen } from './screens/Home.tsx';
import { SavedScreen } from './screens/Saved.tsx';
import { SettingsScreen } from './screens/Settings.tsx';
import { WordScreen } from './screens/Word.tsx';
import { settings, toast, useStore } from './store.ts';
import type { Route } from './router.ts';

const TABS: ReadonlyArray<{ name: 'home' | 'saved' | 'history'; icon: IconName; label: Parameters<typeof t>[0] }> = [
  { name: 'home', icon: 'search', label: 'navSearch' },
  { name: 'saved', icon: 'star', label: 'navSaved' },
  { name: 'history', icon: 'history', label: 'navHistory' },
];

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <HomeScreen />;
    case 'word':
      return <WordScreen key={route.word} word={route.word} />;
    case 'find':
      return <FindScreen key={route.query} query={route.query} />;
    case 'saved':
      return <SavedScreen />;
    case 'history':
      return <HistoryScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'about':
      return <AboutScreen />;
  }
}

/** Применяет тему и язык документа, синхронизирует цвет иконок статус-бара. */
function useAppearance() {
  const s = useStore(settings);
  useEffect(() => {
    const root = document.documentElement;
    // light — светло-коричневая, dark — AMOLED; auto — по системе
    const forced = s.theme === 'light' ? 'light' : s.theme === 'amoled' ? 'dark' : '';
    if (forced) root.dataset['theme'] = forced;
    else delete root.dataset['theme'];
    try {
      localStorage.setItem('datalaw_lexa-theme', forced);
    } catch {
      /* хранилище недоступно */
    }
    root.lang = s.uiLang;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => syncStatusBar(forced === 'dark' || (forced === '' && mq.matches));
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [s.theme, s.uiLang]);
}

export function App() {
  const route = useRoute();
  const current = useStore(toast);
  useStore(settings); // перерисовка при смене языка интерфейса
  useAppearance();

  const scroller = useRef<HTMLElement>(null);
  const routeKey = JSON.stringify(route);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [routeKey]);

  const activeTab = tabOf(route);

  return (
    <div class="app">
      <main class="screen" ref={scroller}>
        <div class="screen__inner">
          <Screen route={route} />
        </div>
      </main>

      {current ? (
        <div class="toast" key={current.id} role="status">
          {current.text}
        </div>
      ) : null}

      <nav class="tabbar" aria-label="Main">
        {TABS.map((tab) => (
          <button
            key={tab.name}
            type="button"
            class={activeTab === tab.name ? 'tabbar__item is-active' : 'tabbar__item'}
            aria-current={activeTab === tab.name ? 'page' : undefined}
            onClick={() => {
              tap();
              navigate({ name: tab.name }, activeTab === null ? false : true);
            }}
          >
            <span class="tabbar__icon">
              <Icon name={tab.icon} size={22} filled={activeTab === tab.name && tab.name === 'saved'} />
            </span>
            <span class="tabbar__label">{t(tab.label)}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
