import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const admin = await requireAdmin(req);
    if ("error" in admin) return admin.error;

    const body = await readJson(req) as { search?: string };
    const search = (body.search ?? "").trim().toLowerCase();
    const { data: authData, error: authError } =
      await admin.adminClient.auth.admin.listUsers({ page: 1, perPage: 200 });

    if (authError) return json({ error: authError.message }, 500);

    const users = authData.users ?? [];
    const userIds = users.map((user) => user.id);
    if (!userIds.length) return json({ users: [] });

    const [
      profilesResult,
      subscriptionsResult,
      carsResult,
      enginesResult,
      sessionsResult,
    ] = await Promise.all([
      admin.adminClient
        .from("profiles")
        .select("id, team_name, logo_path")
        .in("id", userIds),
      admin.adminClient
        .from("account_subscriptions")
        .select(
          "user_id, status, provider, provider_customer_id, provider_subscription_id, current_period_end, plan:subscription_plans(id, name, display_name)",
        )
        .in("user_id", userIds),
      admin.adminClient.from("cars").select("user_id").in("user_id", userIds),
      admin.adminClient.from("engines").select("user_id").in("user_id", userIds),
      admin.adminClient.from("sessions").select("user_id").in("user_id", userIds),
    ]);

    for (const result of [
      profilesResult,
      subscriptionsResult,
      carsResult,
      enginesResult,
      sessionsResult,
    ]) {
      if (result.error) return json({ error: result.error.message }, 500);
    }

    const profiles = new Map(
      (profilesResult.data ?? []).map((profile) => [profile.id, profile]),
    );
    const subscriptions = new Map(
      (subscriptionsResult.data ?? []).map((subscription) => [
        subscription.user_id,
        subscription,
      ]),
    );
    const carCounts = countByUser(carsResult.data ?? []);
    const engineCounts = countByUser(enginesResult.data ?? []);
    const sessionCounts = countByUser(sessionsResult.data ?? []);

    const rows = users
      .map((user) => {
        const profile = profiles.get(user.id);
        const subscription = subscriptions.get(user.id);
        const plan = Array.isArray(subscription?.plan)
          ? subscription?.plan[0] ?? null
          : subscription?.plan ?? null;
        return {
          id: user.id,
          email: user.email ?? null,
          createdAt: user.created_at,
          lastSignInAt: user.last_sign_in_at,
          teamName: profile?.team_name ?? "",
          logoPath: profile?.logo_path ?? null,
          subscription: subscription
            ? {
                currentPeriodEnd: subscription.current_period_end,
                plan,
                provider: subscription.provider,
                providerCustomerId: subscription.provider_customer_id,
                providerSubscriptionId: subscription.provider_subscription_id,
                status: subscription.status,
              }
            : null,
          usage: {
            cars: carCounts.get(user.id) ?? 0,
            engines: engineCounts.get(user.id) ?? 0,
            sessions: sessionCounts.get(user.id) ?? 0,
          },
        };
      })
      .filter((row) => {
        if (!search) return true;
        return [row.id, row.email, row.teamName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(search);
      });

    return json({ users: rows });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Admin user lookup failed." },
      500,
    );
  }
});

function countByUser(rows: Array<{ user_id: string }>) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
  }
  return counts;
}

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
    status,
  });
}

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { error: json({ error: "Missing authorization header." }, 401) };
  }

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const userClient = createClient(supabaseUrl, requireEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return { error: json({ error: "Not authenticated." }, 401) };
  }

  const adminEmails = new Set(
    (Deno.env.get("ADMIN_EMAILS") ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
  const email = (user.email ?? "").toLowerCase();
  if (!email || !adminEmails.has(email)) {
    return { error: json({ error: "Not authorized." }, 403) };
  }

  return {
    adminClient: createClient(supabaseUrl, requireEnv("SUPABASE_SERVICE_ROLE_KEY")),
    email,
    user,
  };
}

async function readJson(req: Request) {
  if (!req.body) return {};
  return await req.json().catch(() => ({}));
}
