import { createClient } from '@supabase/supabase-js';
import { configured } from './api';

// Imported only by the admin island. Guests do not download Auth/Realtime.
export const supabase = configured ? createClient(
  import.meta.env.PUBLIC_SUPABASE_URL!, import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } },
) : null;
