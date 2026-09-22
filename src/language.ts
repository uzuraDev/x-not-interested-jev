/**
 * Prefer the tweet node's lang attribute. If X omitted it, use a small
 * script heuristic so Jev still sees a language field.
 */
export function resolveLanguage(langAttr: string | null | undefined, text: string): string {
  const lang = (langAttr ?? "").trim();
  if (lang) return lang;
  if (/[\u3040-\u30ff]/.test(text)) return "ja";
  if (/[\uac00-\ud7af]/.test(text)) return "ko";
  if (/[\u4e00-\u9fff]/.test(text)) return "zh";
  if (/[A-Za-z]/.test(text)) return "en";
  return "unknown";
}
