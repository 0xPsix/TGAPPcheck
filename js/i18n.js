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
    design: 'Design',
    introTitle: 'Settling into Shanghai, one step at a time.',
    introText: 'Choose where you are in your journey: prepare before you fly, or find your next steps after arrival.',
    whatToBring: 'What to bring:',
    important: 'Important:',
    progress: '{done} of {total} completed',
    completedStep: 'Completed: {title}',
    allDone: 'Completed ✓',
    progressTotal: '{done} of {total} steps completed',
    resume: 'Resume at step {n}',
    progressUnavailable: 'Progress unavailable',
    progressNotSaved: 'Progress cannot be saved on this device. Changes will be lost when you close or reload the app.',
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
    design: 'Дизайн',
    introTitle: 'Обустройство в Шанхае — шаг за шагом.',
    introText: 'Выберите свой этап: подготовка перед вылетом или первые шаги после приезда.',
    whatToBring: 'Что взять с собой:',
    important: 'Важно:',
    progress: 'Выполнено: {done} из {total}',
    completedStep: 'Выполнено: {title}',
    allDone: 'Готово ✓',
    progressTotal: 'Выполнено шагов: {done} из {total}',
    resume: 'Продолжить с шага {n}',
    progressUnavailable: 'Прогресс недоступен',
    progressNotSaved: 'На этом устройстве не удаётся сохранить прогресс. Изменения пропадут при закрытии или перезагрузке приложения.',
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
