import data from '@/data-fallback.json';
import { headers } from 'next/headers';
const tables=(data as any).fallback_tables as Record<string,any[]>;
export const fallbackInfo={generatedAt:(data as any).generated_at_utc,recordCount:(data as any).record_count,included:Object.values(tables).reduce((n:any,x:any)=>n+x.length,0)};
export function fallbackTable<T=any>(name:string):T[]{return (tables[name]||[]) as T[]}
export async function forceFallback():Promise<boolean>{try{return (await headers()).get('x-family-test-fallback')==='402'}catch{return false}}
export function is402(error:any):boolean{return !!error&&(Number(error.status)===402||String(error.code||'')==='402'||/\b402\b|payment required/i.test(String(error.message||error)))}
export async function readOnlyMode(error?:any):Promise<boolean>{return await forceFallback()||is402(error)}
export function fallbackPhotoUrl(path:string):string{return '/fallback-media/'+path.split('/').map(encodeURIComponent).join('/')}
export function fallbackProfile(id:string){return fallbackTable<any>('profiles').find(x=>x.id===id)||fallbackTable<any>('profiles')[0]||null}
export function fallbackRecipes(userId:string){
 const ps=fallbackTable<any>('profiles'),photos=fallbackTable<any>('recipe_photos'),cats=fallbackTable<any>('recipe_categories'),tags=fallbackTable<any>('recipe_tags'),ratings=fallbackTable<any>('ratings'),favs=fallbackTable<any>('favorites');
 return fallbackTable<any>('recipes').map(r=>({...r,__fallback:true,profiles:ps.find(p=>p.id===r.owner_id)||null,recipe_photos:photos.filter(p=>p.recipe_id===r.id).map(p=>({...p,storage_path:'__fallback__/'+p.storage_path,uploader:ps.find(x=>x.id===p.uploader_id)||null})),recipe_categories:cats.filter(x=>x.recipe_id===r.id),recipe_tags:tags.filter(x=>x.recipe_id===r.id),ratings:ratings.filter(x=>x.recipe_id===r.id),favorites:favs.filter(x=>x.recipe_id===r.id)}));
}
