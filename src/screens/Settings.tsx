import { useEffect, useRef, useState } from 'preact/hooks';
import { Header } from '../components/Header.tsx';
import { Icon } from '../components/Icon.tsx';
import { ProgressBar, Segmented, Switch } from '../components/ui.tsx';
import { useResource } from '../hooks.ts';
import { t } from '../i18n.ts';
import { loadMeta } from '../lib/data.ts';
import type { Progress } from '../lib/download.ts';
import { cacheCount, clearCache, fetchManifest, installPack, packInfo, removePack } from '../lib/pack.ts';
import type { PackInfo } from '../lib/pack.ts';
import { tap } from '../native.ts';
import { navigate } from '../router.ts';
import { settings, showToast, updateSettings, useStore } from '../store.ts';
import type { AccentPref, ThemeMode, UiLang } from '../store.ts';

const THEMES: ReadonlyArray<{ value: ThemeMode; label: 'themeAuto' | 'themeLight' | 'themeAmoled' }> = [
  { value: 'auto', label: 'themeAuto' },
  { value: 'light', label: 'themeLight' },
  { value: 'amoled', label: 'themeAmoled' },
];

const mb = (bytes: number) => Math.max(1, Math.round(bytes / 1048576));

function DataSection() {
  const s = useStore(settings);
  const meta = useResource('meta', loadMeta);
  const m = meta.data;
  const fmt = (n: number) => n.toLocaleString(s.uiLang === 'ru' ? 'ru-RU' : 'en-US');

  const [info, setInfo] = useState<PackInfo | null>(null);
  const [remote, setRemote] = useState<{ version: string; total: number } | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [cached, setCached] = useState(0);
  const ctrl = useRef<AbortController | null>(null);
  const busy = progress !== null;

  const refresh = async () => {
    setInfo(await packInfo());
    setCached(await cacheCount());
    try {
      const man = await fetchManifest();
      setRemote({ version: man.version, total: man.total });
    } catch {
      setRemote(null); // нет сети — просто не знаем размер
    }
  };
  useEffect(() => {
    void refresh();
    return () => ctrl.current?.abort();
  }, []);

  const download = async () => {
    tap();
    const c = new AbortController();
    ctrl.current = c;
    setProgress({ files: 0, totalFiles: 1, bytes: 0, totalBytes: remote?.total ?? 1 });
    try {
      await installPack(setProgress, c.signal);
      showToast(t('toastDownloaded'));
    } catch (e) {
      showToast(e instanceof DOMException && e.name === 'AbortError' ? t('toastDownloadCancelled') : t('toastDownloadFailed'));
    } finally {
      ctrl.current = null;
      setProgress(null);
      await refresh();
    }
  };

  const remove = async () => {
    if (!window.confirm(t('dataRemoveConfirm'))) return;
    await removePack();
    showToast(t('toastRemovedPack'));
    await refresh();
  };

  const wipeCache = async () => {
    await clearCache();
    showToast(t('toastCacheCleared'));
    setCached(await cacheCount());
  };

  const installed = info?.installed === true;
  const hasUpdate = installed && remote !== null && remote.version !== info?.version;
  const size = remote?.total ?? info?.bytes;

  return (
    <section class="group">
      <h2 class="group__title">{t('setData')}</h2>
      <div class="datastate">
        <div class="datastate__head">
          <Icon name="offline" size={20} />
          <span>{installed ? t('dataModeOffline') : t('dataModeOnline')}</span>
          {hasUpdate ? <span class="badge">{t('dataUpdate')}</span> : null}
        </div>
        <p class="muted">{installed ? t('dataModeOfflineBody') : t('dataModeOnlineBody')}</p>
        {m ? (
          <p class="muted">
            {t('dataInfo', { words: fmt(m.words), forms: fmt(m.forms), ru: fmt(m.ruTerms), sent: fmt(m.sentences) })}
            {' · '}
            {t('dataBuilt', { date: (info?.version ?? m.built).slice(0, 10) })}
          </p>
        ) : null}

        {busy ? (
          <>
            <ProgressBar value={progress.totalBytes > 0 ? progress.bytes / progress.totalBytes : 0} label={t('dataDownloading', { done: '', total: '' })} />
            <p class="muted">{t('dataDownloading', { done: String(mb(progress.bytes)), total: String(mb(progress.totalBytes)) })}</p>
            <button type="button" class="btn btn--outline btn--block" onClick={() => ctrl.current?.abort()}>
              {t('dataCancel')}
            </button>
          </>
        ) : !installed || hasUpdate ? (
          <button type="button" class="btn btn--primary btn--block" onClick={() => void download()} disabled={!installed && remote === null}>
            {hasUpdate ? t('dataUpdateAction') : size ? t('dataDownloadSize', { mb: String(mb(size)) }) : t('dataDownload')}
          </button>
        ) : (
          <p class="muted">{t('dataUpToDate')}</p>
        )}

        {installed && !busy ? (
          <button type="button" class="btn btn--danger btn--block" onClick={() => void remove()}>
            {t('dataRemove')}
          </button>
        ) : null}

        {!installed && cached > 0 ? (
          <div class="field field--row">
            <span class="muted">{t('dataCache', { n: fmt(cached) })}</span>
            <button type="button" class="btn btn--text" onClick={() => void wipeCache()}>
              {t('dataCacheClear')}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function SettingsScreen() {
  const s = useStore(settings);

  return (
    <>
      <Header back title={t('settingsTitle')} />

      <section class="group">
        <h2 class="group__title">{t('setAppearance')}</h2>
        <span class="field__label">{t('setTheme')}</span>
        <div class="themes" role="radiogroup" aria-label={t('setTheme')}>
          {THEMES.map((th) => (
            <button
              key={th.value}
              type="button"
              role="radio"
              aria-checked={s.theme === th.value}
              class={s.theme === th.value ? 'theme-card is-active' : 'theme-card'}
              onClick={() => {
                tap();
                updateSettings({ theme: th.value });
              }}
            >
              <span class={`theme-card__swatch theme-card__swatch--${th.value}`} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span class="theme-card__label">{t(th.label)}</span>
              {th.value === 'auto' ? <span class="theme-card__hint">{t('themeAutoHint')}</span> : null}
            </button>
          ))}
        </div>
      </section>

      <section class="group">
        <h2 class="group__title">{t('setLanguage')}</h2>
        <div class="field">
          <span class="field__label">{t('setUiLang')}</span>
          <Segmented<UiLang>
            variant="pills"
            value={s.uiLang}
            onChange={(uiLang) => updateSettings({ uiLang })}
            options={[
              { value: 'ru', label: 'Русский' },
              { value: 'en', label: 'English' },
            ]}
          />
        </div>
      </section>

      <section class="group">
        <h2 class="group__title">{t('setPronunciation')}</h2>
        <div class="field">
          <span class="field__label">{t('setAccent')}</span>
          <Segmented<AccentPref>
            variant="pills"
            value={s.accent}
            onChange={(accent) => updateSettings({ accent })}
            options={[
              { value: 'us', label: 'US' },
              { value: 'uk', label: 'UK' },
            ]}
          />
        </div>
      </section>

      <section class="group">
        <h2 class="group__title">{t('setBehavior')}</h2>
        <div class="field field--row">
          <span class="field__label">{t('setHaptics')}</span>
          <Switch checked={s.haptics} onChange={(haptics) => updateSettings({ haptics })} label={t('setHaptics')} />
        </div>
      </section>

      <DataSection />

      <button type="button" class="row row--card" onClick={() => navigate({ name: 'about' })}>
        <Icon name="info" size={20} />
        <span class="row__main">{t('setAbout')}</span>
        <Icon name="arrow-right" size={18} />
      </button>
      <p class="src src--center">{t('setVersion', { v: __APP_VERSION__ })}</p>
    </>
  );
}
