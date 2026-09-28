import { redirect } from 'next/navigation';
import { requireSessionProfile } from '@/lib/auth-helpers';
import { firstUrlIn, parseSharedUrl } from '@/lib/recipe-url';

/**
 * Where Android's share sheet lands. It only picks the link out of whatever the sharing app sent
 * and hands it to the recipe form, which owns the whole import experience.
 */
export default async function ShareTargetPage({
  searchParams,
}: {
  searchParams: Promise<{ title?: string; text?: string; url?: string }>;
}) {
  const { profile } = await requireSessionProfile();
  if (!profile.can_add_recipes) redirect('/');

  const { title, text, url } = await searchParams;
  const shared = firstUrlIn(url, text, title);
  const parsed = shared ? parseSharedUrl(shared) : null;

  redirect(parsed ? `/recipes/new?import=${encodeURIComponent(parsed.url)}` : '/recipes/new?shareFailed=1');
}
