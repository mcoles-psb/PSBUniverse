"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Container, Spinner } from "react-bootstrap";
import Header from "@/shared/components/layout/Header";
import Sidebar from "@/shared/components/layout/Sidebar";
import { useUserMaster } from "@/modules/user-master/hooks/useUserMaster";

export default function AppLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [logoutBusy, setLogoutBusy] = useState(false);
  const { loading, user, access, isAuthenticated } = useUserMaster();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, loading, router]);

  async function handleLogout() {
    setLogoutBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setLogoutBusy(false);
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

  const showAdmin = Boolean(access?.isDevMain || access?.permissions?.update);

  return (
    <div className="app-shell">
      <Header user={user} onLogout={handleLogout} logoutBusy={logoutBusy} />
      <Container fluid className="app-shell-body px-0">
        <div className="app-shell-grid">
          <Sidebar pathname={pathname} showAdmin={showAdmin} />
          <section className="app-content">{children}</section>
        </div>
      </Container>
    </div>
  );
}
