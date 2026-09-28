'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Smartphone } from 'lucide-react';
import { Button } from '@/components/ui';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

export function InstallApp() {
  const t = useTranslations('settings');
  const [installed, setInstalled] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setInstalled(window.matchMedia('(display-mode: standalone)').matches);
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  return (
    <div className="card-core space-y-3 p-5">
      {installed ? (
        <div className="space-y-2">
          <p className="font-semibold text-sage-700">{t('installDone')}</p>
          <p className="text-sm leading-relaxed text-ink-500">🔔 {t('notificationsHint')}</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-ink-500">{t('installHint')}</p>
          {installEvent ? (
            <Button
              onClick={() => {
                installEvent.prompt();
                setInstallEvent(null);
              }}
            >
              <Smartphone size={17} strokeWidth={1.8} />
              {t('installButton')}
            </Button>
          ) : (
            <div className="space-y-2 text-sm leading-relaxed text-ink-700">
              <p>🍎 {t('installIos')}</p>
              <p>🤖 {t('installAndroid')}</p>
            </div>
          )}
          <p className="text-xs leading-relaxed text-ink-400">🔔 {t('notificationsHint')}</p>
        </>
      )}
    </div>
  );
}
