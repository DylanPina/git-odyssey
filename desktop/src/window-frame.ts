import type { BrowserWindowConstructorOptions } from "electron";

export const DESKTOP_TITLE_BAR_HEIGHT = 56;
export const DESKTOP_WINDOW_BACKGROUND = "#0d0f10";
export const DESKTOP_TITLE_BAR_OVERLAY = {
  color: "#111418",
  symbolColor: "#d9e2f2",
  height: DESKTOP_TITLE_BAR_HEIGHT,
} as const;
export const MACOS_TRAFFIC_LIGHT_POSITION = { x: 18, y: 18 } as const;

export function buildMainWindowOptions(
  preloadPath: string,
  platform: NodeJS.Platform = process.platform
): BrowserWindowConstructorOptions {
  const isMac = platform === "darwin";

  return {
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: DESKTOP_WINDOW_BACKGROUND,
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    ...(isMac
      ? {
          trafficLightPosition: MACOS_TRAFFIC_LIGHT_POSITION,
        }
      : {
          titleBarOverlay: DESKTOP_TITLE_BAR_OVERLAY,
        }),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  };
}
