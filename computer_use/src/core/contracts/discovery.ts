import type { AppDescriptor, AppIdentifier } from "./app.js";
import type { WindowRef } from "./window.js";

export type DiscoveryMethod = "list_windows" | "get_window" | "list_apps" | "launch_app";

export interface ListWindowsParams {}

export interface GetWindowParams {
  id: number;
  app?: AppIdentifier;
}

export interface ListAppsParams {}

export interface LaunchAppParams {
  app: AppIdentifier;
}

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
  launch_app: null;
};
