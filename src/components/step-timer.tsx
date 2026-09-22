'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Pause, Play, Plus, RotateCcw, Timer } from 'lucide-react';
import { formatDuration, type StepTimer } from '@/lib/step-parse';
import { cancelTimerReminder, ensurePushSubscription, scheduleTimerReminder } from '@/lib/push-client';
import { cn } from '@/lib/utils';

type AudioCtor = typeof AudioContext;

/**
 * A single AudioContext, created/resumed the first time the cook presses play (a user
 * gesture). iOS Safari only lets audio start from a gesture, so re-using this context
 * lets the chime fire even hours later when the timer completes.
 */
function getAudioContext(ref: { current: AudioContext | null }): AudioContext | null {
  try {
    const Ctor: AudioCtor | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    if (!Ctor) return null;
    if (!ref.current) ref.current = new Ctor();
    if (ref.current.state === 'suspended') ref.current.resume().catch(() => undefined);
    return ref.current;
  } catch {
    return null;
  }
}

function chime(ctx: AudioContext | null) {
  if (!ctx) return;
  try {
    // Five bursts of three rising beeps (~6s total) so it is impossible to miss across a kitchen.
    const offsets: number[] = [];
    for (let burst = 0; burst < 5; burst += 1) {
      const base = burst * 1.2;
      offsets.push(base, base + 0.28, base + 0.56);
    }
    offsets.forEach((offset, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = i % 3 === 2 ? 1180 : 880;
      osc.type = 'sine';
      const start = ctx.currentTime + offset;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.26);
    });
  } catch {
    // Silent finish is acceptable.
  }
}

const ADD_MINUTES = [1, 2, 3];

export function StepTimerButton({ timer }: { timer: StepTimer }) {
  const t = useTranslations('recipe');
  const [remaining, setRemaining] = useState(timer.seconds);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const deadlineRef = useRef<number | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const reminderIdRef = useRef<string | null>(null);

  const cancelReminder = () => {
    if (reminderIdRef.current) {
      cancelTimerReminder(reminderIdRef.current);
      reminderIdRef.current = null;
    }
  };

  // Registers a server-side push so the reminder fires even if the app is closed at the deadline.
  const armReminder = (deadline: number) => {
    void (async () => {
      const subscribed = await ensurePushSubscription();
      if (!subscribed) return;
      const id = await scheduleTimerReminder(new Date(deadline), timer.label, document.title);
      if (id) {
        // A newer run may have replaced this one meanwhile; keep only the latest.
        if (reminderIdRef.current && reminderIdRef.current !== id) cancelTimerReminder(reminderIdRef.current);
        reminderIdRef.current = id;
      }
    })();
  };

  useEffect(() => {
    if (!running) return;
    // Wall-clock based so a backgrounded tab still shows the correct time on return.
    deadlineRef.current = Date.now() + remaining * 1000;
    const tick = () => {
      const left = Math.max(0, Math.round(((deadlineRef.current ?? 0) - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        setRunning(false);
        setDone(true);
        // The app is alive to handle it locally, so cancel the closed-app push to avoid a double alert.
        cancelReminder();
        chime(audioRef.current);
        navigator.vibrate?.([300, 120, 300, 120, 300, 500, 300, 120, 300, 120, 300, 500, 300, 120, 300]);
        // If the cook has switched apps but the tab is still alive, a notification brings them back.
        if (document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification('⏲️ ' + timer.label, { body: document.title });
          } catch {
            // notifications unavailable - the chime/vibration still fire on return
          }
        }
      }
    };
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const beginRun = (seconds: number) => {
    // Prime audio inside the user gesture so the chime works later.
    getAudioContext(audioRef);
    setRemaining(seconds);
    setDone(false);
    setRunning(true);
    armReminder(Date.now() + seconds * 1000);
  };

  const start = () => beginRun(remaining);

  const pause = () => {
    setRunning(false);
    cancelReminder();
  };

  const reset = () => {
    setRunning(false);
    setDone(false);
    setRemaining(timer.seconds);
    cancelReminder();
  };

  const onToggle = () => {
    if (done) reset();
    else if (running) pause();
    else start();
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className={cn(
          'inline-flex items-center gap-2 rounded-full py-1.5 ps-3 pe-1.5 text-sm font-semibold transition-colors duration-300',
          done ? 'bg-sage-600 text-white' : running ? 'bg-terra-600 text-cream-50' : 'bg-white/15 text-current'
        )}
      >
        <Timer size={15} strokeWidth={1.9} />
        <span className="tabular-nums">
          {running || done || remaining !== timer.seconds ? formatDuration(remaining) : timer.label}
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-label={timer.label}
          className="flex size-8 items-center justify-center rounded-full bg-white/20 transition-all duration-300 ease-fluid active:scale-[0.9]"
        >
          {done ? <RotateCcw size={14} strokeWidth={2} /> : running ? <Pause size={14} strokeWidth={2} /> : <Play size={14} strokeWidth={2} />}
        </button>
      </span>

      {done ? (
        <span className="inline-flex items-center gap-1">
          {ADD_MINUTES.map((minutes) => (
            <button
              key={minutes}
              type="button"
              onClick={() => beginRun(minutes * 60)}
              className="inline-flex items-center gap-0.5 rounded-full bg-white/15 px-2.5 py-1.5 text-xs font-semibold text-current ring-1 ring-current/15 transition-all duration-300 ease-fluid active:scale-[0.92]"
            >
              <Plus size={11} strokeWidth={2.4} />
              {t('addMinutesShort', { count: minutes })}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}
