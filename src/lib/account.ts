import type { SupabaseClient, User } from "@supabase/supabase-js";

function setupError(step: string, message: string): Error {
  return new Error(`${step} failed: ${message}`);
}

export async function ensureAccountSetup(
  supabase: SupabaseClient,
  user: User,
): Promise<void> {
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
}
