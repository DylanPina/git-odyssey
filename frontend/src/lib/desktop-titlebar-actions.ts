import {
  createContext,
  useContext,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";

export type DesktopTitleBarAction = {
  id: "collapse-all-files";
  label: string;
  disabled?: boolean;
  onClick: () => void;
};

export type DesktopTitleBarChrome = {
  leading?: ReactNode;
  center?: ReactNode;
  trailing?: ReactNode;
};

export const DesktopTitleBarActionsContext = createContext<
  Dispatch<SetStateAction<DesktopTitleBarAction[]>> | null
>(null);

export const DesktopTitleBarChromeContext = createContext<
  Dispatch<SetStateAction<DesktopTitleBarChrome | null>> | null
>(null);

export function useDesktopTitleBarActions() {
  const context = useContext(DesktopTitleBarActionsContext);
  if (!context) {
    throw new Error(
      "useDesktopTitleBarActions must be used within the desktop title bar provider."
    );
  }

  return context;
}

export function useDesktopTitleBarChrome() {
  const context = useContext(DesktopTitleBarChromeContext);
  if (!context) {
    throw new Error(
      "useDesktopTitleBarChrome must be used within the desktop title bar provider."
    );
  }

  return context;
}
