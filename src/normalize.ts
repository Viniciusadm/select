const DIACRITICS = /[̀-ͯ]/g;

export function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(DIACRITICS, "");
}

export function makeMatcher(query: string, normalize: boolean): (text: string) => boolean {
  const q = normalize ? stripDiacritics(query).toLowerCase() : query.toLowerCase();
  if (!q) return () => true;
  return (text: string) => {
    const t = normalize ? stripDiacritics(text).toLowerCase() : text.toLowerCase();
    return t.includes(q);
  };
}
