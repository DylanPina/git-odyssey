import { useCallback, useEffect, useState } from "react";

import {
  getCurrentUser,
  getDesktopHealth,
  getDesktopSettingsStatus,
} from "../api/api";
import type { User } from "@/lib/definitions/auth";
import type {
  DesktopHealthStatus,
  DesktopSettingsStatus,
} from "@/lib/definitions/desktop";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAiReady, setIsAiReady] = useState(false);
  const [desktopSettingsStatus, setDesktopSettingsStatus] =
    useState<DesktopSettingsStatus | null>(null);
  const [desktopHealth, setDesktopHealth] =
    useState<DesktopHealthStatus | null>(null);

  const checkAuth = useCallback(async (options: { background?: boolean } = {}) => {
    if (!options.background) {
      setIsLoading(true);
    }

    try {
      const [settingsStatus, healthStatus] = await Promise.all([
        getDesktopSettingsStatus(),
        getDesktopHealth(),
      ]);

      setDesktopSettingsStatus(settingsStatus);
      setDesktopHealth(healthStatus);
      setIsAiReady(Boolean(healthStatus.ai?.textGeneration?.ready));

      const userData = await getCurrentUser();
      setUser(userData);
      setIsAuthenticated(true);
    } catch (error) {
      console.error("Auth check failed:", error);
      setUser(null);
      setIsAuthenticated(false);
      setIsAiReady(false);
    } finally {
      if (!options.background) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (isAuthenticated && isAiReady) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void checkAuth({ background: true });
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [checkAuth, isAiReady, isAuthenticated]);

  return {
    user,
    isAuthenticated,
    isAiReady,
    isLoading,
    desktopSettingsStatus,
    desktopHealth,
    checkAuth,
  };
}
