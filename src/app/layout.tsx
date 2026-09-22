import type { Metadata, Viewport } from 'next';
import { Rubik, Heebo, Frank_Ruhl_Libre } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { Toaster } from 'sonner';
import { ServiceWorkerRegister } from '@/components/sw-register';
import { forceFallback } from '@/lib/fallback';
import './globals.css';

const rubik = Rubik({
  subsets: ['hebrew', 'latin'],
  variable: '--font-frank',
});

const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  variable: '--font-assistant',
});

// Editorial serif (Hebrew + Latin) used only by the shared recipe image, so the app's own
// typography is untouched. share-card.ts must document.fonts.load() it before drawing.
const frankRuhl = Frank_Ruhl_Libre({
  subsets: ['hebrew', 'latin'],
  weight: ['400', '500', '700'],
  variable: '--font-serif',
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common');
  return {
    title: {
      default: t('appName'),
      template: `%s · ${t('appName')}`,
    },
    manifest: '/manifest.webmanifest',
    icons: {
      apple: '/icons/apple-touch-icon.png',
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: t('appName'),
    },
  };
}

export const viewport: Viewport = {
  themeColor: '#fbf8f2',
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const dir = locale === 'he' ? 'rtl' : 'ltr';
  const readOnly=await forceFallback();

  // Recipe photos are served from Supabase storage; warming that connection during HTML parse
  // shaves the TLS handshake off the first image request.
  const storageOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL;

  return (
    <html lang={locale} dir={dir} data-read-only={readOnly?'1':undefined} className={`${rubik.variable} ${heebo.variable} ${frankRuhl.variable} antialiased`}>
      <head>
        {storageOrigin ? (
          <>
            <link rel="preconnect" href={storageOrigin} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={storageOrigin} />
          </>
        ) : null}
      </head>
      <body className="min-h-[100dvh]">
        {readOnly?<div id="read-only-banner" className="sticky top-0 z-[1000] bg-[#762b18] px-4 py-3 text-center text-sm font-bold text-white shadow-lg">מצב קריאה בלבד · בסיס הנתונים אינו זמין. אי אפשר לשמור שינויים כרגע.</div>:null}
        <NextIntlClientProvider messages={messages}>
          <ServiceWorkerRegister />
          {children}
          <Toaster
            position="top-center"
            dir={dir}
            toastOptions={{
              style: {
                fontFamily: 'var(--font-assistant)',
                background: '#fffdf9',
                color: '#292015',
                border: '1px solid rgba(41,32,21,0.08)',
                borderRadius: '1rem',
                boxShadow: '0 12px 32px -12px rgba(41,32,21,0.22)',
                fontWeight: '600',
              },
            }}
          />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
