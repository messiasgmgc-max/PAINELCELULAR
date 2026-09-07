import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.phonecenter.app',
  appName: 'Phone Center',
  webDir: 'public',
  server: {
    url: process.env.CAPACITOR_SERVER_URL || 'https://app.phonecenter.tech',
    cleartext: true,
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#09090b',
      showSpinner: false
    }
  }
};

export default config;
