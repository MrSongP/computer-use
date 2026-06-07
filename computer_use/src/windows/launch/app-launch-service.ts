import type { AppDescriptor, AppIdentifier } from "../../core/contracts/app.js";
import type { WindowRef } from "../../core/contracts/window.js";
import type {
  LaunchAppMode,
  LaunchAppParams,
  LaunchAppResult,
  ListAppsResult
} from "../../core/contracts/discovery.js";
import { enforceLaunchAppPolicy } from "../../core/hooks/launch-app/policy-hook.js";
import type { NativeAppLaunchOptions } from "../bridge/native-bridge.js";

export interface AppLaunchPort {
  listApps(): Promise<readonly AppDescriptor[] | ListAppsResult>;
  launchApp(app: AppIdentifier, options?: NativeAppLaunchOptions): Promise<void>;
}

export interface AppLaunchPlan extends LaunchAppResult {
  app: AppIdentifier;
  strategy: "app_user_model_id" | "executable_path";
  launchMode: LaunchAppMode;
  disposition: "delegated_launch" | "observed_window";
  message: string;
  matchedAppId?: AppIdentifier;
}

export class AppLaunchService {
  constructor(private readonly port: AppLaunchPort) {}

  async launch(params: LaunchAppParams): Promise<AppLaunchPlan> {
    const normalized = validateLaunchAppIdentifier(params.app);
    const launchMode = normalizeLaunchAppMode(params.launch_mode);
    const matchedApp = launchMode === "force_new"
      ? undefined
      : await this.tryFindMatchingApp(normalized);
    enforceLaunchAppPolicy({
      app: normalized,
      launchMode,
      matchedApp
    });

    const plan: AppLaunchPlan = {
      ok: true,
      app: normalized,
      strategy: classifyAppLaunchStrategy(normalized),
      launchMode,
      disposition: "delegated_launch",
      message: "launch_app delegated the launch request to the Windows native bridge.",
      ...(matchedApp ? { matchedAppId: matchedApp.id } : {}),
      ...(matchedApp?.executablePath ? { resolvedExecutablePath: matchedApp.executablePath } : {})
    };
    await this.port.launchApp(normalized, { launchMode });
    const observed = await this.observeWindows(normalized, matchedApp, params.observe_timeout_ms ?? 600);
    const observedWindows = observed.windows;
    const resolvedExecutablePath = matchedApp?.executablePath ?? observed.app?.executablePath;
    return {
      ...plan,
      ...(resolvedExecutablePath ? { resolvedExecutablePath } : {}),
      disposition: observedWindows.length > 0 ? "observed_window" : "delegated_launch",
      observedWindows,
      followUpActions: buildLaunchFollowUpActions(matchedApp ?? observed.app),
      message: observedWindows.length > 0
        ? "launch_app delegated the launch request and observed at least one matching window."
        : plan.message
    };
  }

  private async tryFindMatchingApp(app: AppIdentifier): Promise<AppDescriptor | undefined> {
    try {
      const apps = normalizeAppsPayload(await this.port.listApps());
      return findMatchingApp(app, apps);
    } catch {
      return undefined;
    }
  }

  private async observeWindows(
    app: AppIdentifier,
    matchedApp: AppDescriptor | undefined,
    timeoutMs: number
  ): Promise<{ app?: AppDescriptor; windows: readonly WindowRef[] }> {
    const deadline = Date.now() + timeoutMs;
    do {
      const apps = await this.tryListApps();
      const match = findMatchingApp(app, apps) ?? (matchedApp ? findMatchingApp(matchedApp.id, apps) : undefined);
      const windows = normalizeObservedWindows(match);
      if (windows.length > 0 || timeoutMs === 0) {
        return { app: match, windows };
      }
      await sleep(100);
    } while (Date.now() < deadline);

    return { app: undefined, windows: [] };
  }

  private async tryListApps(): Promise<readonly AppDescriptor[]> {
    try {
      return normalizeAppsPayload(await this.port.listApps());
    } catch {
      return [];
    }
  }
}

export function validateLaunchAppIdentifier(app: AppIdentifier): AppIdentifier {
  if (typeof app !== "string" || app.trim().length === 0) {
    throw new Error("launch_app requires a non-empty app identifier");
  }

  const normalized = app.trim();
  if (normalized.toLowerCase().startsWith("pid:")) {
    throw new Error("launch_app does not support pid app identifiers");
  }

  return normalized;
}

export function classifyAppLaunchStrategy(
  app: AppIdentifier
): "app_user_model_id" | "executable_path" {
  return /\.exe$/i.test(app) || /^[a-z]:\\/i.test(app) || /^\\\\/i.test(app)
    ? "executable_path"
    : "app_user_model_id";
}

export function normalizeLaunchAppMode(mode: LaunchAppParams["launch_mode"]): LaunchAppMode {
  return mode === "force_new" ? "force_new" : "reuse_or_launch";
}

function normalizeAppsPayload(
  payload: readonly AppDescriptor[] | ListAppsResult
): readonly AppDescriptor[] {
  return isListAppsResult(payload) ? payload.apps : payload;
}

function isListAppsResult(value: readonly AppDescriptor[] | ListAppsResult): value is ListAppsResult {
  return !Array.isArray(value);
}

function findMatchingApp(
  app: AppIdentifier,
  apps: readonly AppDescriptor[]
): AppDescriptor | undefined {
  const normalizedTarget = normalizeForCompare(app);
  return apps.find((candidate) => {
    const id = normalizeForCompare(candidate.id);
    const executablePath = normalizeForCompare(candidate.executablePath);
    return id === normalizedTarget || executablePath === normalizedTarget;
  });
}

function normalizeForCompare(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeObservedWindows(app: AppDescriptor | undefined): readonly WindowRef[] {
  return (app?.windows ?? []).map((window) => ({
    ...window,
    app: window.app ?? app!.id
  }));
}

function buildLaunchFollowUpActions(matchedApp: AppDescriptor | undefined): LaunchAppResult["followUpActions"] {
  const actions: Array<NonNullable<LaunchAppResult["followUpActions"]>[number]> = [
    { action: "list_windows" },
    { action: "pollListWindows", timeoutMs: 1500, intervalMs: 100 },
    { action: "pollListApps", timeoutMs: 1500, intervalMs: 100 }
  ];
  if (matchedApp?.executablePath) {
    actions.push({ action: "launchByExecutablePath", executablePath: matchedApp.executablePath });
  }
  return actions;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
