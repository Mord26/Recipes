import { Suspense } from 'react';
import { LoginForm } from '@/components/login-form';
import { stagingTurso } from '@/lib/staging/backend';
import { listPickerProfiles, pickProfile } from '@/lib/actions/staging-profile';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!stagingTurso()) return <Suspense><LoginForm /></Suspense>;
  const { next } = await searchParams;
  const profiles = await listPickerProfiles();
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center px-5 py-12" dir="rtl">
      <div className="mb-10 text-center">
        <span className="mb-6 inline-block text-5xl">🍲</span>
        <h1 className="font-display text-4xl font-medium text-ink-900">מי אתה?</h1>
        <p className="mt-2 text-ink-500">בחרו את השם שלכם כדי להיכנס</p>
      </div>
      <div className="card-shell soft-rise">
        <div className="card-core space-y-3 p-6">
          {profiles.map((p) => (
            <form key={p.id} action={pickProfile}>
              <input type="hidden" name="profileId" value={p.id} />
              {next ? <input type="hidden" name="next" value={next} /> : null}
              <button
                type="submit"
                data-profile={p.username}
                className="w-full rounded-full bg-white/80 px-6 py-4 text-lg font-semibold text-terra-700 ring-1 ring-terra-600/25 transition-all duration-300 ease-fluid hover:bg-terra-50 active:scale-[0.97]"
              >
                {p.display_name}
              </button>
            </form>
          ))}
        </div>
      </div>
    </main>
  );
}
