"use client";

import { Button } from "react-bootstrap";

export default function Header({ user, onLogout, logoutBusy = false }) {
  return (
    <header className="app-header d-flex align-items-center justify-content-between gap-3">
      <div>
        <p className="app-header-kicker mb-0">PSBUniverse</p>
        <h1 className="app-header-title mb-0">Operations Workspace</h1>
      </div>
      <div className="d-flex align-items-center gap-3">
        <p className="app-header-user mb-0">
          {user?.username || user?.email || "Unknown User"}
        </p>
        <Button variant="outline-primary" size="sm" onClick={onLogout} disabled={logoutBusy}>
          {logoutBusy ? "Signing out..." : "Logout"}
        </Button>
      </div>
    </header>
  );
}
