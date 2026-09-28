export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function formatMinutes(minutes: number, locale: 'he' | 'en'): string {
  if (minutes < 60) return locale === 'he' ? `${minutes} דק׳` : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (locale === 'he') return rest === 0 ? `${hours} שע׳` : `${hours} שע׳ ${rest} דק׳`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function formatDate(iso: string, locale: 'he' | 'en'): string {
  return new Date(iso).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
