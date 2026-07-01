import { createClient } from '@supabase/supabase-js';

/**
 * Cliente único de Supabase para toda la app. Usa siempre la clave anon:
 * la service_role NUNCA debe llegar al navegador (bypassa RLS por completo).
 */
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
