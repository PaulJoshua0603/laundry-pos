import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export function isSupabaseConfigured(): boolean {
  return !!supabaseUrl && !!supabaseAnonKey;
}

// A dummy client is created even when unconfigured so imports never crash;
// every call site checks isSupabaseConfigured() first.
export const supabase: SupabaseClient = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // This app has no OAuth redirect and no magic-link flow, so an auth
      // token never arrives back on a URL. Left on (the default), every page
      // load parses location.hash hunting for tokens that are never there.
      detectSessionInUrl: false,
    },
  }
);
