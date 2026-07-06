import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const admin = await requireAdmin(req);
    if ("error" in admin) return admin.error;

    const body = await readJson(req) as {
      action?: string;
      template?: {
        carTypeId?: string;
        fields?: unknown;
        isActive?: boolean;
        sections?: unknown;
      };
      carType?: {
        id?: string;
        name?: string;
        slug?: string;
        sortOrder?: number;
      };
      carTypeId?: string;
    };

    if (body.action === "create-car-type-template") {
      const carType = body.carType ?? {};
      const template = body.template ?? {};
      const name = carType.name?.trim();
      const slug = normalizeSlug(carType.slug || name || "");
      if (!name || !slug) {
        return json({ error: "Car type name and slug are required." }, 400);
      }
      if (!isFieldArray(template.fields)) {
        return json({ error: "fields must be an array of setup fields." }, 400);
      }
      if (!isSectionArray(template.sections)) {
        return json({ error: "sections must be an array of setup sections." }, 400);
      }

      const { data: savedCarType, error: carTypeError } = await admin.adminClient
        .from("car_types")
        .upsert(
          {
            is_active: true,
            name,
            slug,
            sort_order: Number.isFinite(carType.sortOrder)
              ? Math.trunc(carType.sortOrder ?? 0)
              : 100,
          },
          { onConflict: "slug" },
        )
        .select("id, slug, name, is_active")
        .single();

      if (carTypeError) return json({ error: carTypeError.message }, 500);

      const { data: savedTemplate, error: templateError } = await admin.adminClient
        .from("car_type_setup_templates")
        .upsert(
          {
            car_type_id: savedCarType.id,
            fields: template.fields,
            is_active: true,
            sections: template.sections,
          },
          { onConflict: "car_type_id" },
        )
        .select(
          "id, car_type_id, fields, sections, is_active, carType:car_types(id, slug, name)",
        )
        .single();

      if (templateError) return json({ error: templateError.message }, 500);
      return json({ carType: savedCarType, template: savedTemplate });
    }

    if (body.action === "archive-car-type-template") {
      if (!body.carTypeId) return json({ error: "carTypeId is required." }, 400);

      const [templateResult, carTypeResult] = await Promise.all([
        admin.adminClient
          .from("car_type_setup_templates")
          .update({ is_active: false })
          .eq("car_type_id", body.carTypeId),
        admin.adminClient
          .from("car_types")
          .update({ is_active: false })
          .eq("id", body.carTypeId),
      ]);

      if (templateResult.error) {
        return json({ error: templateResult.error.message }, 500);
      }
      if (carTypeResult.error) {
        return json({ error: carTypeResult.error.message }, 500);
      }

      return json({ ok: true });
    }

    if (body.action === "save") {
      const template = body.template ?? {};
      if (!template.carTypeId) return json({ error: "carTypeId is required." }, 400);
      if (!isFieldArray(template.fields)) {
        return json({ error: "fields must be an array of setup fields." }, 400);
      }
      if (!isSectionArray(template.sections)) {
        return json({ error: "sections must be an array of setup sections." }, 400);
      }

      const isActive = template.isActive ?? true;
      const carTypeResult = await admin.adminClient
        .from("car_types")
        .update({ is_active: isActive })
        .eq("id", template.carTypeId);

      if (carTypeResult.error) {
        return json({ error: carTypeResult.error.message }, 500);
      }

      const { data, error } = await admin.adminClient
        .from("car_type_setup_templates")
        .upsert(
          {
            car_type_id: template.carTypeId,
            fields: template.fields,
            is_active: isActive,
            sections: template.sections,
          },
          { onConflict: "car_type_id" },
        )
        .select(
          "id, car_type_id, fields, sections, is_active, carType:car_types(id, slug, name)",
        )
        .single();

      if (error) return json({ error: error.message }, 500);
      return json({ template: data });
    }

    if (body.action) {
      return json({ error: `Unknown admin setup template action: ${body.action}` }, 400);
    }

    const [carTypesResult, templatesResult] = await Promise.all([
      admin.adminClient
        .from("car_types")
        .select("id, slug, name, is_active")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      admin.adminClient
        .from("car_type_setup_templates")
        .select(
          "id, car_type_id, fields, sections, is_active, carType:car_types(id, slug, name)",
        )
        .order("updated_at", { ascending: false }),
    ]);

    if (carTypesResult.error) return json({ error: carTypesResult.error.message }, 500);
    if (templatesResult.error) return json({ error: templatesResult.error.message }, 500);

    return json({
      carTypes: carTypesResult.data ?? [],
      templates: templatesResult.data ?? [],
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Admin templates failed." },
      500,
    );
  }
});

function isFieldArray(value: unknown) {
  return (
    Array.isArray(value) &&
    value.every((field) => {
      if (!field || typeof field !== "object") return false;
      const record = field as Record<string, unknown>;
      return (
        typeof record.key === "string" &&
        typeof record.label === "string" &&
        typeof record.group === "string" &&
        ["setup_values", "result_values", "note_values"].includes(
          String(record.scope),
        ) &&
        ["text", "number", "integer", "textarea", "select", "radio"].includes(
          String(record.type),
        ) &&
        (!("options" in record) || Array.isArray(record.options))
      );
    })
  );
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isSectionArray(value: unknown) {
  return (
    Array.isArray(value) &&
    value.every((section) => {
      if (!section || typeof section !== "object") return false;
      const record = section as Record<string, unknown>;
      return (
        typeof record.id === "string" &&
        typeof record.title === "string" &&
        Array.isArray(record.blocks)
      );
    })
  );
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
