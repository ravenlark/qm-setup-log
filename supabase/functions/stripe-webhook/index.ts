import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
  apiVersion: "2024-06-20" as Stripe.LatestApiVersion,
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  requireEnv("SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
);

const webhookSecret = requireEnv("STRIPE_WEBHOOK_SECRET");
const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return json({ error: "Missing Stripe signature." }, 400);
  }

  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider,
    );
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? `Webhook signature verification failed: ${error.message}`
            : "Webhook signature verification failed.",
      },
      400,
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await syncCheckoutSession(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_succeeded":
      case "invoice.payment_failed":
        await syncInvoice(event.data.object as Stripe.Invoice);
        break;
      default:
        break;
    }

    return json({ received: true });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Webhook failed." },
      500,
    );
  }
});

async function syncCheckoutSession(session: Stripe.Checkout.Session) {
  const subscriptionId = stripeId(session.subscription);
  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const metadataUserId = session.metadata?.user_id;

  await syncSubscription(subscription, metadataUserId);
}

async function syncInvoice(invoice: Stripe.Invoice) {
  const subscriptionId = stripeId(invoice.subscription);
  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await syncSubscription(subscription);
}

async function syncSubscription(
  subscription: Stripe.Subscription,
  fallbackUserId?: string,
) {
  const customerId = stripeId(subscription.customer);
  const priceId = subscription.items.data[0]?.price.id;
  const userId =
    subscription.metadata.user_id ||
    fallbackUserId ||
    (await findUserId(subscription.id, customerId));

  if (!userId || !customerId || !priceId) return;

  const { data: plan, error: planError } = await supabase
    .from("subscription_plans")
    .select("id")
    .eq("stripe_price_id", priceId)
    .single();

  if (planError || !plan) {
    throw new Error(`No subscription plan is mapped to Stripe price ${priceId}.`);
  }

  const { error } = await supabase.from("account_subscriptions").upsert(
    {
      cancel_at_period_end: subscription.cancel_at_period_end,
      current_period_end: unixToIso(subscription.current_period_end),
      plan_id: plan.id,
      provider: "stripe",
      provider_customer_id: customerId,
      provider_subscription_id: subscription.id,
      status: subscription.status,
      user_id: userId,
    },
    { onConflict: "user_id" },
  );

  if (error) throw error;
}

async function findUserId(subscriptionId: string, customerId: string | null) {
  let query = supabase
    .from("account_subscriptions")
    .select("user_id")
    .eq("provider_subscription_id", subscriptionId)
    .maybeSingle();

  let { data, error } = await query;
  if (error) throw error;
  if (data?.user_id) return data.user_id as string;

  if (!customerId) return null;

  ({ data, error } = await supabase
    .from("account_subscriptions")
    .select("user_id")
    .eq("provider_customer_id", customerId)
    .maybeSingle());

  if (error) throw error;
  return (data?.user_id as string | undefined) ?? null;
}

function stripeId(value: string | { id: string } | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function unixToIso(value: number | null | undefined) {
  return value ? new Date(value * 1000).toISOString() : null;
}

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
