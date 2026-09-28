'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Dialog } from 'radix-ui';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Button, Chip } from '@/components/ui';
import { UnitConverter } from '@/components/unit-converter';
import { categoryName, type Category, type Locale, type Profile, type Tag } from '@/lib/types';

type Member = Pick<Profile, 'id' | 'username' | 'display_name' | 'role'>;

interface SearchControlsProps {
  categories: Category[];
  tags: Tag[];
  members: Member[];
  showFavoritesToggle?: boolean;
  hideRatings?: boolean;
  hideTags?: boolean;
}

const FILTER_KEYS = ['cat', 'tag', 'up', 'mine', 'fav', 'time', 'rating', 'sort'] as const;

export function SearchControls({
  categories,
  tags,
  members,
  showFavoritesToggle = true,
  hideRatings = false,
  hideTags = false,
}: SearchControlsProps) {
  const t = useTranslations('home');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeCount = useMemo(
    () => FILTER_KEYS.filter((key) => searchParams.get(key)).length,
    [searchParams]
  );

  const replaceParams = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    setQuery(searchParams.get('q') ?? '');
  }, [searchParams]);

  const onQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      replaceParams((params) => {
        if (value.trim()) params.set('q', value.trim());
        else params.delete('q');
      });
    }, 350);
  };

  const setParam = (key: string, value: string | null) => {
    replaceParams((params) => {
      if (value === null) params.delete(key);
      else params.set(key, value);
    });
  };

  const toggleParam = (key: string, value: string) => {
    setParam(key, searchParams.get(key) === value ? null : value);
  };

  const clearAll = () => {
    replaceParams((params) => {
      FILTER_KEYS.forEach((key) => params.delete(key));
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        <div className="relative flex-1">
          <Search
            size={18}
            strokeWidth={1.8}
            className="pointer-events-none absolute top-1/2 start-4 -translate-y-1/2 text-ink-300"
          />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full rounded-full bg-white/80 py-3.5 ps-11 pe-4 text-[15px] text-ink-900 ring-1 ring-ink-900/8 transition-all duration-300 ease-fluid placeholder:text-ink-300 focus:bg-white focus:ring-2 focus:ring-terra-500/50 focus:outline-none"
            type="search"
            enterKeyHint="search"
          />
        </div>

        <UnitConverter />

        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger asChild>
            <button
              aria-label={t('filters')}
              className="relative flex size-12 shrink-0 items-center justify-center rounded-full bg-white/80 text-ink-700 ring-1 ring-ink-900/8 transition-all duration-300 ease-fluid hover:bg-white active:scale-[0.94]"
            >
              <SlidersHorizontal size={19} strokeWidth={1.7} />
              {activeCount > 0 ? (
                <span className="absolute -top-0.5 -end-0.5 flex size-5 items-center justify-center rounded-full bg-terra-600 text-[11px] font-bold text-cream-50">
                  {activeCount}
                </span>
              ) : null}
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/30 backdrop-blur-sm animate-fade-in" />
            <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-cream-50 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-sheet-up">
              <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-ink-900/15" />
              <div className="mb-5 flex items-center justify-between">
                <Dialog.Title className="font-display text-2xl font-medium text-ink-900">
                  {t('filters')}
                </Dialog.Title>
                <Dialog.Close asChild>
                  <button
                    aria-label="close"
                    className="flex size-9 items-center justify-center rounded-full bg-white text-ink-700 ring-1 ring-ink-900/8"
                  >
                    <X size={17} strokeWidth={1.8} />
                  </button>
                </Dialog.Close>
              </div>

              <div className="space-y-6">
                <FilterGroup label="">
                  <Chip active={!searchParams.get('sort')} onClick={() => setParam('sort', null)}>
                    {t('sortNewest')}
                  </Chip>
                  {!hideRatings ? (
                    <Chip active={searchParams.get('sort') === 'top'} onClick={() => toggleParam('sort', 'top')}>
                      {t('sortTop')}
                    </Chip>
                  ) : null}
                  <Chip active={searchParams.get('mine') === '1'} onClick={() => toggleParam('mine', '1')}>
                    {t('filterMine')}
                  </Chip>
                  {showFavoritesToggle ? (
                    <Chip active={searchParams.get('fav') === '1'} onClick={() => toggleParam('fav', '1')}>
                      {t('filterFavorites')}
                    </Chip>
                  ) : null}
                </FilterGroup>

                <FilterGroup label={t('filterCategory')}>
                  {categories.map((category) => (
                    <Chip
                      key={category.id}
                      active={searchParams.get('cat') === category.id}
                      onClick={() => toggleParam('cat', category.id)}
                    >
                      {category.emoji ? <span>{category.emoji}</span> : null}
                      {categoryName(category, locale)}
                    </Chip>
                  ))}
                </FilterGroup>

                {tags.length > 0 && !hideTags ? (
                  <FilterGroup label={t('filterTag')}>
                    {tags.slice(0, 30).map((tag) => (
                      <Chip
                        key={tag.id}
                        active={searchParams.get('tag') === tag.id}
                        onClick={() => toggleParam('tag', tag.id)}
                      >
                        #{tag.name}
                      </Chip>
                    ))}
                  </FilterGroup>
                ) : null}

                <FilterGroup label={t('filterUploader')}>
                  {members.map((member) => (
                    <Chip
                      key={member.id}
                      active={searchParams.get('up') === member.id}
                      onClick={() => toggleParam('up', member.id)}
                    >
                      {member.display_name}
                    </Chip>
                  ))}
                </FilterGroup>

                <FilterGroup label={t('filterMaxTime')}>
                  <Chip active={!searchParams.get('time')} onClick={() => setParam('time', null)}>
                    {t('anyTime')}
                  </Chip>
                  <Chip active={searchParams.get('time') === '30'} onClick={() => toggleParam('time', '30')}>
                    {t('upTo30')}
                  </Chip>
                  <Chip active={searchParams.get('time') === '60'} onClick={() => toggleParam('time', '60')}>
                    {t('upTo60')}
                  </Chip>
                </FilterGroup>

                {!hideRatings ? (
                  <FilterGroup label={t('filterMinRating')}>
                    <Chip active={!searchParams.get('rating')} onClick={() => setParam('rating', null)}>
                      {t('anyRating')}
                    </Chip>
                    <Chip active={searchParams.get('rating') === '4'} onClick={() => toggleParam('rating', '4')}>
                      4+ ★
                    </Chip>
                    <Chip active={searchParams.get('rating') === '3'} onClick={() => toggleParam('rating', '3')}>
                      3+ ★
                    </Chip>
                  </FilterGroup>
                ) : null}

                <div className="flex gap-3 pt-2">
                  {activeCount > 0 ? (
                    <Button variant="ghost" className="flex-1" onClick={clearAll}>
                      {t('clearFilters')}
                    </Button>
                  ) : null}
                  <Button className="flex-1" onClick={() => setOpen(false)}>
                    {t('filters')} ✓
                  </Button>
                </div>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      {label ? <p className="mb-2.5 text-sm font-semibold text-ink-700">{label}</p> : null}
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function CategoryRow({ categories }: { categories: Category[] }) {
  const t = useTranslations('home');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get('cat');

  const select = (id: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id === null || active === id) params.delete('cat');
    else params.set('cat', id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="scrollbar-none -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
      <Chip active={!active} onClick={() => select(null)}>
        {t('all')}
      </Chip>
      {categories.map((category) => (
        <Chip key={category.id} active={active === category.id} onClick={() => select(category.id)}>
          {category.emoji ? <span>{category.emoji}</span> : null}
          {categoryName(category, locale)}
        </Chip>
      ))}
    </div>
  );
}
