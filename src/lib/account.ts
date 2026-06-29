import type { SupabaseClient, User } from "@supabase/supabase-js";

export type UserProfile = {
  id: string;
  team_name: string;
  logo_path: string | null;
};

function setupError(step: string, message: string): Error {
  return new Error(`${step} failed: ${message}`);
}

export async function ensureAccountSetup(
  supabase: SupabaseClient,
  user: User,
): Promise<UserProfile> {
  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({ id: user.id }, { onConflict: "id" });

  if (profileError) throw setupError("Profile setup", profileError.message);

  const { error: subscriptionError } = await supabase.rpc(
    "ensure_free_subscription",
  );

  if (subscriptionError) {
    throw setupError("Subscription setup", subscriptionError.message);
  }

  return fetchUserProfile(supabase, user.id);
}

export async function fetchUserProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserProfile> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, team_name, logo_path")
    .eq("id", userId)
    .single();

  if (error) throw setupError("Profile lookup", error.message);
  return data as UserProfile;
}
