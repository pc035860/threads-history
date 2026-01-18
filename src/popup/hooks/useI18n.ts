export function useI18n() {
  const t = (key: string, ...substitutions: (string | number)[]) => {
    return chrome.i18n.getMessage(key, substitutions.map(String));
  };
  return { t };
}
