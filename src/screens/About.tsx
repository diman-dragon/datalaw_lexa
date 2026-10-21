import { Header } from '../components/Header.tsx';
import { LogoMark } from '../components/Icon.tsx';
import { t } from '../i18n.ts';

export function AboutScreen() {
  return (
    <>
      <Header back title={t('aboutTitle')} />
      <div class="about">
        <div class="brand">
          <LogoMark size={44} />
          <div>
            <div class="brand__name">DataLaw DesignLab</div>
            <div class="brand__sub">Lexa · datalaw_lexa {__APP_VERSION__}</div>
          </div>
        </div>
        <p>{t('aboutIntro')}</p>

        <h2 class="section__title">{t('aboutSources')}</h2>
        <ul class="bullets">
          <li>{t('aboutWikt')}</li>
          <li>{t('aboutFreq')}</li>
          <li>{t('aboutTat')}</li>
        </ul>
        <p class="muted">{t('aboutLicenseNote')}</p>

        <h2 class="section__title">{t('aboutPrivacyTitle')}</h2>
        <p>{t('aboutPrivacy')}</p>
      </div>
    </>
  );
}
