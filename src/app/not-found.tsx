import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function NotFound() {
  const t = await getTranslations('notFound');
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="text-6xl">🧁</span>
      <h1 className="font-display text-3xl font-medium text-ink-900">{t('title')}</h1>
      <p className="text-ink-500">{t('hint')}</p>
      <Link
        href="/"
        className="rounded-full bg-terra-600 px-7 py-3.5 font-semibold text-cream-50 shadow-[0_8px_20px_-8px_rgba(181,78,40,0.5)] transition-all duration-300 ease-fluid hover:bg-terra-500 active:scale-[0.97]"
      >
        {t('backHome')}
      </Link>
    </main>
  );
}
