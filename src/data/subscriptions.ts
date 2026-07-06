import type { SupabaseClient } from "@supabase/supabase-js";
import { cached, invalidateCache } from "./cache";

export const ACCOUNT_FEATURES = {
  customTracks: "custom_tracks",
  engineMaintenance: "engine_maintenance",
} as const;

export type AccountFeatureKey =
  (typeof ACCOUNT_FEATURES)[keyof typeof ACCOUNT_FEATURES];

export type AccountFeatures = Record<AccountFeatureKey, boolean> &
  Record<string, boolean>;

export type AccountLimits = {
  planName: string;
  planDisplayName: string;
  provider: string | null;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  priceCents: number | null;
  priceCurrency: string | null;
  maxCars: number | null;
  maxEngines: number | null;
  carCount: number;
  engineCount: number;
  canCreateCar: boolean;
  canCreateEngine: boolean;
  features: AccountFeatures;
};

type AccountLimitsRow = {
  plan_name: string;
  plan_display_name?: string | null;
  provider?: string | null;
  status: string;
  cancel_at_period_end?: boolean | null;
  current_period_end?: string | null;
  price_cents?: number | null;
  price_currency?: string | null;
  max_cars: number | null;
  max_engines: number | null;
  car_count: number;
  engine_count: number;
  can_create_car: boolean;
  can_create_engine: boolean;
  features?: Record<string, boolean> | null;
  can_create_custom_tracks?: boolean | null;
  can_create_engine_maintenance?: boolean | null;
};

export async function fetchAccountLimits(
  supabase: SupabaseClient,
): Promise<AccountLimits | null> {
  return cached("account-limits", 30 * 1000, async () => {
    const { data, error } = await supabase.rpc("account_plan_limits");

    if (error) return null;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;

    const limits = row as AccountLimitsRow;
    const billingSummary = await fetchBillingSummary(supabase);
    const features = {
      ...(limits.features ?? {}),
      [ACCOUNT_FEATURES.customTracks]:
        limits.features?.[ACCOUNT_FEATURES.customTracks] ??
        Boolean(limits.can_create_custom_tracks),
      [ACCOUNT_FEATURES.engineMaintenance]:
        limits.features?.[ACCOUNT_FEATURES.engineMaintenance] ??
        Boolean(limits.can_create_engine_maintenance),
    };

    return {
      canCreateCar: limits.can_create_car,
      canCreateEngine: limits.can_create_engine,
      cancelAtPeriodEnd:
        billingSummary?.cancelAtPeriodEnd ?? Boolean(limits.cancel_at_period_end),
      carCount: limits.car_count,
      currentPeriodEnd:
        billingSummary?.currentPeriodEnd ?? limits.current_period_end ?? null,
      engineCount: limits.engine_count,
      maxCars: limits.max_cars,
      maxEngines: limits.max_engines,
      planDisplayName: limits.plan_display_name ?? limits.plan_name,
      planName: limits.plan_name,
      provider: limits.provider ?? null,
      priceCents: billingSummary?.priceCents ?? limits.price_cents ?? null,
      priceCurrency:
        billingSummary?.priceCurrency ?? limits.price_currency ?? null,
      status: limits.status,
      features,
    };
  });
}

export function invalidateAccountLimits() {
  invalidateCache("account-limits");
}

export function hasAccountFeature(
  limits: AccountLimits | null,
  featureKey: AccountFeatureKey,
) {
  return Boolean(limits?.features[featureKey]);
}

type BillingSummary = {
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  priceCents: number | null;
  priceCurrency: string | null;
};

async function fetchBillingSummary(
  supabase: SupabaseClient,
): Promise<BillingSummary | null> {
  const { data, error } = await supabase.functions.invoke(
    "get-billing-summary",
    { method: "POST" },
  );

  if (error || !data || typeof data !== "object") return null;

  return {
    cancelAtPeriodEnd:
      "cancelAtPeriodEnd" in data && typeof data.cancelAtPeriodEnd === "boolean"
        ? data.cancelAtPeriodEnd
        : false,
    currentPeriodEnd:
      "currentPeriodEnd" in data && typeof data.currentPeriodEnd === "string"
        ? data.currentPeriodEnd
        : null,
    priceCents:
      "priceCents" in data && typeof data.priceCents === "number"
        ? data.priceCents
        : null,
    priceCurrency:
      "priceCurrency" in data && typeof data.priceCurrency === "string"
        ? data.priceCurrency
        : null,
  };
}

export function formatLimitUsage(count: number, limit: number | null) {
  return limit == null ? `${count} / Unlimited` : `${count} / ${limit}`;
}

export function formatPlanAllowance(count: number, limit: number | null) {
  return limit == null ? "Unlimited" : `${count} / ${limit}`;
}

export function formatPlanPrice(cents: number | null, currency: string | null) {
  if (cents == null || !currency) return "--";

  return new Intl.NumberFormat(undefined, {
    currency: currency.toUpperCase(),
    style: "currency",
  }).format(cents / 100);
}

export function formatRenewalDate(value: string | null) {
  if (!value) return "--";

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatSubscriptionStatus(
  status: string,
  cancelAtPeriodEnd: boolean,
) {
  if (cancelAtPeriodEnd) return "Cancelled";
  return status ? `${status.charAt(0).toUpperCase()}${status.slice(1)}` : "--";
}
