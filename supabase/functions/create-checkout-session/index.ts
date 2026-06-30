import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseAnonKey = requireEnv("SUPABASE_ANON_KEY");
    const supabaseAdminKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = requireEnv("STRIPE_SECRET_KEY");
    const appUrl = requireEnv("APP_URL");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing authorization header." }, 401);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return json({ error: "Not authenticated." }, 401);
    }

    const adminClient = createClient(supabaseUrl, supabaseAdminKey);
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2024-06-20" as Stripe.LatestApiVersion,
      httpClient: Stripe.createFetchHttpClient(),
    });

    const { data: premiumPlan, error: planError } = await adminClient
      .from("subscription_plans")
      .select("id, stripe_price_id")
      .eq("name", "Premium")
      .single();

    if (planError) {
      return json({ error: `Premium plan lookup failed: ${planError.message}` }, 500);
    }

    if (!premiumPlan?.stripe_price_id) {
      return json(
        { error: "Premium plan is missing stripe_price_id." },
        500,
      );
    }

    const { data: freePlan, error: freePlanError } = await adminClient
      .from("subscription_plans")
      .select("id")
      .eq("name", "Free")
      .single();

    if (freePlanError || !freePlan) {
      return json({ error: "Free plan is not configured." }, 500);
    }

    const { data: accountSubscription, error: subscriptionError } =
      await adminClient
        .from("account_subscriptions")
        .select("plan_id, provider_customer_id")
        .eq("user_id", user.id)
        .maybeSingle();

    if (subscriptionError) {
      return json({ error: subscriptionError.message }, 500);
    }

    let customerId = accountSubscription?.provider_customer_id ?? null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { user_id: user.id },
        name:
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          undefined,
      });

      customerId = customer.id;

      const { error: upsertError } = await adminClient
        .from("account_subscriptions")
        .upsert(
          {
            plan_id: accountSubscription?.plan_id ?? freePlan.id,
            provider: "stripe",
            provider_customer_id: customerId,
            user_id: user.id,
          },
          { onConflict: "user_id" },
        );

      if (upsertError) {
        return json({ error: upsertError.message }, 500);
      }
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      cancel_url: `${appUrl}/#?billing=cancelled`,
      customer: customerId,
      line_items: [
        {
          price: premiumPlan.stripe_price_id,
          quantity: 1,
        },
      ],
      metadata: {
        plan_id: premiumPlan.id,
        user_id: user.id,
      },
      mode: "subscription",
      subscription_data: {
        metadata: {
          plan_id: premiumPlan.id,
          user_id: user.id,
        },
      },
      success_url: `${appUrl}/#?billing=success`,
    });

    return json({ url: checkoutSession.url });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Checkout failed." },
      500,
    );
  }
});

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
    status,
  });
}
