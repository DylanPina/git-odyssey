import {
  createContext,
  useContext,
  type Dispatch,
  type SetStateAction,
} from "react";

export type DesktopTitleBarAction = {
  id: "collapse-all-files";
  label: string;
  disabled?: boolean;
  onClick: () => void;
};

export const DesktopTitleBarActionsContext = createContext<
  Dispatch<SetStateAction<DesktopTitleBarAction[]>> | null
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
