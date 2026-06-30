import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  BarChart3,
  Car,
  ChevronDown,
  ClipboardList,
  Flag,
  LogIn,
  LogOut,
  Menu,
  Settings,
  User,
  X,
} from "lucide-react";
import { GarageView } from "./components/GarageView";
import { ProfileView } from "./components/ProfileView";
import { ReportsView } from "./components/ReportsView";
import { SessionsView } from "./components/SessionsView";
import { TracksView } from "./components/TracksView";
import { ensureAccountSetup, type UserProfile } from "./lib/account";
import { supabase, supabaseConfig } from "./lib/supabase";

type AppTab = "sessions" | "garage" | "tracks" | "reports";
type AppView = AppTab | "profile";

const tabs = [
  { id: "sessions", label: "Sessions", icon: ClipboardList },
  { id: "garage", label: "My Garage", icon: Car },
  { id: "tracks", label: "Tracks", icon: Flag },
  { id: "reports", label: "Reports", icon: BarChart3 },
] satisfies Array<{ id: AppTab; label: string; icon: typeof ClipboardList }>;

const comingSoon = {
  sessions: {
    eyebrow: "Sessions",
    title: "Sessions need Supabase before they can load.",
    body: "The Sessions tab is ready, but the Supabase client is not configured in this browser session.",
  },
  garage: {
    eyebrow: "Garage",
    title: "Cars and engines will build on the same data pattern.",
    body: "This area will manage cars, engine inventory, active engine assignments, and maintenance history once the track workflow is settled.",
  },
  tracks: {
    eyebrow: "Tracks",
    title: "Tracks need Supabase before they can load.",
    body: "The Tracks tab is ready, but the Supabase client is not configured in this browser session.",
  },
  reports: {
    eyebrow: "Reports",
    title: "Reports come after we have real session history.",
    body: "The schema is ready for comparison and trend queries, but the reports surface will make more sense once sessions are flowing into Supabase.",
  },
};

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [activeView, setActiveView] = useState<AppView>("sessions");
  const [authStatus, setAuthStatus] = useState<"loading" | "ready">("loading");
  const [accountStatus, setAccountStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [teamLogoUrl, setTeamLogoUrl] = useState("");
  const [authError, setAuthError] = useState("");
  const authUserIdRef = useRef<string | null>(null);
  const isSupabaseConfigured = Boolean(
    supabaseConfig.url && supabaseConfig.publishableKey,
  );
  const userId = session?.user.id ?? null;
  const userLabel = useMemo(() => {
    const user = session?.user;
    return (
      user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      user?.email ||
      "Signed in"
    );
  }, [session]);
  const teamLabel = profile?.team_name.trim() || "Team name not set";

  useEffect(() => {
    if (!supabase) {
      setAuthStatus("ready");
      return;
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setAuthError(error.message);
      authUserIdRef.current = data.session?.user.id ?? null;
      setSession(data.session);
      setAuthStatus("ready");
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const nextUserId = nextSession?.user.id ?? null;
      const userChanged = authUserIdRef.current !== nextUserId;

      authUserIdRef.current = nextUserId;
      setSession(nextSession);
      if (userChanged) setProfile(null);
      setAccountMenuOpen(false);
      setMobileMenuOpen(false);
      setAuthError("");
      setAuthStatus("ready");
      if (!nextSession) setActiveView("sessions");
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session?.user) {
      setAccountStatus("idle");
      setProfile(null);
      return;
    }

    let isCurrent = true;
    setAccountStatus("loading");

    ensureAccountSetup(supabase, session.user)
      .then((nextProfile) => {
        if (!isCurrent) return;
        setProfile(nextProfile);
        setAccountStatus("ready");
        setAuthError("");
      })
      .catch((error: Error) => {
        if (!isCurrent) return;
        setAccountStatus("error");
        setAuthError(error.message);
      });

    return () => {
      isCurrent = false;
    };
  }, [userId]);

  useEffect(() => {
    let isCurrent = true;

    if (!supabase || !profile?.logo_path) {
      setTeamLogoUrl("");
      return;
    }

    supabase.storage
      .from("team-logos")
      .createSignedUrl(profile.logo_path, 60 * 60)
      .then(({ data, error }) => {
        if (!isCurrent) return;
        setTeamLogoUrl(error ? "" : data.signedUrl);
      });

    return () => {
      isCurrent = false;
    };
  }, [profile?.logo_path]);

  async function signInWithGoogle() {
    if (!supabase) {
      setAuthError("Supabase is not configured yet.");
      return;
    }

    setAuthError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) setAuthError(error.message);
  }

  async function signOut() {
    if (!supabase) return;
    setAuthError("");
    setAccountMenuOpen(false);
    setMobileMenuOpen(false);
    const { error } = await supabase.auth.signOut();
    if (error) setAuthError(error.message);
  }

  function openProfilePlaceholder() {
    setAccountMenuOpen(false);
    setMobileMenuOpen(false);
    setActiveView("profile");
  }

  function renderWorkspaceContent() {
    if (!session) {
      return (
        <IntroPanel
          body={
            <>
              Keep track of your cars, engine maintenance, car setups, favorite
              tracks, and more.
              <br />
              <br />
              Compare your sessions from one race day to the next and see what
              set you back or what put you ahead of the pack.
              <br />
              <br />
              Sign up today and get started for free!
            </>
          }
          eyebrow=""
          title="Are you ready to improve your QM racing program?"
        />
      );
    }

    if (accountStatus !== "ready" || !profile) {
      return (
        <IntroPanel
          body="The app is creating or checking your profile and Free subscription."
          eyebrow="Account"
          title="Finishing account setup."
        />
      );
    }

    if (!supabase) {
      const fallbackView = activeView === "profile" ? "sessions" : activeView;
      return <IntroPanel {...comingSoon[fallbackView]} />;
    }

    if (activeView === "profile") {
      return (
        <ProfileView
          profile={profile}
          supabase={supabase}
          user={session.user}
          onProfileChange={setProfile}
        />
      );
    }

    return (
      <>
        <div className="tab-panel" hidden={activeView !== "sessions"}>
          <SessionsView supabase={supabase} userId={session.user.id} />
        </div>
        <div className="tab-panel" hidden={activeView !== "garage"}>
          <GarageView supabase={supabase} userId={session.user.id} />
        </div>
        <div className="tab-panel" hidden={activeView !== "tracks"}>
          <TracksView supabase={supabase} userId={session.user.id} />
        </div>
        <div className="tab-panel" hidden={activeView !== "reports"}>
          <ReportsView supabase={supabase} userId={session.user.id} />
        </div>
      </>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div
            className={teamLogoUrl ? "brand-mark brand-mark-logo" : "brand-mark"}
            aria-hidden="true"
          >
            {teamLogoUrl ? (
              <img alt="" src={teamLogoUrl} />
            ) : (
              <Settings size={20} />
            )}
          </div>
          <div>
            <h1>Setup Log</h1>
            <p>Quarter midget race notes</p>
          </div>
        </div>
        <div className="auth-cluster">
          {session ? (
            <>
              <div className="desktop-account-menu">
                <button
                  aria-expanded={accountMenuOpen}
                  className="account-menu-button"
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setAccountMenuOpen((open) => !open);
                  }}
                >
                  <span>
                    <strong>{userLabel}</strong>
                    <small>{teamLabel}</small>
                  </span>
                  <ChevronDown size={18} />
                </button>
                {accountMenuOpen ? (
                  <AccountMenuContent
                    teamLabel={teamLabel}
                    userLabel={userLabel}
                    onProfile={openProfilePlaceholder}
                    onSignOut={signOut}
                  />
                ) : null}
              </div>
              <button
                aria-expanded={mobileMenuOpen}
                aria-label="Open menu"
                className="mobile-menu-button"
                type="button"
                onClick={() => {
                  setAccountMenuOpen(false);
                  setMobileMenuOpen((open) => !open);
                }}
              >
                {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </>
          ) : (
            <button
              className="auth-button"
              disabled={!isSupabaseConfigured || authStatus === "loading"}
              type="button"
              onClick={signInWithGoogle}
            >
              <LogIn size={18} />
              {authStatus === "loading" ? "Checking session" : "Sign in with Google"}
            </button>
          )}
        </div>
        {session && mobileMenuOpen ? (
          <div className="mobile-account-menu">
            <AccountMenuContent
              teamLabel={teamLabel}
              userLabel={userLabel}
              onProfile={openProfilePlaceholder}
              onSignOut={signOut}
            />
          </div>
        ) : null}
      </header>

      {session ? (
        <nav className="tabs" aria-label="Main views">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              className={activeView === id ? "tab active" : "tab"}
              key={id}
              type="button"
              onClick={() => setActiveView(id)}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>
      ) : null}

      <section className="workspace">
        {authError ? <p className="auth-error">{authError}</p> : null}
        {renderWorkspaceContent()}
      </section>
    </main>
  );
}

function AccountMenuContent({
  onProfile,
  onSignOut,
  teamLabel,
  userLabel,
}: {
  onProfile: () => void;
  onSignOut: () => void;
  teamLabel: string;
  userLabel: string;
}) {
  return (
    <div className="account-menu-content">
      <div className="account-menu-heading">
        <strong>{userLabel}</strong>
        <span>{teamLabel}</span>
      </div>
      <button type="button" onClick={onProfile}>
        <User size={17} />
        Profile
      </button>
      <button type="button" onClick={onSignOut}>
        <LogOut size={17} />
        Log Out
      </button>
    </div>
  );
}

function IntroPanel({
  body,
  eyebrow,
  title,
}: {
  body: ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="panel intro-panel">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{body}</p>
      </div>
    </div>
  );
}
