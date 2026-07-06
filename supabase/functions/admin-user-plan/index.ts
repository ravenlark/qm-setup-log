import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const admin = await requireAdmin(req);
    if ("error" in admin) return admin.error;

    const body = await readJson(req) as { planId?: string; userId?: string };
    if (!body.userId || !body.planId) {
      return json({ error: "userId and planId are required." }, 400);
    }

    const { data, error } = await admin.adminClient
      .from("account_subscriptions")
      .upsert(
        {
          plan_id: body.planId,
          provider: "manual",
          status: "active",
          user_id: body.userId,
        },
        { onConflict: "user_id" },
      )
      .select("user_id, status, provider, plan:subscription_plans(id, name, display_name)")
      .single();

    if (error) return json({ error: error.message }, 500);
    return json({ subscription: data });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Plan assignment failed." },
      500,
    );
  }
});

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
