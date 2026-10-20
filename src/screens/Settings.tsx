import { Header } from '../components/Header.tsx';
import { Icon } from '../components/Icon.tsx';
import { Segmented, Switch } from '../components/ui.tsx';
import { useResource } from '../hooks.ts';
import { t } from '../i18n.ts';
import { loadMeta } from '../lib/data.ts';
import { tap } from '../native.ts';
import { navigate } from '../router.ts';
import { settings, updateSettings, useStore } from '../store.ts';
import type { AccentPref, ThemeMode, UiLang } from '../store.ts';

const THEMES: ReadonlyArray<{ value: ThemeMode; label: 'themeAuto' | 'themeLight' | 'themeAmoled' }> = [
  { value: 'auto', label: 'themeAuto' },
  { value: 'light', label: 'themeLight' },
  { value: 'amoled', label: 'themeAmoled' },
];

export function SettingsScreen() {
  const s = useStore(settings);
  const meta = useResource('meta', loadMeta);
  const m = meta.data;
  const fmt = (n: number) => n.toLocaleString(s.uiLang === 'ru' ? 'ru-RU' : 'en-US');

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

      <section class="group">
        <h2 class="group__title">{t('setData')}</h2>
        {m ? (
          <>
            <p class="muted">
              {t('setDataInfo', { words: fmt(m.words), forms: fmt(m.forms), ru: fmt(m.ruTerms), sent: fmt(m.sentences) })}
            </p>
            <p class="muted">{t('setDataBuilt', { date: m.built.slice(0, 10) })}</p>
          </>
        ) : (
          <p class="muted">{t('dataMissingBody')}</p>
        )}
      </section>

      <button type="button" class="row row--card" onClick={() => navigate({ name: 'about' })}>
        <Icon name="info" size={20} />
        <span class="row__main">{t('setAbout')}</span>
        <Icon name="arrow-right" size={18} />
      </button>
      <p class="src src--center">{t('setVersion', { v: __APP_VERSION__ })}</p>
    </>
  );
}
