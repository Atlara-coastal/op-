/**
 * OP - Supabase Client Singleton
 * Requires the Supabase JS CDN script to be loaded before this module (see index.html).
 */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const isSupabaseConfigured =
  SUPABASE_URL && !SUPABASE_URL.includes('YOUR-PROJECT-REF') &&
  SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes('YOUR-ANON');

export const supabase = isSupabaseConfigured && window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    })
  : null;
