import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { Camera, CreditCard, Save, Sparkles, XCircle } from "lucide-react";
import {
  fetchAccountLimits,
  formatPlanAllowance,
  formatPlanPrice,
  formatRenewalDate,
  formatSubscriptionStatus,
  type AccountLimits,
} from "../data/subscriptions";
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
  const [accountLimits, setAccountLimits] = useState<AccountLimits | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [isOpeningCancelFlow, setIsOpeningCancelFlow] = useState(false);
  const [message, setMessage] = useState("");
  const [billingMessage, setBillingMessage] = useState("");

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

    fetchAccountLimits(supabase, { includeLiveBilling: true })
      .then((limits) => {
        if (!isCurrent) return;
        setAccountLimits(limits);
      })
      .catch(() => {
        if (!isCurrent) return;
        setAccountLimits(null);
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

  async function handleUpgradeToPremium() {
    setBillingMessage("");
    setIsStartingCheckout(true);

    try {
      await redirectToBillingFunction(supabase, "create-checkout-session");
    } catch (error) {
      setBillingMessage(
        error instanceof Error ? error.message : "Checkout could not be started.",
      );
      setIsStartingCheckout(false);
    }
  }

  async function handleManageSubscription() {
    setBillingMessage("");
    setIsOpeningPortal(true);

    try {
      await redirectToBillingFunction(supabase, "create-billing-portal-session");
    } catch (error) {
      setBillingMessage(
        error instanceof Error
          ? error.message
          : "Billing portal could not be opened.",
      );
      setIsOpeningPortal(false);
    }
  }

  async function handleCancelSubscription() {
    setBillingMessage("");
    setIsOpeningCancelFlow(true);

    try {
      await redirectToBillingFunction(supabase, "create-billing-portal-session", {
        flow: "cancel",
      });
    } catch (error) {
      setBillingMessage(
        error instanceof Error
          ? error.message
          : "Cancellation flow could not be opened.",
      );
      setIsOpeningCancelFlow(false);
    }
  }

  const isPremium =
    accountLimits?.planName.toLowerCase() === "premium" &&
    ["active", "trialing"].includes(accountLimits.status.toLowerCase());
  const isCanceling = Boolean(accountLimits?.cancelAtPeriodEnd);
  const isBillingLoading = !accountLimits;
  const canManageStripeSubscription =
    isPremium && accountLimits?.provider === "stripe";

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
          {isBillingLoading ? (
            <div className="subscription-card-wide">
              <span>Current Plan</span>
              <strong>Loading...</strong>
            </div>
          ) : (
            <>
              <div className={isPremium ? undefined : "subscription-card-wide"}>
                <span>Current Plan</span>
                <strong>{accountLimits.planDisplayName}</strong>
              </div>
              {isPremium ? (
                <div>
                  <span>Status</span>
                  <strong>
                    {formatSubscriptionStatus(accountLimits.status, isCanceling)}
                  </strong>
                </div>
              ) : null}
              {isPremium ? (
                <>
                  <div>
                    <span>Price</span>
                    <strong>
                      {formatPlanPrice(
                        accountLimits.priceCents,
                        accountLimits.priceCurrency,
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>{isCanceling ? "Ends" : "Renews"}</span>
                    <strong>
                      {formatRenewalDate(accountLimits.currentPeriodEnd)}
                    </strong>
                  </div>
                </>
              ) : null}
              <div>
                <span>Engines</span>
                <strong>
                  {formatPlanAllowance(
                    accountLimits.engineCount,
                    accountLimits.maxEngines,
                  )}
                </strong>
              </div>
              <div>
                <span>Cars</span>
                <strong>
                  {formatPlanAllowance(accountLimits.carCount, accountLimits.maxCars)}
                </strong>
              </div>
            </>
          )}
        </div>

        <div className="profile-billing-actions">
          {isBillingLoading ? null : canManageStripeSubscription ? (
            <button
              className="secondary-button"
              disabled={isOpeningPortal}
              type="button"
              onClick={handleManageSubscription}
            >
              <CreditCard size={17} />
              {isOpeningPortal ? "Opening Billing" : "Manage Subscription"}
            </button>
          ) : null}
          {!isBillingLoading && canManageStripeSubscription && !isCanceling ? (
            <button
              className="secondary-button"
              disabled={isOpeningCancelFlow}
              type="button"
              onClick={handleCancelSubscription}
            >
              <XCircle size={17} />
              {isOpeningCancelFlow ? "Opening Cancellation" : "Cancel Subscription"}
            </button>
          ) : null}
          {!isBillingLoading && !isPremium ? (
            <button
              className="primary-button"
              disabled={isStartingCheckout}
              type="button"
              onClick={handleUpgradeToPremium}
            >
              <Sparkles size={17} />
              {isStartingCheckout ? "Opening Checkout" : "Upgrade to Premium"}
            </button>
          ) : null}
        </div>

        {billingMessage ? (
          <p className="auth-error profile-message">{billingMessage}</p>
        ) : null}
      </section>
    </div>
  );
}

async function redirectToBillingFunction(
  supabase: SupabaseClient,
  functionName: string,
  body?: Record<string, string>,
) {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    method: "POST",
  });

  if (error) throw new Error(await functionErrorMessage(error));

  const url =
    typeof data === "object" && data && "url" in data ? String(data.url) : "";

  if (!url) throw new Error("Billing session did not return a URL.");

  window.location.href = url;
}

async function functionErrorMessage(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "context" in error &&
    error.context instanceof Response
  ) {
    try {
      const body = await error.context.clone().json();
      if (body && typeof body.error === "string") return body.error;
    } catch {
      try {
        const text = await error.context.clone().text();
        if (text) return text;
      } catch {
        // Fall through to the generic message below.
      }
    }
  }

  return error instanceof Error
    ? error.message
    : "Billing session could not be started.";
}
