// One flag selects the data backend. Unset (default) = Supabase, the permanent home.
// FAMILY_DB_BACKEND=turso (+ NEXT_PUBLIC_FAMILY_DB_BACKEND=turso for the browser) = temporary bridge.
export const stagingTurso = (): boolean =>
  (process.env.FAMILY_DB_BACKEND ?? process.env.NEXT_PUBLIC_FAMILY_DB_BACKEND) === 'turso';
export const stagingTursoBrowser = (): boolean => process.env.NEXT_PUBLIC_FAMILY_DB_BACKEND === 'turso';
