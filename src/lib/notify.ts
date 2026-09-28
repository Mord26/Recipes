import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { sendPush, type PushSubscriptionRecord } from '@/lib/push';
import type { Locale } from '@/lib/types';

/** Notification copy lives here rather than in the message files: it is rendered on the server,
 *  per recipient locale, outside any request context where next-intl could be used. */
const COPY: Record<Locale, { title: (author: string) => string; body: (title: string) => string }> = {
  he: {
    title: (author) => `${author} הוסיף מתכון חדש 🍲`,
    body: (title) => `${title} - רוצה לראות?`,
  },
  en: {
    title: (author) => `${author} added a new recipe 🍲`,
    body: (title) => `${title} - want to take a look?`,
  },
};

/**
 * Pushes "someone added a recipe" to every active family member who opted in.
 * Called from `after()` so it never delays the save; failures are logged, never thrown.
 */
export async function notifyNewRecipe(recipeId: string, authorId: string): Promise<void> {
  try {
    const supabase = createSupabaseAdminClient();

    const { data: recipe } = await supabase
      .from('recipes')
      .select('title, visibility')
      .eq('id', recipeId)
      .maybeSingle();
    // A private recipe is nobody else's business.
    if (!recipe || recipe.visibility !== 'family') return;

    const [{ data: author }, { data: recipients }] = await Promise.all([
      supabase.from('profiles').select('display_name').eq('id', authorId).maybeSingle(),
      supabase
        .from('profiles')
        .select('id, locale')
        .eq('notify_new_recipes', true)
        .eq('blocked', false)
        .neq('id', authorId),
    ]);
    if (!recipients || recipients.length === 0) return;

    const authorName = author?.display_name ?? '';
    const byUser = new Map((recipients as { id: string; locale: Locale }[]).map((r) => [r.id, r.locale]));

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('user_id, endpoint, p256dh, auth')
      .in('user_id', [...byUser.keys()]);
    if (!subs || subs.length === 0) return;

    const expired: string[] = [];
    let sent = 0;
    for (const sub of subs as (PushSubscriptionRecord & { user_id: string })[]) {
      const copy = COPY[byUser.get(sub.user_id) === 'en' ? 'en' : 'he'];
      const result = await sendPush(sub, {
        title: copy.title(authorName),
        body: copy.body(recipe.title),
        url: `/recipes/${recipeId}`,
        tag: `recipe-${recipeId}`,
      });
      if (result === 'sent') sent += 1;
      if (result === 'expired') expired.push(sub.endpoint);
    }
    console.log(`notifyNewRecipe ${recipeId}: ${sent}/${subs.length} sent, ${expired.length} expired`);

    if (expired.length > 0) {
      await supabase.from('push_subscriptions').delete().in('endpoint', expired);
    }
  } catch (error) {
    console.error('notifyNewRecipe failed:', (error as Error).message);
  }
}
