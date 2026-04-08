"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "react-bootstrap";
import Form from "react-bootstrap/Form";

function getTimeGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function normalizePath(value) {
  return String(value || "/").toLowerCase();
}

function isMyPsbPath(pathname) {
  const path = normalizePath(pathname);
  return path === "/profile" || path.startsWith("/profile/") || path === "/company";
}

function isConfigurationPath(pathname) {
  const path = normalizePath(pathname);
  return path.startsWith("/setup");
}

function isMyAppsPath(pathname, showConfiguration) {
  if (isMyPsbPath(pathname)) {
    return false;
  }

  if (!showConfiguration && isConfigurationPath(pathname)) {
    return true;
  }

  if (isConfigurationPath(pathname)) {
    return false;
  }

  const path = normalizePath(pathname);
  return (
    path === "/dashboard" ||
    path.startsWith("/dashboard/") ||
    path === "/gutter" ||
    path.startsWith("/gutter/") ||
    path === "/ohd" ||
    path.startsWith("/ohd/") ||
    path === "/travel" ||
    path.startsWith("/travel/")
  );
}

export default function Header({
  user,
  pathname = "/",
  onLogout,
  logoutBusy = false,
  showConfiguration = false,
  onNavigateStart,
  loaderProgress = 0,
  loaderVisible = false,
}) {
  const router = useRouter();
  const [greeting, setGreeting] = useState(() => getTimeGreeting());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setGreeting(getTimeGreeting());
    }, 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  const displayName = useMemo(() => {
    const firstName = String(user?.first_name || "").trim();
    if (firstName) return firstName;
    return user?.username || user?.email || "User";
  }, [user]);

  const tabs = [
    {
      key: "my-psb",
      label: "My PSB",
      href: "/profile",
      active: isMyPsbPath(pathname),
    },
    {
      key: "my-apps",
      label: "My Apps",
      href: "/dashboard",
      active: isMyAppsPath(pathname, showConfiguration),
    },
    ...(showConfiguration
      ? [
          {
            key: "configuration-settings",
            label: "Configuration & Settings",
            href: "/setup/admin",
            active: isConfigurationPath(pathname),
          },
        ]
      : []),
  ];

  const activeTab = tabs.find((tab) => tab.active) || tabs[0];

  return (
    <header className="app-header d-flex align-items-center justify-content-between gap-2">
      <div className="d-flex align-items-center gap-3 flex-wrap app-header-left">
        <div>
          <h1 className="app-header-title mb-0">PSBUniverse</h1>
          <p className="app-header-subtitle mb-0">Operations Workspace</p>
        </div>
        <nav className="app-header-tabs d-none d-md-flex" aria-label="Primary tabs">
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              className={`app-header-tab ${tab.active ? "active" : ""}`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        <div className="app-header-mobile-nav d-md-none">
          <Form.Select
            size="sm"
            aria-label="Primary navigation"
            value={activeTab.href}
            onChange={(event) => {
              onNavigateStart?.();
              router.push(event.target.value);
            }}
          >
            {tabs.map((tab) => (
              <option key={tab.key} value={tab.href}>
                {tab.label}
              </option>
            ))}
          </Form.Select>
        </div>
      </div>
      <div className="d-flex align-items-center gap-2 app-header-right">
        <p className="app-header-user mb-0">{`${greeting}, ${displayName}`}</p>
        <Button variant="outline-primary" size="sm" onClick={onLogout} disabled={logoutBusy}>
          {logoutBusy ? "Signing out..." : "Logout"}
        </Button>
      </div>
      <div className="app-header-progress-shell" aria-hidden="true">
        <div
          className="app-header-progress-bar"
          style={{
            transform: `scaleX(${loaderProgress})`,
            opacity: loaderVisible ? 1 : 0,
          }}
        />
      </div>
    </header>
  );
}
