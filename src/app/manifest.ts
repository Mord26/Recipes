import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {

  return {
    name: 'המתכונים שלנו',
    short_name: 'המתכונים שלנו',
    id: '/',
    scope: '/',
    start_url: '/',
    display: 'standalone',
    background_color: '#fbf8f2',
    theme_color: '#fbf8f2',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Puts the app in Android's share sheet. All three params are declared because Android has no
    // dedicated URL field: Instagram, TikTok and WhatsApp all put the link inside `text`.
    share_target: {
      action: '/share-target',
      method: 'GET',
      enctype: 'application/x-www-form-urlencoded',
      params: { title: 'title', text: 'text', url: 'url' },
    },
  };
}
