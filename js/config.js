// Supabase project for syncing across devices. Both values come from the
// Supabase dashboard (Project Settings → API). The anon/publishable key is
// meant to be public: row-level security in supabase/schema.sql keeps each
// account's data private. Leave empty to turn syncing off.
window.NOON_SUPABASE = {
  url: '',
  anonKey: ''
};
