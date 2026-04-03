"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button, Container } from "react-bootstrap";
import { AUTH_CHANGE_EVENT, clearStoredUser, getStoredUser } from "@/lib/localAuth";

const PUBLIC_ROUTES = new Set(["/login"]);

export default function AuthShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(() => getStoredUser());

  useEffect(() => {
    function syncUser() {
      setCurrentUser(getStoredUser());
    }

    window.addEventListener("storage", syncUser);
    window.addEventListener(AUTH_CHANGE_EVENT, syncUser);

    return () => {
      window.removeEventListener("storage", syncUser);
      window.removeEventListener(AUTH_CHANGE_EVENT, syncUser);
    };
  }, []);

  useEffect(() => {
    const isPublicRoute = PUBLIC_ROUTES.has(pathname);

    if (!currentUser && !isPublicRoute) {
      router.replace("/login");
      return;
    }

    if (currentUser && pathname.startsWith("/settings") && !currentUser.isDevMain) {
      router.replace("/profile");
      return;
    }

    if (currentUser && pathname === "/login") {
      router.replace("/profile");
    }
  }, [currentUser, pathname, router]);

  function handleLogout() {
    clearStoredUser();
    setCurrentUser(null);
    router.replace("/login");
  }

  const showAppHeader = currentUser && pathname !== "/login";
  const isMyPsbActive = pathname === "/profile";
  const isSettingsActive = pathname.startsWith("/settings");
  const isMyAppsActive = !isMyPsbActive && !isSettingsActive;

  return (
    <>
      {showAppHeader ? (
        <div className="app-topbar">
          <Container className="py-2 d-flex flex-wrap align-items-center justify-content-between gap-2">
            <div className="d-flex flex-column gap-1">
              <p className="app-topbar-label mb-0">PSBUniverse</p>
              <div className="app-topbar-nav" role="navigation" aria-label="Primary">
                <Link
                  href="/profile"
                  className={`app-topbar-link ${isMyPsbActive ? "active" : ""}`}
                >
                  My PSB
                </Link>
                <Link href="/" className={`app-topbar-link ${isMyAppsActive ? "active" : ""}`}>
                  My Apps
                </Link>
                {currentUser.isDevMain ? (
                  <Link
                    href="/settings"
                    className={`app-topbar-link ${isSettingsActive ? "active" : ""}`}
                  >
                    Settings &amp; Configuration
                  </Link>
                ) : null}
              </div>
            </div>
            <div className="d-flex align-items-center gap-3">
              <p className="app-topbar-user mb-0">
                Signed in as <strong>{currentUser.username || currentUser.email || "Unknown user"}</strong>
              </p>
              <Button variant="outline-primary" size="sm" onClick={handleLogout}>
                Logout
              </Button>
            </div>
          </Container>
        </div>
      ) : null}

      {children}
    </>
  );
}
