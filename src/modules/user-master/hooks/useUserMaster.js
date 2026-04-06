"use client";

import { useCallback, useEffect, useState } from "react";

export function useUserMaster() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [access, setAccess] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/user-master/session", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        setSession(null);
        setUser(null);
        setAccess(null);
        return;
      }

      const payload = await response.json();
      setSession(payload?.session || null);
      setUser(payload?.user || null);
      setAccess(payload?.access || null);
    } catch {
      setSession(null);
      setUser(null);
      setAccess(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    loading,
    session,
    user,
    access,
    refresh,
    isAuthenticated: Boolean(session?.userId),
  };
}
