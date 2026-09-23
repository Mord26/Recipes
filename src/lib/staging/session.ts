// Passwordless "מי אתה?" profile session for the staging bridge: a signed cookie holding the
// chosen profile id. Uses Web Crypto so it runs in both the proxy and server code.
export const PROFILE_COOKIE = 'fr_profile';
const MAX_AGE_S = 60 * 60 * 24 * 180;

const enc = new TextEncoder();
function secret(): string {
  const s = process.env.STAGING_PROFILE_SECRET;
  if (!s || s.length < 16) throw new Error('staging: STAGING_PROFILE_SECRET missing');
  return s;
}
function b64url(buf: ArrayBuffer): string {
  let bin = '';
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(payload)));
}
export async function makeProfileCookie(profileId: string): Promise<{ value: string; maxAge: number }> {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_S;
  const payload = `${profileId}.${exp}`;
  return { value: `${payload}.${await sign(payload)}`, maxAge: MAX_AGE_S };
}
export async function readProfileCookie(value: string | undefined | null): Promise<string | null> {
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [id, exp, sig] = parts;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !(Number(exp) > Date.now() / 1000)) return null;
  const expected = await sign(`${id}.${exp}`);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? id : null;
}
