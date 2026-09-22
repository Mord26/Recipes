import { createBrowserClient } from '@supabase/ssr';

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export function publicPhotoUrl(storagePath: string): string {
  if(storagePath.startsWith('__fallback__/'))return '/fallback-media/'+storagePath.slice(13).split('/').map(encodeURIComponent).join('/');
  if(typeof document!=='undefined'&&document.documentElement.dataset.readOnly==='1')return '/fallback-media/'+storagePath.split('/').map(encodeURIComponent).join('/');
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/photos/${storagePath}`;
}

