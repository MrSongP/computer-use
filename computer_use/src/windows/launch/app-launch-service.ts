import type { AppDescriptor, AppIdentifier } from "../../core/contracts/app.js";
import type { LaunchAppMode, LaunchAppParams, ListAppsResult } from "../../core/contracts/discovery.js";
import { enforceLaunchAppPolicy } from "../../core/hooks/launch-app/policy-hook.js";
import type { NativeAppLaunchOptions } from "../bridge/native-bridge.js";

export interface AppLaunchPort {
  listApps(): Promise<readonly AppDescriptor[] | ListAppsResult>;
  launchApp(app: AppIdentifier, options?: NativeAppLaunchOptions): Promise<void>;
}

export interface AppLaunchPlan {
  app: AppIdentifier;
  strategy: "app_user_model_id" | "executable_path";
  launchMode: LaunchAppMode;
  disposition: "delegated_launch";
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
      app: normalized,
      strategy: classifyAppLaunchStrategy(normalized),
      launchMode,
      disposition: "delegated_launch",
      ...(matchedApp ? { matchedAppId: matchedApp.id } : {})
    };
    await this.port.launchApp(normalized, { launchMode });
    return plan;
  }

  private async tryFindMatchingApp(app: AppIdentifier): Promise<AppDescriptor | undefined> {
    try {
      const apps = normalizeAppsPayload(await this.port.listApps());
      return findMatchingApp(app, apps);
    } catch {
      return undefined;
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
