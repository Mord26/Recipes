import { getSessionProfile } from '@/lib/auth-helpers';
import { BottomNavBar } from '@/components/bottom-nav-bar';

/** Server wrapper so the nav can hide "new recipe" from a view-only member without extra queries. */
export async function BottomNav() {
  const session = await getSessionProfile();
  return <BottomNavBar canAdd={session?.profile.can_add_recipes !== false} />;
}
