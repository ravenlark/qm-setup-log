import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import {
  BarChart3,
  Bookmark,
  Car,
  ChevronDown,
  ClipboardList,
  Flag,
  LogOut,
  MapPinned,
  Menu,
  Shield,
  User,
  X,
} from "lucide-react";
import {
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import { GoogleSignInButton } from "./components/GoogleSignInButton";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";
import { fetchAdminMe } from "./data/admin";
import { ensureAccountSetup, type UserProfile } from "./lib/account";
import { supabase, supabaseConfig } from "./lib/supabase";

type AppTab = "sessions" | "setups" | "garage" | "tracks" | "reports";
type AppView = AppTab | "profile";

const tabs = [
  { id: "sessions", label: "Sessions", icon: ClipboardList, path: "/app/sessions" },
  { id: "setups", label: "Setups", icon: Bookmark, path: "/app/setups" },
  { id: "garage", label: "My Garage", icon: Car, path: "/app/garage" },
  { id: "tracks", label: "Tracks", icon: MapPinned, path: "/app/tracks" },
  { id: "reports", label: "Reports", icon: BarChart3, path: "/app/reports" },
] satisfies Array<{
  id: AppTab;
  label: string;
  icon: typeof ClipboardList;
  path: string;
}>;

const appViews = new Set<AppView>([
  "sessions",
  "setups",
  "garage",
  "tracks",
  "reports",
  "profile",
]);

const comingSoon = {
  sessions: {
    eyebrow: "Sessions",
    title: "Sessions need Supabase before they can load.",
    body: "The Sessions tab is ready, but the Supabase client is not configured in this browser session.",
  },
  setups: {
    eyebrow: "Setups",
    title: "Favorite Setups need Supabase before they can load.",
    body: "The Setups tab is ready, but the Supabase client is not configured in this browser session.",
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

const SessionsView = lazy(() =>
  import("./components/SessionsView").then((module) => ({
    default: module.SessionsView,
  })),
);
const FavoriteSetupsView = lazy(() =>
  import("./components/FavoriteSetupsView").then((module) => ({
    default: module.FavoriteSetupsView,
  })),
);
const GarageView = lazy(() =>
  import("./components/GarageView").then((module) => ({
    default: module.GarageView,
  })),
);
const TracksView = lazy(() =>
  import("./components/TracksView").then((module) => ({
    default: module.TracksView,
  })),
);
const ReportsView = lazy(() =>
  import("./components/ReportsView").then((module) => ({
    default: module.ReportsView,
  })),
);
const ProfileView = lazy(() =>
  import("./components/ProfileView").then((module) => ({
    default: module.ProfileView,
  })),
);
const AdminView = lazy(() =>
  import("./components/AdminView").then((module) => ({
    default: module.AdminView,
  })),
);

async function signInWithGoogleRedirect(redirectPath: string) {
  if (!supabase) {
    throw new Error("Supabase is not configured yet.");
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}${redirectPath}`,
    },
  });
  if (error) throw error;
}

function useGoogleSignIn(defaultRedirectPath = "/app/sessions") {
  const [authError, setAuthError] = useState("");
  const isSupabaseConfigured = Boolean(
    supabaseConfig.url && supabaseConfig.publishableKey,
  );

  async function signIn(redirectPath = defaultRedirectPath) {
    setAuthError("");
    try {
      await signInWithGoogleRedirect(redirectPath);
    } catch (error) {
      setAuthError((error as Error).message);
    }
  }

  return { authError, isSupabaseConfigured, signIn };
}

function useAccountHeaderState({
  redirectOnSignOut = false,
}: { redirectOnSignOut?: boolean } = {}) {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [authStatus, setAuthStatus] = useState<"loading" | "ready">(
    supabase ? "loading" : "ready",
  );
  const [accountStatus, setAccountStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [teamLogoUrl, setTeamLogoUrl] = useState("");
  const [authError, setAuthError] = useState("");
  const authUserIdRef = useRef<string | null>(null);
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
  const teamLabel = profile
    ? profile.team_name.trim() || "Team name not set"
    : "Loading team...";

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
      setAuthError("");
      setAuthStatus("ready");
      if (!nextSession && redirectOnSignOut) navigate("/", { replace: true });
    });

    return () => subscription.unsubscribe();
  }, [navigate, redirectOnSignOut]);

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

  async function signOut() {
    if (!supabase) return;
    setAuthError("");
    const { error } = await supabase.auth.signOut();
    if (error) setAuthError(error.message);
    else navigate("/");
  }

  return {
    accountStatus,
    authError,
    authStatus,
    profile,
    session,
    setAuthError,
    setProfile,
    signOut,
    teamLabel,
    teamLogoUrl,
    userLabel,
  };
}

function AuthHeaderActions({
  authStatus,
  isSupabaseConfigured,
  onProfile,
  onSignIn,
  onSignOut,
  session,
  teamLabel,
  userLabel,
}: {
  authStatus: "loading" | "ready";
  isSupabaseConfigured: boolean;
  onProfile: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  session: Session | null;
  teamLabel: string;
  userLabel: string;
}) {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const userId = session?.user.id ?? null;

  useEffect(() => {
    setAccountMenuOpen(false);
    setMobileMenuOpen(false);
    setIsAdmin(false);
  }, [userId]);

  useEffect(() => {
    let isCurrent = true;
    if (!supabase || !session) return;

    fetchAdminMe(supabase)
      .then((result) => {
        if (!isCurrent) return;
        setIsAdmin(result.isAdmin);
      })
      .catch(() => {
        if (!isCurrent) return;
        setIsAdmin(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [session]);

  function openProfile() {
    setAccountMenuOpen(false);
    setMobileMenuOpen(false);
    onProfile();
  }

  function signOut() {
    setAccountMenuOpen(false);
    setMobileMenuOpen(false);
    onSignOut();
  }

  if (!session) {
    return (
      <div className="auth-cluster">
        <GoogleSignInButton
          disabled={!isSupabaseConfigured || authStatus === "loading"}
          label={authStatus === "loading" ? "Checking session" : undefined}
          onClick={onSignIn}
        />
      </div>
    );
  }

  return (
    <>
      <div className="auth-cluster">
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
              isAdmin={isAdmin}
              teamLabel={teamLabel}
              userLabel={userLabel}
              onProfile={openProfile}
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
      </div>
      {mobileMenuOpen ? (
        <div className="mobile-account-menu">
          <AccountMenuContent
            isAdmin={isAdmin}
            teamLabel={teamLabel}
            userLabel={userLabel}
            onProfile={openProfile}
            onSignOut={signOut}
          />
        </div>
      ) : null}
    </>
  );
}

function PageHeader({
  accountHeader,
  brandHref,
  home = false,
  isSupabaseConfigured,
  onSignIn,
  showUnauthenticatedSignIn = true,
}: {
  accountHeader: ReturnType<typeof useAccountHeaderState>;
  brandHref?: string;
  home?: boolean;
  isSupabaseConfigured: boolean;
  onSignIn: () => void;
  showUnauthenticatedSignIn?: boolean;
}) {
  const navigate = useNavigate();
  const showActions = Boolean(
    accountHeader.session || showUnauthenticatedSignIn,
  );

  return (
    <SiteHeader
      brandHref={brandHref}
      home={home}
      teamLogoUrl={accountHeader.teamLogoUrl}
      actions={showActions ? (
        <AuthHeaderActions
          authStatus={accountHeader.authStatus}
          isSupabaseConfigured={isSupabaseConfigured}
          onProfile={() => navigate("/app/profile")}
          onSignIn={onSignIn}
          onSignOut={accountHeader.signOut}
          session={accountHeader.session}
          teamLabel={accountHeader.teamLabel}
          userLabel={accountHeader.userLabel}
        />
      ) : null}
    />
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/app" element={<Navigate to="/app/sessions" replace />} />
      <Route path="/app/:workspaceView" element={<WorkspaceApp />} />
      <Route path="/admin/*" element={<AdminPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

function AdminPage() {
  const accountHeader = useAccountHeaderState({ redirectOnSignOut: true });
  const isSupabaseConfigured = Boolean(
    supabaseConfig.url && supabaseConfig.publishableKey,
  );

  if (accountHeader.authStatus === "loading") {
    return (
      <main className="app-shell admin-shell">
        <LoadingPanel message="Checking session..." />
      </main>
    );
  }

  if (!accountHeader.session) {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="app-shell admin-shell">
      <PageHeader
        accountHeader={accountHeader}
        brandHref="/app/sessions"
        isSupabaseConfigured={isSupabaseConfigured}
        onSignIn={() => undefined}
        showUnauthenticatedSignIn={false}
      />
      <Suspense fallback={<LoadingPanel message="Loading admin..." />}>
        {supabase ? (
          <AdminView supabase={supabase} />
        ) : (
          <IntroPanel
            eyebrow="Admin"
            title="Supabase is required for admin."
            body="Configure Supabase before opening the admin console."
          />
        )}
      </Suspense>
      <SiteFooter />
    </main>
  );
}

function HomePage() {
  const navigate = useNavigate();
  const [homeAuthStatus, setHomeAuthStatus] = useState<"loading" | "public">(
    supabase ? "loading" : "public",
  );
  const {
    authError: homeAuthError,
    isSupabaseConfigured,
    signIn,
  } = useGoogleSignIn();

  useEffect(() => {
    if (!supabase) return;

    let isCurrent = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isCurrent) return;
      if (data.session) {
        navigate("/app/sessions", { replace: true });
        return;
      }
      setHomeAuthStatus("public");
    });

    return () => {
      isCurrent = false;
    };
  }, [navigate]);

  if (homeAuthStatus === "loading") {
    return (
      <main className="app-shell home-shell">
        <LoadingPanel message="Loading My Setup Log..." />
      </main>
    );
  }

  return (
    <main className="app-shell home-shell">
      <SiteHeader
        brandHref="/"
        home
        actions={
          <GoogleSignInButton
            disabled={!isSupabaseConfigured}
            onClick={() => signIn()}
          />
        }
      />

      {homeAuthError ? <p className="auth-error">{homeAuthError}</p> : null}

      <section className="home-hero">
        <div className="home-hero-copy">
          <span className="eyebrow">Quarter midget setup tracking</span>
          <h2>Keep every car, track, engine, and race-day note in one place.</h2>
          <p>
            My Setup Log helps teams organize setup changes, maintenance work,
            track notes, session results, and next-time reminders so the useful
            details do not disappear after race day.
          </p>
          <div className="home-actions">
            <GoogleSignInButton
              disabled={!isSupabaseConfigured}
              label="Get started"
              onClick={() => signIn()}
            />
            <Link className="secondary-button" to="/pricing">
              Pricing
            </Link>
          </div>
        </div>
        <div className="home-snapshot" aria-label="Setup log preview">
          <div className="snapshot-header">
            <span>Blue car</span>
            <strong>Practice</strong>
          </div>
          <div className="snapshot-grid">
            <div>
              <span>Track</span>
              <strong>River City</strong>
            </div>
            <div>
              <span>Best Lap</span>
              <strong>8.742</strong>
            </div>
            <div>
              <span>Gear</span>
              <strong>35 / 28</strong>
            </div>
            <div>
              <span>Stagger</span>
              <strong>1.750</strong>
            </div>
          </div>
          <p>
            Tight center, better off after RF pressure change. Check tire growth
            before the next heat.
          </p>
        </div>
      </section>

      <section className="home-feature-grid" aria-label="Highlights">
        <div>
          <ClipboardList size={22} />
          <h3>Session history</h3>
          <p>Capture conditions, setup choices, lap results, and notes.</p>
        </div>
        <div>
          <Car size={22} />
          <h3>Garage records</h3>
          <p>Track cars, installed engines, and maintenance reminders.</p>
        </div>
        <div>
          <MapPinned size={22} />
          <h3>Track memory</h3>
          <p>Keep facility notes and setup tendencies close at hand.</p>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

function PricingPage() {
  const accountHeader = useAccountHeaderState();
  const {
    authError: pricingAuthError,
    isSupabaseConfigured,
    signIn,
  } = useGoogleSignIn();
  const authError = pricingAuthError || accountHeader.authError;

  return (
    <main className="app-shell pricing-shell">
      <PageHeader
        accountHeader={accountHeader}
        brandHref="/"
        home
        isSupabaseConfigured={isSupabaseConfigured}
        onSignIn={() => signIn()}
      />

      {authError ? <p className="auth-error">{authError}</p> : null}

      <section className="pricing-header">
        <span className="eyebrow">Pricing</span>
        <h2>Start free. Upgrade when your notebook gets serious.</h2>
        <p>
          Keep a simple race-day log for free, or unlock the full setup workflow
          for one team with the Senior plan.
        </p>
      </section>

      <section className="pricing-grid" aria-label="Plans">
        <article className="pricing-card">
          <div>
            <p className="pricing-plan">Rookie</p>
            <h3>Free</h3>
            <p className="pricing-copy">
              A simple way to get started tracking the essentials.
            </p>
          </div>
          <ul>
            <li>Save detailed race-day notes</li>
            <li>Compare setups to see what worked and what didn't</li>
            <li>Keep notes on your favorite tracks</li>
            <li>Limited to one car and engine</li>
          </ul>
          <button
            className="secondary-button"
            type="button"
            onClick={() => signIn("/app/garage")}
          >
            Start Free
          </button>
        </article>

        <article className="pricing-card pricing-card-featured">
          <div>
            <p className="pricing-plan">Senior</p>
            <h3>$3.99<span>/month</span></h3>
            <p className="pricing-copy">
              For teams ready to keep deeper setup history and comparisons. Get everything from the Rookie plan PLUS:
            </p>
          </div>
          <ul>
            <li>Unlimited cars and engines</li>
            <li>Log engine maintenance records</li>
            <li>Add custom tracks - great for parking lot races</li>
          </ul>
          <button
            className="primary-button"
            type="button"
            onClick={() => signIn("/app/profile")}
          >
            Choose Senior
          </button>
        </article>
      </section>

      <SiteFooter />
    </main>
  );
}

function WorkspaceApp() {
  const navigate = useNavigate();
  const { workspaceView } = useParams();
  const activeView = appViews.has(workspaceView as AppView)
    ? (workspaceView as AppView)
    : null;
  const accountHeader = useAccountHeaderState({ redirectOnSignOut: true });
  const [visitedViews, setVisitedViews] = useState<Set<AppTab>>(new Set());
  const {
    accountStatus,
    authError,
    authStatus,
    profile,
    session,
    setAuthError,
    setProfile,
    signOut,
    teamLabel,
    teamLogoUrl,
    userLabel,
  } = accountHeader;
  const isSupabaseConfigured = Boolean(
    supabaseConfig.url && supabaseConfig.publishableKey,
  );
  const mountedViews = useMemo(() => {
    const next = new Set(visitedViews);
    if (activeView && activeView !== "profile") next.add(activeView);
    return next;
  }, [activeView, visitedViews]);

  useEffect(() => {
    if (!activeView || activeView === "profile") return;
    setVisitedViews((current) => {
      if (current.has(activeView)) return current;
      const next = new Set(current);
      next.add(activeView);
      return next;
    });
  }, [activeView]);

  async function signInWithGoogle() {
    setAuthError("");
    const appRedirectPath = window.location.pathname.startsWith("/app/")
      ? window.location.pathname
      : "/app/sessions";
    try {
      await signInWithGoogleRedirect(appRedirectPath);
    } catch (error) {
      setAuthError((error as Error).message);
    }
  }

  function openProfile() {
    navigate("/app/profile");
  }

  function renderWorkspaceContent() {
    if (!activeView) {
      return <NotFoundPage showSignIn={false} />;
    }

    if (authStatus === "loading") {
      return <LoadingPanel message="Loading your workspace..." />;
    }

    if (!session) {
      return <Navigate to="/" replace />;
    }

    if (accountStatus === "error") {
      return <LoadingPanel message="Account setup needs attention." />;
    }

    if (accountStatus !== "ready" || !profile) {
      return <LoadingPanel message="Loading your workspace..." />;
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
        {mountedViews.has("sessions") ? (
          <div className="tab-panel" hidden={activeView !== "sessions"}>
            <SessionsView supabase={supabase} userId={session.user.id} />
          </div>
        ) : null}
        {mountedViews.has("setups") ? (
          <div className="tab-panel" hidden={activeView !== "setups"}>
            <FavoriteSetupsView supabase={supabase} userId={session.user.id} />
          </div>
        ) : null}
        {mountedViews.has("garage") ? (
          <div className="tab-panel" hidden={activeView !== "garage"}>
            <GarageView supabase={supabase} userId={session.user.id} />
          </div>
        ) : null}
        {mountedViews.has("tracks") ? (
          <div className="tab-panel" hidden={activeView !== "tracks"}>
            <TracksView supabase={supabase} userId={session.user.id} />
          </div>
        ) : null}
        {mountedViews.has("reports") ? (
          <div className="tab-panel" hidden={activeView !== "reports"}>
            <ReportsView supabase={supabase} userId={session.user.id} />
          </div>
        ) : null}
      </>
    );
  }

  if (!activeView) {
    return <NotFoundPage showSignIn={false} />;
  }

  return (
    <main className="app-shell">
      <SiteHeader
        teamLogoUrl={teamLogoUrl}
        actions={
          <AuthHeaderActions
            authStatus={authStatus}
            isSupabaseConfigured={isSupabaseConfigured}
            onProfile={openProfile}
            onSignIn={signInWithGoogle}
            onSignOut={signOut}
            session={session}
            teamLabel={teamLabel}
            userLabel={userLabel}
          />
        }
      />

      {session ? (
        <nav className="tabs" aria-label="Main views">
          {tabs.map(({ id, label, icon: Icon, path }) => (
            <NavLink
              className={({ isActive }) => (isActive ? "tab active" : "tab")}
              key={id}
              to={path}
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>
      ) : null}

      <section className="workspace">
        {authError ? <p className="auth-error">{authError}</p> : null}
        <Suspense fallback={<LoadingPanel message="Loading your workspace..." />}>
          {renderWorkspaceContent()}
        </Suspense>
      </section>
      <SiteFooter />
    </main>
  );
}

function PrivacyPolicyPage() {
  const accountHeader = useAccountHeaderState();
  const {
    authError: signInAuthError,
    isSupabaseConfigured,
    signIn,
  } = useGoogleSignIn();
  const authError = signInAuthError || accountHeader.authError;

  return (
    <main className="app-shell privacy-shell">
      <PageHeader
        accountHeader={accountHeader}
        brandHref="/"
        isSupabaseConfigured={isSupabaseConfigured}
        onSignIn={() => signIn()}
      />

      {authError ? <p className="auth-error">{authError}</p> : null}

      <article className="panel privacy-panel">
        <p className="eyebrow"></p>
        <h2>Privacy Policy</h2>
        <p className="privacy-updated">Last updated June 30, 2026</p>

        <section>
          <p>
            MySetupLog (“we,” “us,” or “our”) is operated by LBH MEDIA LLC. This Privacy Policy explains how we collect, use, store, and protect information when you use mysetuplog.com and related services.
          </p>

          <p>
            MySetupLog is an online tool for quarter midget racing teams to track car setups, maintenance records, engine information, racing notes, and related team information. We use the information you provide to help organize your racing records and provide insight into your racing program.
          </p>
        </section>

        <section>
          <h3>1. Information We Collect</h3>

          <p>
            We collect information that you provide directly to us and information that is collected automatically when you use the website.
          </p>

          <h4>Account Information</h4>
          <p>
            When you sign up or log in using your Google account, we may collect basic account information, including:
          </p>
          <ul>
            <li>Your name</li>
            <li>Your email address</li>
            <li>Your Google account identifier</li>
          </ul>
          <p>
            We use this information to create, authenticate, and manage your MySetupLog account.
          </p>

          <h4>Racing Team and Setup Information</h4>
          <p>
            When you use MySetupLog, you may provide information related to your racing team and racing program, including:
          </p>
          <ul>
            <li>Team name</li>
            <li>Team logo</li>
            <li>Driver names</li>
            <li>Car information</li>
            <li>Engine information</li>
            <li>Maintenance records</li>
            <li>Setup notes</li>
            <li>Track and event notes</li>
            <li>Tire, gearing, weight, and handling notes</li>
            <li>Race results or performance observations</li>
            <li>Other information you choose to enter into the service</li>
          </ul>
          <p>
            We do not intentionally collect driver ages.
          </p>

          <h4>Uploaded Content</h4>
          <p>
            If you upload a team logo or other image, that content is stored using Supabase and used to provide the features of MySetupLog, such as displaying the logo within your account.
          </p>
          <p>
            You are responsible for ensuring that you have the right to upload and use any logos, images, or other content you provide.
          </p>

          <h4>Usage and Technical Information</h4>
          <p>
            We may automatically collect certain technical and usage information, including:
          </p>
          <ul>
            <li>IP address</li>
            <li>Browser type</li>
            <li>Device type</li>
            <li>Operating system</li>
            <li>Pages viewed</li>
            <li>Features used</li>
            <li>Date and time of visits</li>
            <li>Approximate location based on IP address</li>
            <li>Error logs and performance data</li>
          </ul>
          <p>
            We may use tools such as Google Analytics or similar services to understand how users interact with the website and to improve the service.
          </p>
        </section>

        <section>
          <h3>2. How We Use Your Information</h3>

          <p>We use the information we collect to:</p>
          <ul>
            <li>Create and manage user accounts</li>
            <li>Authenticate users through Google login</li>
            <li>Provide the features and functionality of MySetupLog</li>
            <li>Store and organize team, car, engine, maintenance, setup, and racing records</li>
            <li>Generate insights based on the information you provide</li>
            <li>Improve website performance, usability, and reliability</li>
            <li>Understand how users interact with the website</li>
            <li>Troubleshoot issues and fix bugs</li>
            <li>Protect the security and integrity of the service</li>
            <li>Communicate with you about your account, support requests, or important service updates</li>
            <li>Comply with legal obligations</li>
          </ul>
        </section>

        <section>
          <h3>3. User-Provided Racing Data</h3>

          <p>
            The racing-related information you enter into MySetupLog, including setup notes, maintenance records, car information, engine information, team details, driver names, and related racing notes, remains your information.
          </p>

          <p>
            We use this data to provide the service to you, including organizing your records and generating insights for your racing program.
          </p>

          <p>
            We do not sell this information. We do not share this information with other racing teams. We do not use your private racing information to provide services to other racing teams. We do not publicly display your private racing information unless you choose to share it or make it public through a feature of the service.
          </p>
        </section>

        <section>
          <h3>4. How We Share Information</h3>

          <p>We do not sell your personal information.</p>

          <p>
            We do not share your team, car, engine, maintenance, setup, or racing notes with third parties for their own marketing or advertising purposes.
          </p>

          <p>
            We may share information with trusted service providers that help us operate MySetupLog. These providers process information on our behalf and only as needed to provide their services to us.
          </p>

          <p>These providers may include:</p>
          <ul>
            <li><strong>Google</strong>, for account authentication and login</li>
            <li><strong>Supabase</strong>, for database storage, uploaded logo storage, authentication-related services, and backend infrastructure</li>
            <li><strong>Vercel</strong>, for website hosting, frontend delivery, request processing, logs, and related infrastructure</li>
            <li><strong>Google Analytics</strong> or similar analytics providers, for website usage analytics</li>
            <li>Other infrastructure, security, logging, analytics, communication, or support providers we may use to operate and improve the service</li>
          </ul>

          <p>
            We may also disclose information if required by law, legal process, or government request, or if we believe disclosure is necessary to protect our rights, users, service, or business.
          </p>
        </section>

        <section>
          <h3>5. Cookies and Analytics</h3>

          <p>
            MySetupLog may use cookies, local storage, analytics scripts, and similar technologies to operate the website, keep users signed in, remember preferences, analyze website traffic, and improve the service.
          </p>

          <p>
            We may use Google Analytics or similar tools to collect information about how users interact with the website. These tools may collect information such as pages visited, time spent on the site, browser type, device type, and general location.
          </p>

          <p>
            You can adjust your browser settings to block or delete cookies. Some parts of the website may not function properly if cookies are disabled.
          </p>
        </section>

        <section>
          <h3>6. Data Storage and Processing</h3>

          <p>
            User information and service data are stored and processed using third-party infrastructure providers, including Supabase and Vercel.
          </p>

          <p>
            Supabase may store account information, racing data, uploaded logos, and related service data. Vercel may process website traffic, frontend requests, logs, and related technical information needed to deliver the website.
          </p>

          <p>
            These providers may process information in the United States or other locations where they operate.
          </p>
        </section>

        <section>
          <h3>7. Data Security</h3>

          <p>
            We use reasonable technical and organizational measures to protect your information from unauthorized access, loss, misuse, or alteration.
          </p>

          <p>
            However, no website, database, server, or internet transmission is completely secure. We cannot guarantee absolute security.
          </p>

          <p>
            You are responsible for protecting access to your Google account and any devices you use to access MySetupLog.
          </p>
        </section>

        <section>
          <h3>8. Data Retention</h3>

          <p>
            We retain your information for as long as your account remains active or as long as needed to provide the service.
          </p>

          <p>We may also retain certain information as necessary to:</p>
          <ul>
            <li>Provide MySetupLog's features</li>
            <li>Maintain backups</li>
            <li>Troubleshoot issues</li>
            <li>Comply with legal obligations</li>
            <li>Resolve disputes</li>
            <li>Enforce our terms or policies</li>
            <li>Protect the security and integrity of the service</li>
          </ul>

          <p>
            MySetupLog does not currently provide an automated account deletion feature. If you would like to request deletion of your account or associated data, you may contact us using the contact method listed below.
          </p>

          <p>
            If you request deletion of your account, we will take reasonable steps to delete or de-identify your personal information and user-provided racing data, unless we are required or permitted to retain it by law, for backups, security, dispute resolution, or legitimate business purposes.
          </p>
        </section>

        <section>
          <h3>9. Your Choices and Rights</h3>

          <p>
            Depending on where you live, you may have certain rights regarding your personal information. These may include the right to:
          </p>

          <ul>
            <li>Access the personal information we have about you</li>
            <li>Correct inaccurate information</li>
            <li>Request deletion of your information</li>
            <li>Request a copy of your information</li>
            <li>Object to or restrict certain processing</li>
            <li>Opt out of certain analytics or tracking technologies where applicable</li>
          </ul>

          <p>
            To make a privacy request, contact us using the contact method listed below.
          </p>

          <p>
            We may need to verify your identity before completing certain requests.
          </p>
        </section>

        <section>
          <h3>10. Children's Privacy</h3>

          <p>
            MySetupLog is intended for use by racing teams, parents, guardians, and other adults involved in quarter midget racing.
          </p>

          <p>
            The service is not intended for children under the age of 13. We do not knowingly collect account information directly from children under 13.
          </p>

          <p>
            Because quarter midget racing often involves youth drivers, users may enter driver names as part of their racing records. We do not intentionally collect driver ages. Users are responsible for ensuring that they have the appropriate authority to enter and manage any driver information they provide.
          </p>

          <p>
            If you believe a child has provided personal information to us without appropriate consent, please contact us using the contact method listed below, and we will take reasonable steps to review and delete the information if appropriate.
          </p>
        </section>

        <section>
          <h3>11. International Users</h3>

          <p>
            MySetupLog is operated from the United States. If you access the service from outside the United States, your information may be transferred to, stored in, and processed in the United States or other countries where our service providers operate.
          </p>

          <p>
            By using MySetupLog, you understand that your information may be processed in countries that may have privacy laws different from those in your country of residence.
          </p>
        </section>

        <section>
          <h3>12. Changes to This Privacy Policy</h3>

          <p>
            We may update this Privacy Policy from time to time. When we make changes, we will update the effective date at the top of this page.
          </p>

          <p>
            Your continued use of MySetupLog after changes are posted means you accept the updated Privacy Policy.
          </p>
        </section>

        <section>
          <h3>13. Contact Us</h3>

          <p>
            If you have questions about this Privacy Policy, how your information is handled, or would like to make a privacy request, contact us at:
          </p>

          <p>
            <strong>LBH MEDIA LLC</strong><br/>
            Website: <a href="https://mysetuplog.com">https://mysetuplog.com</a>
          </p>
        </section>
      </article>
      <SiteFooter />
    </main>
  );
}

function NotFoundPage({ showSignIn = true }: { showSignIn?: boolean }) {
  const accountHeader = useAccountHeaderState();
  const {
    authError: signInAuthError,
    isSupabaseConfigured,
    signIn,
  } = useGoogleSignIn();
  const authError = signInAuthError || accountHeader.authError;

  return (
    <main className="app-shell privacy-shell">
      <PageHeader
        accountHeader={accountHeader}
        brandHref="/"
        isSupabaseConfigured={isSupabaseConfigured}
        onSignIn={() => signIn()}
        showUnauthenticatedSignIn={showSignIn}
      />

      {(showSignIn || accountHeader.session) && authError ? (
        <p className="auth-error">{authError}</p>
      ) : null}

      <article className="panel privacy-panel">
        <p className="eyebrow">Not Found</p>
        <h2>Page not found</h2>
        <p>The page you were looking for is not available.</p>
        <div className="not-found-actions">
          <Link className="primary-button" to="/">
            Back to home
          </Link>
        </div>
      </article>
      <SiteFooter />
    </main>
  );
}

function AccountMenuContent({
  isAdmin,
  onProfile,
  onSignOut,
  teamLabel,
  userLabel,
}: {
  isAdmin: boolean;
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
      {isAdmin ? (
        <Link to="/admin/users">
          <Shield size={17} />
          Admin
        </Link>
      ) : null}
      <button type="button" onClick={onSignOut}>
        <LogOut size={17} />
        Log Out
      </button>
    </div>
  );
}

function LoadingPanel({ message }: { message: string }) {
  return (
    <div className="panel loading-panel" aria-busy="true">
      <div className="empty-state">{message}</div>
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
