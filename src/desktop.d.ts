export {};

declare global {
  interface Window {
    piSwitchDesktop?: {
      isDesktop: boolean;
      minimize: () => Promise<void>;
      maximize: () => Promise<boolean>;
      close: () => Promise<void>;
      isMaximized: () => Promise<boolean>;
      getVersion: () => Promise<string>;
      platform: () => Promise<string> | string;
      onWindowState: (cb: (s: { maximized: boolean; fullscreen: boolean }) => void) => () => void;
      setAutoLaunch?: (enable: boolean) => Promise<{ openAtLogin: boolean; openAsHidden?: boolean }>;
      getAutoLaunch?: () => Promise<{ openAtLogin: boolean; openAsHidden?: boolean }>;
      openPath?: (p: string) => Promise<string>;
      showItemInFolder?: (p: string) => Promise<void>;
      openExternal?: (url: string) => Promise<void>;
      relaunch?: () => Promise<void>;
      hide?: () => Promise<void>;
      quit?: () => Promise<void>;
      onNavigate?: (
        cb: (payload: {
          tab?: string;
          manageSection?: string;
          settingsLeaf?: string;
        }) => void,
      ) => () => void;
    };
  }
}
