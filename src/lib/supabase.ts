import { createClient } from "@supabase/supabase-js";

export const supabaseConfig = {
  url: import.meta.env.VITE_SUPABASE_URL ?? "",
  publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
};

export const supabase =
  supabaseConfig.url && supabaseConfig.publishableKey
    ? createClient(supabaseConfig.url, supabaseConfig.publishableKey)
    : null;
