import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { Camera, CreditCard, Save } from "lucide-react";
import {
  updateUserProfile,
  type UserProfile,
} from "../lib/account";

type ProfileViewProps = {
  supabase: SupabaseClient;
  user: User;
  profile: UserProfile;
  onProfileChange: (profile: UserProfile) => void;
};

type SubscriptionSummary = {
  planName: string;
  status: string;
  maxCars: number | null;
  maxEngines: number | null;
  currentPeriodEnd: string | null;
};

type SubscriptionPlanRow = {
  name: string;
  max_cars: number | null;
  max_engines: number | null;
};

type SubscriptionRow = {
  status: string;
  current_period_end: string | null;
  subscription_plans: SubscriptionPlanRow | SubscriptionPlanRow[] | null;
};

const logoBucket = "team-logos";

export function ProfileView({
  onProfileChange,
  profile,
  supabase,
  user,
}: ProfileViewProps) {
  const [teamName, setTeamName] = useState(profile.team_name);
  const [logoPath, setLogoPath] = useState(profile.logo_path);
  const [logoUrl, setLogoUrl] = useState("");
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(
    null,
  );
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [message, setMessage] = useState("");

  const userLabel = useMemo(
    () =>
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email ||
      "Signed in",
    [user],
  );

  useEffect(() => {
    setTeamName(profile.team_name);
    setLogoPath(profile.logo_path);
  }, [profile.logo_path, profile.team_name]);

  useEffect(() => {
    let isCurrent = true;

    if (!logoPath) {
      setLogoUrl("");
      return;
    }

    supabase.storage
      .from(logoBucket)
      .createSignedUrl(logoPath, 60 * 60)
      .then(({ data, error }) => {
        if (!isCurrent) return;
        if (error) {
          setLogoUrl("");
          return;
        }
        setLogoUrl(data.signedUrl);
      });

    return () => {
      isCurrent = false;
    };
  }, [logoPath, supabase]);

  useEffect(() => {
    let isCurrent = true;

    supabase
      .from("account_subscriptions")
      .select(
        "status, current_period_end, subscription_plans(name, max_cars, max_engines)",
      )
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!isCurrent) return;
        if (error || !data) {
          setSubscription(null);
          return;
        }

        const row = data as SubscriptionRow;
        const plan = Array.isArray(row.subscription_plans)
          ? row.subscription_plans[0]
          : row.subscription_plans;

        setSubscription({
          currentPeriodEnd: row.current_period_end,
          maxCars: plan?.max_cars ?? null,
          maxEngines: plan?.max_engines ?? null,
          planName: plan?.name ?? "Free",
          status: row.status,
        });
      });

    return () => {
      isCurrent = false;
    };
  }, [supabase, user.id]);

  async function handleSaveProfile() {
    setMessage("");
    setIsSavingProfile(true);

    try {
      const nextProfile = await updateUserProfile(supabase, {
        id: profile.id,
        logo_path: logoPath,
        team_name: teamName.trim(),
      });
      onProfileChange(nextProfile);
      setMessage("Profile updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Profile update failed.");
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleLogoUpload(file: File | null) {
    if (!file) return;

    setMessage("");
    setIsUploadingLogo(true);

    const extension = file.name.split(".").pop()?.toLowerCase() || "png";
    const safeName = `${crypto.randomUUID()}.${extension}`;
    const path = `${user.id}/${safeName}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from(logoBucket)
        .upload(path, file, {
          contentType: file.type || undefined,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const nextProfile = await updateUserProfile(supabase, {
        id: profile.id,
        logo_path: path,
        team_name: teamName.trim(),
      });

      setLogoPath(nextProfile.logo_path);
      onProfileChange(nextProfile);
      setMessage("Team logo updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Logo upload failed.");
    } finally {
      setIsUploadingLogo(false);
    }
  }

  return (
    <div className="profile-layout">
      <section className="panel form-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Profile</span>
            <h2>Team Profile</h2>
          </div>
        </div>

        <div className="profile-summary">
          <div className="profile-logo-preview" aria-label="Team logo preview">
            {logoUrl ? (
              <img alt="" src={logoUrl} />
            ) : (
              <Camera size={30} aria-hidden="true" />
            )}
          </div>
          <div>
            <strong>{teamName.trim() || "Team name not set"}</strong>
            <span>{userLabel}</span>
          </div>
        </div>

        <div className="form-grid single">
          <label>
            Team Name
            <input
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
            />
          </label>
          <label>
            Team Logo
            <input
              accept="image/*"
              type="file"
              onChange={(event) => handleLogoUpload(event.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        <div className="panel-actions profile-actions">
          <button
            className="primary-button"
            disabled={isSavingProfile}
            type="button"
            onClick={handleSaveProfile}
          >
            <Save size={17} />
            {isSavingProfile ? "Saving" : "Save Profile"}
          </button>
          <span className="profile-upload-status">
            {isUploadingLogo ? "Uploading logo..." : "Logo uploads on selection."}
          </span>
        </div>

        {message ? <p className="saved-note profile-message">{message}</p> : null}
      </section>

      <section className="panel form-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Billing</span>
            <h2>Subscription</h2>
          </div>
          <CreditCard size={22} aria-hidden="true" />
        </div>

        <div className="subscription-card">
          <div>
            <span>Current Plan</span>
            <strong>{subscription?.planName ?? "Free"}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{subscription?.status ?? "Active"}</strong>
          </div>
          <div>
            <span>Cars</span>
            <strong>{formatLimit(subscription?.maxCars)}</strong>
          </div>
          <div>
            <span>Engines</span>
            <strong>{formatLimit(subscription?.maxEngines)}</strong>
          </div>
          <div>
            <span>Renews</span>
            <strong>{formatDate(subscription?.currentPeriodEnd)}</strong>
          </div>
        </div>

        <p className="profile-help">
          Plan changes and billing management will live here once payments are
          wired in.
        </p>
      </section>
    </div>
  );
}

function formatLimit(value: number | null | undefined) {
  return value == null ? "Unlimited" : value.toString();
}

function formatDate(value: string | null | undefined) {
  if (!value) return "--";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(new Date(value));
}
