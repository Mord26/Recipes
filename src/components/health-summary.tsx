import { getFormatter, getTranslations } from 'next-intl/server';
import { CheckCircle2, TriangleAlert } from 'lucide-react';
import type { IssueSummary } from '@/lib/queries';

/** Plain-language answer to "is anything broken for the family right now?". */
export async function HealthSummary({ issues }: { issues: IssueSummary[] }) {
  const t = await getTranslations('health');
  const format = await getFormatter();

  if (issues.length === 0) {
    return (
      <div className="card-core flex items-center gap-3.5 p-5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sage-100">
          <CheckCircle2 size={19} strokeWidth={1.8} className="text-sage-600" />
        </div>
        <div>
          <p className="font-semibold text-ink-900">{t('allGood')}</p>
          <p className="mt-0.5 text-xs text-ink-500">{t('window')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card-core space-y-3 p-5">
      <div className="flex items-center gap-2">
        <TriangleAlert size={17} strokeWidth={1.9} className="text-terra-600" />
        <p className="font-semibold text-ink-900">{t('issuesTitle')}</p>
      </div>
      <ul className="space-y-2">
        {issues.map((issue) => (
          <li key={issue.event} className="flex items-baseline justify-between gap-3 border-t border-ink-900/5 pt-2 text-sm">
            <span className="min-w-0 text-ink-700">{t(`event.${issue.event}`)}</span>
            <span className="shrink-0 text-xs text-ink-400">
              {t('times', { count: issue.count })} ·{' '}
              {format.relativeTime(new Date(issue.lastAt))}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs leading-relaxed text-ink-400">{t('window')}</p>
    </div>
  );
}
