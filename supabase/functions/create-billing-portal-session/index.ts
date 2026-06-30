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
    const requestBody = await readBody(req);

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
    const { data: accountSubscription, error: subscriptionError } =
      await adminClient
        .from("account_subscriptions")
        .select("provider_customer_id, provider_subscription_id")
        .eq("user_id", user.id)
        .maybeSingle();

    if (subscriptionError) {
      return json({ error: subscriptionError.message }, 500);
    }

    if (!accountSubscription?.provider_customer_id) {
      return json({ error: "No Stripe customer is linked to this account." }, 400);
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2024-06-20" as Stripe.LatestApiVersion,
      httpClient: Stripe.createFetchHttpClient(),
    });

    if (requestBody.flow === "cancel") {
      if (!accountSubscription.provider_subscription_id) {
        return json(
          { error: "No Stripe subscription is linked to this account." },
          400,
        );
      }

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: accountSubscription.provider_customer_id,
        flow_data: {
          after_completion: {
            redirect: {
              return_url: `${appUrl}/#?billing=cancelled`,
            },
            type: "redirect",
          },
          subscription_cancel: {
            subscription: accountSubscription.provider_subscription_id,
          },
          type: "subscription_cancel",
        },
        return_url: `${appUrl}/#?billing=portal`,
      });

      return json({ url: portalSession.url });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: accountSubscription.provider_customer_id,
      return_url: `${appUrl}/#?billing=portal`,
    });

    return json({ url: portalSession.url });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Billing portal failed." },
      500,
    );
  }
});

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

async function readBody(req: Request) {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as { flow?: string }) : {};
  } catch {
    return {};
  }
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
