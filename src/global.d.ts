export {};

declare global {
  interface Window {
    ssfDesktop?: {
      getAppVersion: () => Promise<string>;
      openBuildFile: () => Promise<{ name: string; content: string } | null>;
      openPassiveTreeDataFile: () => Promise<{ name: string; content: string } | null>;
      openAtlasTreeFile: () => Promise<{ name: string; content: string } | null>;
      openFilterFile: () => Promise<{ name: string; content: string } | null>;
      fetchBuildUrl: (url: string, contact?: string) => Promise<{ kind: "pobb.in" | "maxroll"; raw: string }>;
      saveExport: (name: string, content: string, format: "json" | "csv" | "markdown") => Promise<{ saved: boolean; path?: string }>;
      openTrustedLink: (url: string) => Promise<boolean>;
    };
  }
}
