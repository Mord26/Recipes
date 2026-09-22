'use client';

import { useEffect } from 'react';

/** Registers the service worker on load so push notifications can be delivered while closed. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // registration failures are non-fatal; timers still chime while the app is open
    });
  }, []);

  return null;
}
