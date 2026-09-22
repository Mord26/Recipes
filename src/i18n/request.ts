import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

export const LOCALES = ['he', 'en'] as const;
export const DEFAULT_LOCALE = 'he';
export const LOCALE_COOKIE = 'locale';

export default getRequestConfig(async ({ locale }) => {
  // Honor an explicitly requested locale (getTranslations/getMessages({ locale })) so a single
  // recipe can be rendered in a language other than the app-wide cookie locale. Fall back to the
  // cookie for the default request locale.
  let resolved = LOCALES.includes(locale as (typeof LOCALES)[number]) ? (locale as string) : undefined;
  if (!resolved) {
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
    resolved = LOCALES.includes(cookieLocale as (typeof LOCALES)[number]) ? (cookieLocale as string) : DEFAULT_LOCALE;
  }

  return {
    locale: resolved,
    messages: (await import(`../../messages/${resolved}.json`)).default,
  };
});
