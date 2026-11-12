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
    darkMode: 'Dark mode',
    language: 'Language',
    introTitle: 'Settling into Shanghai, one step at a time.',
    introText: 'Choose where you are in your journey: prepare before you fly, or find your next steps after arrival.',
    searchSteps: 'Search steps…',
    clearSearch: 'Clear search',
    searchResults: 'Search results',
    searchCount: 'Results: {count}',
    searchEmpty: 'No matching steps. Try another word.',
    searchIncomplete: 'Some categories could not load. Search results may be incomplete.',
    whatToBring: 'What to bring:',
    important: 'Important:',
    progress: '{done} of {total} completed',
    completedStep: 'Completed: {title}',
    allDone: 'Completed ✓',
    progressTotal: '{done} of {total} steps completed',
    resume: 'Resume at step {n}',
    startChecklist: 'Start checklist',
    continueChecklist: 'Continue',
    chinesePhrases: 'Useful Chinese phrases',
    copyChinese: 'Copy Chinese',
    copied: 'Copied',
    copyFailed: 'Could not copy. Select the Chinese text to copy it manually.',
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
    darkMode: 'Тёмная тема',
    language: 'Язык',
    introTitle: 'Обустройство в Шанхае — шаг за шагом.',
    introText: 'Выберите свой этап: подготовка перед вылетом или первые шаги после приезда.',
    searchSteps: 'Поиск по шагам…',
    clearSearch: 'Очистить поиск',
    searchResults: 'Результаты поиска',
    searchCount: 'Найдено: {count}',
    searchEmpty: 'Шаги не найдены. Попробуйте другое слово.',
    searchIncomplete: 'Не удалось загрузить некоторые категории. Результаты поиска могут быть неполными.',
    whatToBring: 'Что взять с собой:',
    important: 'Важно:',
    progress: 'Выполнено: {done} из {total}',
    completedStep: 'Выполнено: {title}',
    allDone: 'Готово ✓',
    progressTotal: 'Выполнено шагов: {done} из {total}',
    resume: 'Продолжить с шага {n}',
    startChecklist: 'Начать чек-лист',
    continueChecklist: 'Продолжить',
    chinesePhrases: 'Полезные фразы на китайском',
    copyChinese: 'Скопировать китайский текст',
    copied: 'Скопировано',
    copyFailed: 'Не удалось скопировать. Выделите китайский текст и скопируйте вручную.',
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
