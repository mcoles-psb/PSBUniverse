"use client";

import Link from "next/link";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/gutter", label: "Gutter" },
  { href: "/setup/global", label: "Global Setup" },
  { href: "/setup/gutter", label: "Gutter Setup" },
  { href: "/profile", label: "Profile" },
  { href: "/company", label: "Company" },
  { href: "/travel", label: "Travel" },
  { href: "/ohd", label: "OHD" },
];

export default function Sidebar({ pathname = "/", showAdmin = false }) {
  const items = showAdmin
    ? [...navItems, { href: "/setup/admin", label: "Admin" }]
    : navItems;

  return (
    <aside className="app-sidebar">
      <p className="app-sidebar-title mb-3">Modules</p>
      <nav className="d-flex flex-column gap-1" aria-label="Main Navigation">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`app-sidebar-link ${active ? "active" : ""}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
