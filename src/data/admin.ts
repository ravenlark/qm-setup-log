import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CarTypeSetupDefinition,
  SetupFieldDefinition,
  SetupSectionDefinition,
} from "./setupFields/index";

export type AdminPlan = {
  id: string;
  name: string;
  display_name: string | null;
  max_cars: number | null;
  max_engines: number | null;
  price_cents: number | null;
  price_currency: string | null;
  stripe_price_id: string | null;
  is_active: boolean;
};

export type AdminFeature = {
  key: string;
  display_name: string;
  description: string | null;
  is_active: boolean;
};

export type AdminPlanFeature = {
  plan_id: string;
  feature_key: string;
  is_enabled: boolean;
};

export type AdminUser = {
  id: string;
  email: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  teamName: string;
  subscription: {
    currentPeriodEnd: string | null;
    plan: { id: string; name: string; display_name: string | null } | null;
    provider: string | null;
    providerCustomerId: string | null;
    providerSubscriptionId: string | null;
    status: string;
  } | null;
  usage: {
    cars: number;
    engines: number;
    sessions: number;
  };
};

export type AdminCarType = {
  id: string;
  slug: string;
  name: string;
  is_active?: boolean;
};

export type AdminSetupTemplate = {
  id: string;
  car_type_id: string;
  fields: SetupFieldDefinition[];
  sections: SetupSectionDefinition[];
  is_active: boolean;
  carType?: AdminCarType | AdminCarType[] | null;
};

export async function fetchAdminMe(supabase: SupabaseClient) {
  return invokeAdmin<{ email: string | null; isAdmin: boolean }>(
    supabase,
    "admin-me",
  );
}

export async function fetchAdminUsers(
  supabase: SupabaseClient,
  search: string,
) {
  return invokeAdmin<{ users: AdminUser[] }>(supabase, "admin-users", {
    search,
  });
}

export async function assignAdminUserPlan(
  supabase: SupabaseClient,
  userId: string,
  planId: string,
) {
  return invokeAdmin<{ subscription: unknown }>(supabase, "admin-user-plan", {
    planId,
    userId,
  });
}

export async function fetchAdminPlans(supabase: SupabaseClient) {
  return invokeAdmin<{ plans: AdminPlan[] }>(supabase, "admin-plans");
}

export async function saveAdminPlan(
  supabase: SupabaseClient,
  plan: {
    displayName: string;
    id?: string;
    isActive: boolean;
    maxCars: number | null;
    maxEngines: number | null;
    name: string;
    priceCents: number | null;
    priceCurrency: string;
    stripePriceId: string;
  },
) {
  return invokeAdmin<{ plan: AdminPlan }>(supabase, "admin-plans", {
    action: "save",
    plan,
  });
}

export async function fetchAdminFeatures(supabase: SupabaseClient) {
  return invokeAdmin<{
    features: AdminFeature[];
    planFeatures: AdminPlanFeature[];
    plans: Pick<AdminPlan, "id" | "name" | "display_name" | "is_active">[];
  }>(supabase, "admin-features");
}

export async function saveAdminFeature(
  supabase: SupabaseClient,
  feature: {
    description: string;
    displayName: string;
    isActive: boolean;
    key: string;
  },
) {
  return invokeAdmin<{ feature: AdminFeature }>(supabase, "admin-features", {
    action: "save-feature",
    feature,
  });
}

export async function toggleAdminPlanFeature(
  supabase: SupabaseClient,
  planId: string,
  featureKey: string,
  isEnabled: boolean,
) {
  return invokeAdmin<{ planFeature: AdminPlanFeature }>(
    supabase,
    "admin-features",
    {
      action: "toggle-plan-feature",
      featureKey,
      isEnabled,
      planId,
    },
  );
}

export async function fetchAdminSetupTemplates(supabase: SupabaseClient) {
  return invokeAdmin<{
    carTypes: AdminCarType[];
    templates: AdminSetupTemplate[];
  }>(supabase, "admin-setup-templates");
}

export async function saveAdminSetupTemplate(
  supabase: SupabaseClient,
  template: {
    carTypeId: string;
    definition: CarTypeSetupDefinition;
    isActive: boolean;
  },
) {
  return invokeAdmin<{ template: AdminSetupTemplate }>(
    supabase,
    "admin-setup-templates",
    {
      action: "save",
      template: {
        carTypeId: template.carTypeId,
        fields: template.definition.fields,
        isActive: template.isActive,
        sections: template.definition.sections,
      },
    },
  );
}

export async function createAdminCarTypeSetupTemplate(
  supabase: SupabaseClient,
  input: {
    name: string;
    slug: string;
    sortOrder: number;
    definition: CarTypeSetupDefinition;
  },
) {
  const result = await invokeAdmin<{
    carType: AdminCarType;
    template: AdminSetupTemplate;
  }>(supabase, "admin-setup-templates", {
    action: "create-car-type-template",
    carType: {
      name: input.name,
      slug: input.slug,
      sortOrder: input.sortOrder,
    },
    template: {
      fields: input.definition.fields,
      sections: input.definition.sections,
    },
  });

  if (!result.carType?.id || !result.template?.id) {
    throw new Error(
      "admin-setup-templates did not create a template. Redeploy the latest admin-setup-templates Edge Function.",
    );
  }

  return result;
}

export async function archiveAdminCarTypeSetupTemplate(
  supabase: SupabaseClient,
  carTypeId: string,
) {
  return invokeAdmin<{ ok: boolean }>(supabase, "admin-setup-templates", {
    action: "archive-car-type-template",
    carTypeId,
  });
}

async function invokeAdmin<T>(
  supabase: SupabaseClient,
  functionName: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body: body ?? {},
    method: "POST",
  });

  if (error) throw new Error(`${functionName}: ${error.message}`);
  if (data && typeof data === "object" && "error" in data) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return data as T;
}
