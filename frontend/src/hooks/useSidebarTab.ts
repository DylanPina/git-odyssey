import { useState, useCallback, useEffect } from "react";

export type SidebarTab = "search" | "chat" | "summary";

const SIDEBAR_TAB_STORAGE_KEY = "git-odyssey-sidebar-tab";
const DEFAULT_TAB: SidebarTab = "search";

export interface UseSidebarTabReturn {
  selectedTab: SidebarTab;
  setSelectedTab: (tab: SidebarTab) => void;
  clearStoredTab: () => void;
}

export const useSidebarTab = (): UseSidebarTabReturn => {
  // Load the last selected tab from localStorage
  const loadTabFromStorage = useCallback((): SidebarTab => {
    try {
      const stored = localStorage.getItem(SIDEBAR_TAB_STORAGE_KEY);
      if (stored && (stored === "search" || stored === "chat" || stored === "summary")) {
        console.log(`Loaded sidebar tab from localStorage: ${stored}`);
        return stored as SidebarTab;
      }
    } catch (error) {
      console.error("Failed to load sidebar tab from localStorage:", error);
    }
    console.log(`Using default sidebar tab: ${DEFAULT_TAB}`);
    return DEFAULT_TAB;
  }, []);

  // Save the selected tab to localStorage
  const saveTabToStorage = useCallback((tab: SidebarTab) => {
    try {
      localStorage.setItem(SIDEBAR_TAB_STORAGE_KEY, tab);
      console.log(`Saved sidebar tab to localStorage: ${tab}`);
    } catch (error) {
      console.error("Failed to save sidebar tab to localStorage:", error);
    }
  }, []);

  const [selectedTab, setSelectedTabState] = useState<SidebarTab>(DEFAULT_TAB);

  // Load the tab from localStorage on initialization
  useEffect(() => {
    const savedTab = loadTabFromStorage();
    setSelectedTabState(savedTab);
  }, [loadTabFromStorage]);

  // Custom setter that also saves to localStorage
  const setSelectedTab = useCallback(
    (tab: SidebarTab) => {
      setSelectedTabState(tab);
      saveTabToStorage(tab);
    },
    [saveTabToStorage]
  );

  // Function to clear the stored tab (useful for debugging or reset)
  const clearStoredTab = useCallback(() => {
    try {
      localStorage.removeItem(SIDEBAR_TAB_STORAGE_KEY);
      setSelectedTabState(DEFAULT_TAB);
      console.log("Cleared stored sidebar tab, reset to default");
    } catch (error) {
      console.error("Failed to clear stored sidebar tab:", error);
    }
  }, []);

  return {
    selectedTab,
    setSelectedTab,
    clearStoredTab,
  };
};
