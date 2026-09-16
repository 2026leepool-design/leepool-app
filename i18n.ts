import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import tr from './locales/tr/translation.json';
import en from './locales/en/translation.json';
import es from './locales/es/translation.json';
import ru from './locales/ru/translation.json';

const resources = {
  tr: { translation: tr },
  en: { translation: en },
  es: { translation: es },
  ru: { translation: ru },
};

const getDeviceLocale = (): string => {
  const locales = Localization.getLocales();
  const preferredLocale = locales[0]?.languageCode ?? 'en';
  const supportedLanguages = ['tr', 'en', 'es', 'ru'];
  const baseLanguage = preferredLocale.split('-')[0];
  return supportedLanguages.includes(baseLanguage) ? baseLanguage : 'en';
};

i18n.use(initReactI18next).init({
  resources,
  lng: getDeviceLocale(),
  fallbackLng: 'en',
  compatibilityJSON: 'v4',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
