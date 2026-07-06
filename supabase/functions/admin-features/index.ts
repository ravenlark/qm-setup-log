import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const admin = await requireAdmin(req);
    if ("error" in admin) return admin.error;

    const body = await readJson(req) as {
      action?: string;
      feature?: {
        description?: string | null;
        displayName?: string;
        isActive?: boolean;
        key?: string;
      };
      isEnabled?: boolean;
      planId?: string;
      featureKey?: string;
    };

    if (body.action === "save-feature") {
      const feature = body.feature ?? {};
      const key = feature.key?.trim();
      if (!key || !feature.displayName?.trim()) {
        return json({ error: "Feature key and display name are required." }, 400);
      }

      const { data, error } = await admin.adminClient
        .from("subscription_features")
        .upsert(
          {
            description: cleanOptional(feature.description),
            display_name: feature.displayName.trim(),
            is_active: feature.isActive ?? true,
            key,
          },
          { onConflict: "key" },
        )
        .select("key, display_name, description, is_active")
        .single();

      if (error) return json({ error: error.message }, 500);
      return json({ feature: data });
    }

    if (body.action === "toggle-plan-feature") {
      if (!body.planId || !body.featureKey) {
        return json({ error: "planId and featureKey are required." }, 400);
      }
      const { data, error } = await admin.adminClient
        .from("subscription_plan_features")
        .upsert(
          {
            feature_key: body.featureKey,
            is_enabled: Boolean(body.isEnabled),
            plan_id: body.planId,
          },
          { onConflict: "plan_id,feature_key" },
        )
        .select("plan_id, feature_key, is_enabled")
        .single();

      if (error) return json({ error: error.message }, 500);
      return json({ planFeature: data });
    }

    const [featuresResult, plansResult, planFeaturesResult] = await Promise.all([
      admin.adminClient
        .from("subscription_features")
        .select("key, display_name, description, is_active")
        .order("key", { ascending: true }),
      admin.adminClient
        .from("subscription_plans")
        .select("id, name, display_name, is_active")
        .order("name", { ascending: true }),
      admin.adminClient
        .from("subscription_plan_features")
        .select("plan_id, feature_key, is_enabled"),
    ]);

    for (const result of [featuresResult, plansResult, planFeaturesResult]) {
      if (result.error) return json({ error: result.error.message }, 500);
    }

    return json({
      features: featuresResult.data ?? [],
      planFeatures: planFeaturesResult.data ?? [],
      plans: plansResult.data ?? [],
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Admin features failed." },
      500,
    );
  }
});

function cleanOptional(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
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
