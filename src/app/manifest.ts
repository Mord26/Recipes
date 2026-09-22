import type { MetadataRoute } from 'next';
import { getTranslations } from 'next-intl/server';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getTranslations('common');

  return {
    name: t('appName'),
    short_name: t('appName'),
    start_url: '/',
    display: 'standalone',
    background_color: '#fbf8f2',
    theme_color: '#fbf8f2',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    // Puts the app in Android's share sheet. All three params are declared because Android has no
    // dedicated URL field: Instagram, TikTok and WhatsApp all put the link inside `text`.
    share_target: {
      action: '/share-target',
      method: 'GET',
      params: { title: 'title', text: 'text', url: 'url' },
    },
  };
}
