"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Container, Spinner } from "react-bootstrap";
import Header from "@/shared/components/layout/Header";
import { useUserMaster } from "@/modules/user-master/hooks/useUserMaster";
import {
  NAVBAR_LOADER_FINISH_EVENT,
  NAVBAR_LOADER_START_EVENT,
} from "@/shared/utils/navbar-loader";

const SHOW_DELAY_MS = 140;
const PROGRESS_TICK_MS = 200;
const COMPLETE_FADE_MS = 320;
const RESET_MS = 220;
const START_PROGRESS = 0.26;
const MAX_IN_FLIGHT_PROGRESS = 0.9;

function isTrackableApiRequest(input) {
  if (typeof window === "undefined") return false;

  const requestUrl =
    typeof input === "string"
      ? input
      : input instanceof Request
        ? input.url
        : typeof input?.url === "string"
          ? input.url
          : null;

  if (!requestUrl) return false;

  try {
    const parsed = new URL(requestUrl, window.location.origin);
    return parsed.origin === window.location.origin && parsed.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

function shouldStartRouteLoader(event) {
  if (event.defaultPrevented) return false;
  if (event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;

  const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!anchor) return false;

  if (anchor.hasAttribute("download")) return false;
  if (anchor.target && anchor.target !== "_self") return false;

  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return false;
  }

  try {
    const current = new URL(window.location.href);
    const next = new URL(anchor.href, window.location.href);

    if (next.origin !== current.origin) return false;

    return next.pathname !== current.pathname || next.search !== current.search;
  } catch {
    return false;
  }
}

export default function AppLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressVisible, setProgressVisible] = useState(false);
  const { loading, user, access, isAuthenticated } = useUserMaster();

  const routeSignature = useMemo(() => pathname, [pathname]);

  const activeLoadCountRef = useRef(0);
  const hasMountedRouteRef = useRef(false);
  const progressRef = useRef(0);
  const progressIntervalRef = useRef(null);
  const showDelayTimerRef = useRef(null);
  const completionTimerRef = useRef(null);
  const resetTimerRef = useRef(null);

  const clearProgressTimers = useCallback(() => {
    if (progressIntervalRef.current) {
      window.clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }

    if (showDelayTimerRef.current) {
      window.clearTimeout(showDelayTimerRef.current);
      showDelayTimerRef.current = null;
    }

    if (completionTimerRef.current) {
      window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }

    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  }, []);

  const beginProgress = useCallback(() => {
    if (typeof window === "undefined") return;

    if (completionTimerRef.current) {
      window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }

    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }

    progressRef.current = START_PROGRESS;
    setProgress(START_PROGRESS);

    if (!showDelayTimerRef.current) {
      showDelayTimerRef.current = window.setTimeout(() => {
        setProgressVisible(true);
        showDelayTimerRef.current = null;
      }, SHOW_DELAY_MS);
    }

    if (!progressIntervalRef.current) {
      progressIntervalRef.current = window.setInterval(() => {
        const nextProgress = Math.min(
          MAX_IN_FLIGHT_PROGRESS,
          progressRef.current + (1 - progressRef.current) * 0.05
        );

        progressRef.current = nextProgress;
        setProgress(nextProgress);

        if (nextProgress >= MAX_IN_FLIGHT_PROGRESS) {
          window.clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
      }, PROGRESS_TICK_MS);
    }
  }, []);

  const completeProgress = useCallback(() => {
    if (typeof window === "undefined") return;

    if (progressIntervalRef.current) {
      window.clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }

    // Fast requests finish before visibility delay to avoid UI flicker.
    if (showDelayTimerRef.current) {
      window.clearTimeout(showDelayTimerRef.current);
      showDelayTimerRef.current = null;
      progressRef.current = 0;
      setProgress(0);
      setProgressVisible(false);
      return;
    }

    progressRef.current = 1;
    setProgress(1);
    setProgressVisible(true);

    completionTimerRef.current = window.setTimeout(() => {
      setProgressVisible(false);
      completionTimerRef.current = null;

      resetTimerRef.current = window.setTimeout(() => {
        progressRef.current = 0;
        setProgress(0);
        resetTimerRef.current = null;
      }, RESET_MS);
    }, COMPLETE_FADE_MS);
  }, []);

  const startLoader = useCallback(() => {
    activeLoadCountRef.current += 1;

    if (activeLoadCountRef.current === 1) {
      beginProgress();
    }
  }, [beginProgress]);

  const finishLoader = useCallback(() => {
    if (activeLoadCountRef.current <= 0) {
      activeLoadCountRef.current = 0;
      return;
    }

    activeLoadCountRef.current -= 1;

    if (activeLoadCountRef.current === 0) {
      completeProgress();
    }
  }, [completeProgress]);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      startLoader();
      router.replace("/login");
    }
  }, [isAuthenticated, loading, router, startLoader]);

  useEffect(() => {
    if (!hasMountedRouteRef.current) {
      hasMountedRouteRef.current = true;
      return;
    }

    finishLoader();
  }, [finishLoader, routeSignature]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const originalFetch = window.fetch.bind(window);

    window.fetch = async (...args) => {
      const track = isTrackableApiRequest(args[0]);

      if (track) {
        startLoader();
      }

      try {
        return await originalFetch(...args);
      } finally {
        if (track) {
          finishLoader();
        }
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [finishLoader, startLoader]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const onDocumentClick = (event) => {
      if (shouldStartRouteLoader(event)) {
        startLoader();
      }
    };

    const onPopState = () => {
      startLoader();
    };

    const onExternalLoaderStart = () => {
      startLoader();
    };

    const onExternalLoaderFinish = () => {
      finishLoader();
    };

    window.addEventListener("click", onDocumentClick, true);
    window.addEventListener("popstate", onPopState);
    window.addEventListener(NAVBAR_LOADER_START_EVENT, onExternalLoaderStart);
    window.addEventListener(NAVBAR_LOADER_FINISH_EVENT, onExternalLoaderFinish);

    return () => {
      window.removeEventListener("click", onDocumentClick, true);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener(NAVBAR_LOADER_START_EVENT, onExternalLoaderStart);
      window.removeEventListener(NAVBAR_LOADER_FINISH_EVENT, onExternalLoaderFinish);
    };
  }, [finishLoader, startLoader]);

  useEffect(() => {
    return () => {
      clearProgressTimers();
    };
  }, [clearProgressTimers]);

  async function handleLogout() {
    setLogoutBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setLogoutBusy(false);
      startLoader();
      router.replace("/login");
    }
  }

  if (loading) {
    return (
      <main className="auth-loading">
        <Spinner animation="border" role="status" />
      </main>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const roleKeys = Array.isArray(access?.roleKeys)
    ? access.roleKeys.map((value) => String(value || "").toLowerCase())
    : [];
  const normalizedUserRole = String(user?.role || user?.role_name || "").toLowerCase();
  const showConfiguration =
    Boolean(access?.isDevMain) ||
    roleKeys.includes("devmain") ||
    roleKeys.includes("admin") ||
    normalizedUserRole === "devmain" ||
    normalizedUserRole === "admin";

  return (
    <div className="app-shell">
      <Header
        pathname={pathname}
        user={user}
        onLogout={handleLogout}
        logoutBusy={logoutBusy}
        showConfiguration={showConfiguration}
        onNavigateStart={startLoader}
        loaderProgress={progress}
        loaderVisible={progressVisible}
      />
      <Container fluid className="app-shell-body">
        <section className="app-content">{children}</section>
      </Container>
    </div>
  );
}
