import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type PlanInput = {
  displayName?: string | null;
  id?: string;
  isActive?: boolean;
  maxCars?: number | null;
  maxEngines?: number | null;
  name?: string;
  priceCents?: number | null;
  priceCurrency?: string | null;
  stripePriceId?: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const admin = await requireAdmin(req);
    if ("error" in admin) return admin.error;

    const body = await readJson(req) as { action?: string; plan?: PlanInput };
    if (body.action === "save") {
      const plan = body.plan ?? {};
      const payload = {
        display_name: cleanOptional(plan.displayName),
        is_active: plan.isActive ?? true,
        max_cars: nullableInteger(plan.maxCars),
        max_engines: nullableInteger(plan.maxEngines),
        name: plan.name?.trim(),
        price_cents: nullableInteger(plan.priceCents),
        price_currency: cleanOptional(plan.priceCurrency)?.toLowerCase(),
        stripe_price_id: cleanOptional(plan.stripePriceId),
      };

      if (!payload.name) return json({ error: "Plan name is required." }, 400);

      const query = plan.id
        ? admin.adminClient.from("subscription_plans").update(payload).eq("id", plan.id)
        : admin.adminClient.from("subscription_plans").insert(payload);

      const { data, error } = await query
        .select(
          "id, name, display_name, max_cars, max_engines, price_cents, price_currency, stripe_price_id, is_active",
        )
        .single();

      if (error) return json({ error: error.message }, 500);
      return json({ plan: data });
    }

    const { data, error } = await admin.adminClient
      .from("subscription_plans")
      .select(
        "id, name, display_name, max_cars, max_engines, price_cents, price_currency, stripe_price_id, is_active",
      )
      .order("name", { ascending: true });

    if (error) return json({ error: error.message }, 500);
    return json({ plans: data ?? [] });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Admin plans failed." },
      500,
    );
  }
});

function cleanOptional(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function nullableInteger(value: number | null | undefined) {
  return value === null || value === undefined || Number.isNaN(value)
    ? null
    : Math.trunc(value);
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
