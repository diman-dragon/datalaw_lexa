import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.datalaw.lexa',
  appName: 'Lexa',
  webDir: 'dist',
  android: {
    backgroundColor: '#E9DBC6',
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: false, // прячем вручную после гидрации (src/main.tsx)
      backgroundColor: '#E9DBC6',
      androidScaleType: 'CENTER_CROP',
    },
  },
};

export default config;
