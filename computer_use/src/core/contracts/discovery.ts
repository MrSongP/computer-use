import type { AppDescriptor, AppIdentifier } from "./app.js";
import type { WindowRef } from "./window.js";

export type DiscoveryMethod = "list_windows" | "get_window" | "list_apps" | "launch_app";

export interface ListWindowsParams {}

export interface GetWindowParams {
  id: number;
  app?: AppIdentifier;
}

export interface ListAppsParams {
  /**
   * Case-insensitive substring matched against displayName, id, executable path,
   * aliases, process names, taskbar label, and attached window titles.
   */
  name_contains?: string;
  /** Case-insensitive substring matched against app ids, executable paths, aliases, and window app ids. */
  id_contains?: string;
  /** Alias for id_contains, kept for report terminology and caller convenience. */
  id_includes?: string;
  /** Only include apps that the runtime currently observes as running. */
  running_only?: boolean;
  /** Only include apps with at least one targetable window. */
  has_windows?: boolean;
  /** Maximum number of apps returned to the model. Defaults to a bounded model-friendly page. */
  limit?: number;
}

export type LaunchAppMode = "reuse_or_launch" | "force_new";

export interface LaunchAppParams {
  app: AppIdentifier;
  launch_mode?: LaunchAppMode;
  observe_timeout_ms?: number;
}

export interface LaunchAppResult {
  ok: true;
  app: AppIdentifier;
  strategy: "app_user_model_id" | "executable_path";
  launchMode: LaunchAppMode;
  disposition: "delegated_launch" | "observed_window";
  message: string;
  matchedAppId?: AppIdentifier;
  resolvedExecutablePath?: string;
  observedWindows?: readonly WindowRef[];
  followUpActions?: readonly LaunchFollowUpAction[];
}

export type LaunchFollowUpAction =
  | { action: "list_windows" }
  | { action: "pollListWindows"; timeoutMs: number; intervalMs: number }
  | { action: "pollListApps"; timeoutMs: number; intervalMs: number }
  | {
      action: "restoreFromTaskbar";
      taskbarAppId: string;
      taskbarLabel?: string;
      app?: AppIdentifier;
      executablePath?: string;
    }
  | { action: "launchByExecutablePath"; executablePath: string };

export interface DiscoveryRequestMap {
  list_windows: ListWindowsParams;
  get_window: GetWindowParams;
  list_apps: ListAppsParams;
  launch_app: LaunchAppParams;
}

export interface ListAppsResult {
  apps: readonly AppDescriptor[];
  diagnostics?: {
    totalApps: number;
    filteredApps: number;
    returnedApps: number;
    truncated: boolean;
    appliedFilters?: {
      name_contains?: string;
      id_contains?: string;
      id_includes?: string;
      running_only?: boolean;
      has_windows?: boolean;
      limit: number;
    };
  };
  runtime?: {
    schemaVersion: "computer-use/list-apps/v1";
    driverName?: string;
    capabilities?: Record<string, unknown>;
  };
}

export type DiscoveryResultMap = {
  list_windows: readonly WindowRef[];
  get_window: WindowRef;
  list_apps: ListAppsResult;
  launch_app: LaunchAppResult;
};
