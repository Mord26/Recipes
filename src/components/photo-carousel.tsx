'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';
import { publicPhotoUrl } from '@/lib/supabase/client';
import type { RecipePhoto } from '@/lib/types';
import { cn } from '@/lib/utils';

export interface CarouselPhoto {
  storage_path: string;
  /** Ready-to-show credit ("added by Dana"), set only when the uploader is not the recipe's creator. */
  uploaderLabel?: string | null;
}

export function PhotoCarousel({ photos, title }: { photos: CarouselPhoto[]; title: string }) {
  const [index, setIndex] = useState(0);
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);

  if (photos.length === 0) return null;

  return (
    <div className="relative">
      <div
        className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto"
        onScroll={(event) => {
          const el = event.currentTarget;
          setIndex(Math.round(Math.abs(el.scrollLeft) / el.clientWidth));
        }}
      >
        {photos.map((photo, photoIndex) => (
          <button
            key={photo.storage_path}
            type="button"
            onClick={() => setZoomIndex(photoIndex)}
            className="relative aspect-[4/3] w-full shrink-0 snap-center bg-cream-100"
          >
            <Image
              src={publicPhotoUrl(photo.storage_path)}
              alt={title}
              fill
              priority={photoIndex === 0}
              quality={90}
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-cover"
            />
            {photo.uploaderLabel ? (
              <span className="absolute bottom-3 start-4 flex items-center gap-1 rounded-full bg-ink-900/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
                📷 {photo.uploaderLabel}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Keeps the back button and title readable over a bright photo. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-ink-900/35 to-transparent" />

      {photos.length > 1 ? (
        <>
          <div className="absolute bottom-3 flex w-full justify-center gap-1.5">
            {photos.map((photo, i) => (
              <span
                key={photo.storage_path}
                className={cn(
                  'h-1.5 rounded-full bg-white transition-all duration-300 ease-fluid',
                  i === index ? 'w-5' : 'w-1.5 opacity-55'
                )}
              />
            ))}
          </div>
          <span className="absolute bottom-3 end-4 rounded-full bg-ink-900/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
            {index + 1}/{photos.length}
          </span>
        </>
      ) : null}

      <FullscreenViewer
        photos={photos}
        title={title}
        openIndex={zoomIndex}
        onClose={() => setZoomIndex(null)}
      />
    </div>
  );
}

/** A swipeable fullscreen gallery - the food photos stay browsable while zoomed in. */
function FullscreenViewer({
  photos,
  title,
  openIndex,
  onClose,
}: {
  photos: Pick<RecipePhoto, 'storage_path'>[];
  title: string;
  openIndex: number | null;
  onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(openIndex ?? 0);

  useEffect(() => {
    if (openIndex === null) return;
    setCurrent(openIndex);
    // Jump to the tapped photo once the dialog has mounted.
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTo({ left: -openIndex * el.clientWidth, behavior: 'instant' as ScrollBehavior });
    });
  }, [openIndex]);

  return (
    <Dialog.Root open={openIndex !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-fade-in fixed inset-0 z-50 bg-ink-900/95" />
        <Dialog.Content className="animate-fade-in fixed inset-0 z-50">
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <div
            ref={scrollRef}
            className="scrollbar-none flex h-full w-full snap-x snap-mandatory overflow-x-auto"
            onScroll={(event) => {
              const el = event.currentTarget;
              setCurrent(Math.round(Math.abs(el.scrollLeft) / el.clientWidth));
            }}
          >
            {photos.map((photo) => (
              <div key={photo.storage_path} className="flex h-full w-full shrink-0 snap-center items-center justify-center p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={publicPhotoUrl(photo.storage_path)} alt={title} className="max-h-full max-w-full rounded-2xl object-contain" />
              </div>
            ))}
          </div>

          {photos.length > 1 ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] flex justify-center gap-1.5">
              {photos.map((photo, i) => (
                <span
                  key={photo.storage_path}
                  className={cn('h-1.5 rounded-full bg-white transition-all', i === current ? 'w-5' : 'w-1.5 opacity-50')}
                />
              ))}
            </div>
          ) : null}

          <Dialog.Close asChild>
            <button
              aria-label={title}
              className="absolute top-[max(1rem,env(safe-area-inset-top))] end-4 flex size-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md active:scale-[0.92]"
            >
              <X size={20} strokeWidth={1.8} />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ScanGallery({
  scans,
  label,
  hint,
}: {
  scans: Pick<RecipePhoto, 'storage_path'>[];
  label: string;
  hint: string;
}) {
  const [openPath, setOpenPath] = useState<string | null>(null);

  if (scans.length === 0) return null;

  return (
    <section className="card-shell">
      <div className="card-core p-5">
        <h2 className="font-display text-xl font-medium text-ink-900">📄 {label}</h2>
        <p className="mt-1 mb-4 text-xs text-ink-500">{hint}</p>
        <div className="flex gap-3">
          {scans.map((scan) => (
            <button
              key={scan.storage_path}
              type="button"
              onClick={() => setOpenPath(scan.storage_path)}
              className="relative aspect-[3/4] w-24 shrink-0 overflow-hidden rounded-xl ring-1 ring-ink-900/10 transition-all duration-300 ease-fluid hover:ring-terra-500/50 active:scale-[0.96]"
            >
              <Image
                src={publicPhotoUrl(scan.storage_path)}
                alt={label}
                fill
                sizes="96px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      </div>

      <Dialog.Root open={openPath !== null} onOpenChange={(open) => !open && setOpenPath(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/85 backdrop-blur-sm animate-fade-in" />
          <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
            <Dialog.Title className="sr-only">{label}</Dialog.Title>
            {openPath ? (
              <div className="relative max-h-full w-full max-w-2xl overflow-auto rounded-2xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={publicPhotoUrl(openPath)} alt={label} className="w-full rounded-2xl" />
              </div>
            ) : null}
            <Dialog.Close asChild>
              <button
                aria-label="close"
                className="absolute top-[max(1rem,env(safe-area-inset-top))] end-4 flex size-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md"
              >
                <X size={20} strokeWidth={1.8} />
              </button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
