import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  BarChart3,
  Car,
  ClipboardList,
  Flag,
  LogIn,
  LogOut,
  Settings,
} from "lucide-react";
import { GarageView } from "./components/GarageView";
import { SessionsView } from "./components/SessionsView";
import { TracksView } from "./components/TracksView";
import { ensureAccountSetup } from "./lib/account";
import { supabase, supabaseConfig } from "./lib/supabase";

type AppTab = "sessions" | "garage" | "tracks" | "reports";

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
  const [activeTab, setActiveTab] = useState<AppTab>("sessions");
  const [authStatus, setAuthStatus] = useState<"loading" | "ready">("loading");
  const [accountStatus, setAccountStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [authError, setAuthError] = useState("");
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

  useEffect(() => {
    if (!supabase) {
      setAuthStatus("ready");
      return;
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setAuthError(error.message);
      setSession(data.session);
      setAuthStatus("ready");
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthError("");
      setAuthStatus("ready");
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session?.user) {
      setAccountStatus("idle");
      return;
    }

    let isCurrent = true;
    setAccountStatus("loading");

    ensureAccountSetup(supabase, session.user)
      .then(() => {
        if (!isCurrent) return;
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
    const { error } = await supabase.auth.signOut();
    if (error) setAuthError(error.message);
  }

  function renderWorkspaceContent() {
    if (!session) {
      return (
        <IntroPanel
          body="Sign in with Google to create your team profile, initialize your Free plan, and start saving setup data to Supabase."
          eyebrow="Sign In"
          title="Setup Log is ready for your account."
        />
      );
    }

    if (accountStatus !== "ready") {
      return (
        <IntroPanel
          body="The app is creating or checking your profile and Free subscription."
          eyebrow="Account"
          title="Finishing account setup."
        />
      );
    }

    if (!supabase) {
      return <IntroPanel {...comingSoon[activeTab]} />;
    }

    return (
      <>
        <div className="tab-panel" hidden={activeTab !== "sessions"}>
          <SessionsView supabase={supabase} userId={session.user.id} />
        </div>
        <div className="tab-panel" hidden={activeTab !== "garage"}>
          <GarageView supabase={supabase} userId={session.user.id} />
        </div>
        <div className="tab-panel" hidden={activeTab !== "tracks"}>
          <TracksView supabase={supabase} userId={session.user.id} />
        </div>
        <div className="tab-panel" hidden={activeTab !== "reports"}>
          <IntroPanel {...comingSoon.reports} />
        </div>
      </>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <Settings size={20} />
          </div>
          <div>
            <h1>Setup Log</h1>
            <p>Quarter midget race notes</p>
          </div>
        </div>
        <div className="auth-cluster">
          {session ? (
            <>
              <span className="user-pill">{userLabel}</span>
              <button className="auth-button" type="button" onClick={signOut}>
                <LogOut size={18} />
                Sign out
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
      </header>

      <nav className="tabs" aria-label="Main views">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            className={activeTab === id ? "tab active" : "tab"}
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </nav>

      <section className="workspace">
        {authError ? <p className="auth-error">{authError}</p> : null}
        {renderWorkspaceContent()}
      </section>
    </main>
  );
}

function IntroPanel({
  body,
  eyebrow,
  title,
}: {
  body: string;
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
