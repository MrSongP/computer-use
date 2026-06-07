import type { AppDescriptor, AppIdentifier } from "./app.js";
import type { WindowRef } from "./window.js";

export type DiscoveryMethod = "list_windows" | "get_window" | "list_apps" | "launch_app";

export interface ListWindowsParams {}

export interface GetWindowParams {
  id: number;
  app?: AppIdentifier;
}

export interface ListAppsParams {}

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
  | { action: "launchByExecutablePath"; executablePath: string };

export interface DiscoveryRequestMap {
  list_windows: ListWindowsParams;
  get_window: GetWindowParams;
  list_apps: ListAppsParams;
  launch_app: LaunchAppParams;
}

export interface ListAppsResult {
  apps: readonly AppDescriptor[];
}

export type DiscoveryResultMap = {
  list_windows: readonly WindowRef[];
  get_window: WindowRef;
  list_apps: ListAppsResult;
  launch_app: LaunchAppResult;
};
