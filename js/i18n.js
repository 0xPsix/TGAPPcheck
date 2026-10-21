// Interface texts (not content). Content texts live in content/*.json.
import { LANGS } from './validate.js';

export const UI = {
  en: {
    appTitle: 'Checklist for students in China',
    loading: 'Loading…',
    loadError: "Couldn't load the checklist. Check your internet or VPN and try again.",
    retry: 'Try again',
    errorDetails: 'Technical details',
    notFound: 'This section was not found.',
    home: 'Home',
    links: 'Links',
  },
  ru: {
    appTitle: 'Чек-лист для студентов в Китае',
    loading: 'Загрузка…',
    loadError: 'Не удалось загрузить чек-лист. Проверьте интернет или VPN и попробуйте ещё раз.',
    retry: 'Повторить',
    errorDetails: 'Технические подробности',
    notFound: 'Раздел не найден.',
    home: 'На главную',
    links: 'Ссылки',
  },
};

const STORAGE_KEY = 'checklist.lang';

export function detectLang() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (LANGS.includes(stored)) return stored;
  } catch {
    // Storage unavailable: fall through to automatic detection.
  }
  const code =
    window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code || navigator.language || 'en';
  return code.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

export function saveLang(lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Storage unavailable: the choice lasts until the app is closed.
  }
}
