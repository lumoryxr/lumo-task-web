import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Shell } from "@/components/Shell";
import { RouteFallback } from "@/components/RouteFallback";

// Route-level code splitting: each page ships as its own chunk, loaded on
// demand, so the initial bundle no longer carries every screen's code. Pages
// use named exports, so map them onto the default export `React.lazy` expects.
const TodayPage = lazy(() =>
  import("@/pages/TodayPage").then((m) => ({ default: m.TodayPage }))
);
const MatrixPage = lazy(() =>
  import("@/pages/MatrixPage").then((m) => ({ default: m.MatrixPage }))
);
const FocusPage = lazy(() =>
  import("@/pages/FocusPage").then((m) => ({ default: m.FocusPage }))
);
const SettingsPage = lazy(() =>
  import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage }))
);
const OnboardingPage = lazy(() =>
  import("@/pages/OnboardingPage").then((m) => ({ default: m.OnboardingPage }))
);
const LoginPage = lazy(() =>
  import("@/pages/LoginPage").then((m) => ({ default: m.LoginPage }))
);
const RegisterPage = lazy(() =>
  import("@/pages/RegisterPage").then((m) => ({ default: m.RegisterPage }))
);
const AccountPage = lazy(() =>
  import("@/pages/AccountPage").then((m) => ({ default: m.AccountPage }))
);
const ChangePasswordPage = lazy(() =>
  import("@/pages/ChangePasswordPage").then((m) => ({
    default: m.ChangePasswordPage,
  }))
);
const CountdownPage = lazy(() =>
  import("@/pages/CountdownPage").then((m) => ({ default: m.CountdownPage }))
);
const HabitsPage = lazy(() =>
  import("@/pages/HabitsPage").then((m) => ({ default: m.HabitsPage }))
);
const StatsPage = lazy(() =>
  import("@/pages/StatsPage").then((m) => ({ default: m.StatsPage }))
);
import { applyAccentTheme, useAppStore } from "@/store/useAppStore";
import { useTasksStore } from "@/store/useTasksStore";
import { usePeopleStore } from "@/store/usePeopleStore";
import { useCountdownStore } from "@/store/useCountdownStore";
import { useTemplatesStore } from "@/store/useTemplatesStore";
import { useHabitsStore } from "@/store/useHabitsStore";
import { selectIsSignedIn, useAuthStore } from "@/store/useAuthStore";
import { useNotificationStore } from "@/store/useNotificationStore";
import { useNotificationScheduler } from "@/hooks/useNotificationScheduler";
import { useSyncEngine } from "@/hooks/useSyncEngine";
import { useReducedMotionClass } from "@/hooks/useReducedMotionClass";
import { ToastStack } from "@/components/ToastStack";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { toast } from "@/store/useToastStore";
import { t } from "@/i18n/useT";

/**
 * App root.
 *
 * - Loads the persisted accent on mount.
 * - Bootstraps the stores from the backend API.
 * - First-run users see /onboarding; everyone else gets the Shell.
 */
export default function App() {
  const accent = useAppStore((s) => s.accent);
  const onboarded = useAppStore((s) => s.onboarded);
  useReducedMotionClass();
  const loadTasks = useTasksStore((s) => s.load);
  const clearTasks = useTasksStore((s) => s.clear);
  const loadPeople = usePeopleStore((s) => s.load);
  const clearPeople = usePeopleStore((s) => s.clear);
  const loadCountdowns = useCountdownStore((s) => s.load);
  const clearCountdowns = useCountdownStore((s) => s.clear);
  const loadHabits = useHabitsStore((s) => s.load);
  const clearHabits = useHabitsStore((s) => s.clear);
  const loadNotifications = useNotificationStore((s) => s.load);
  const loadAppearance = useAppStore((s) => s.loadAppearance);
  const loadTemplates = useTemplatesStore((s) => s.load);
  const clearTemplates = useTemplatesStore((s) => s.clear);
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const userId = useAuthStore((s) => s.user.id);
  const forceSignOut = useAuthStore((s) => s.forceSignOut);
  const location = useLocation();

  useEffect(() => {
    applyAccentTheme(accent);
  }, [accent]);

  useEffect(() => {
    const handleSessionExpired = () => {
      forceSignOut();
      toast.error(t("error.auth.sessionExpired"));
    };
    window.addEventListener("lumo:session-expired", handleSessionExpired);
    return () => window.removeEventListener("lumo:session-expired", handleSessionExpired);
  }, [forceSignOut]);

  useEffect(() => {
    if (isSignedIn) {
      loadTasks();
      loadPeople();
      loadCountdowns(userId);
      loadHabits(userId);
      loadNotifications();
      loadTemplates();
      loadAppearance();
    } else {
      clearTasks();
      clearPeople();
      clearCountdowns();
      clearHabits();
      clearTemplates();
    }
  }, [isSignedIn, userId, loadTasks, loadPeople, loadCountdowns, loadHabits, clearTasks, clearPeople, clearCountdowns, clearHabits, loadNotifications, loadTemplates, clearTemplates, loadAppearance]);

  useNotificationScheduler();
  useSyncEngine();

  const authPaths = ["/login", "/register", "/onboarding"];
  const isAuthPath = authPaths.includes(location.pathname);

  // First-run gate: new users must complete onboarding first.
  if (!onboarded && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  // Auth gate: onboarded users must be signed in to reach the shell.
  if (onboarded && !isSignedIn && !isAuthPath) {
    return <Navigate to="/login" replace />;
  }

  return (
    <ErrorBoundary>
    <ToastStack />
    <Suspense fallback={<RouteFallback />}>
    <Routes>
      {/* Stand-alone full-screen pages (own layout, no Shell) */}
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Shell-wrapped pages */}
      <Route element={<Shell />}>
        <Route index element={<Navigate to="/today" replace />} />
        <Route path="/today" element={<TodayPage />} />
        <Route path="/matrix" element={<MatrixPage />} />
        <Route path="/focus" element={<FocusPage />} />
        <Route path="/habits" element={<HabitsPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/countdown" element={<CountdownPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/account/change-password" element={<ChangePasswordPage />} />
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Route>
    </Routes>
    </Suspense>
    </ErrorBoundary>
  );
}
