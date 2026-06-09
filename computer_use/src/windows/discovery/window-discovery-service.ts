import type { AppDescriptor } from "../../core/contracts/app.js";
import type { GetWindowParams, ListAppsParams, ListAppsResult } from "../../core/contracts/discovery.js";
import type { WindowRef } from "../../core/contracts/window.js";

const TASKBAR_APP_ID = "windows.shell.taskbar";

export interface WindowDiscoveryPort {
  listWindows(): Promise<readonly WindowRef[]>;
  getWindow(params: GetWindowParams): Promise<WindowRef>;
  listApps(): Promise<readonly AppDescriptor[] | ListAppsResult>;
}

export class WindowDiscoveryService {
  constructor(private readonly port: WindowDiscoveryPort) {}

  async listWindows(): Promise<readonly WindowRef[]> {
    const windows = await this.port.listWindows();
    return windows.map(validateWindowRef);
  }

  async getWindow(params: GetWindowParams): Promise<WindowRef> {
    validateGetWindowParams(params);
    return validateWindowRef(await this.port.getWindow(params));
  }

  async listApps(params: ListAppsParams = {}): Promise<ListAppsResult> {
    const apps = normalizeAppsPayload(await this.port.listApps()).map(validateAppDescriptor);
    const filtered = filterApps(apps, params);
    const ranked = rankApps(filtered);
    const limit = params.limit ?? ranked.length;
    const returned = ranked.slice(0, limit);
    return {
      apps: returned,
      diagnostics: {
        totalApps: apps.length,
        filteredApps: filtered.length,
        returnedApps: returned.length,
        truncated: filtered.length > returned.length,
        appliedFilters: buildAppliedFilters(params, limit)
      },
      runtime: buildRuntimeInfo(this.port)
    };
  }
}

function filterApps(
  apps: readonly AppDescriptor[],
  params: ListAppsParams
): readonly AppDescriptor[] {
  return apps.filter((app) => {
    if (params.running_only === true && app.isRunning !== true) {
      return false;
    }
    if (params.has_windows === true && app.windows.length === 0) {
      return false;
    }
    if (params.name_contains && !matchesAny(appNameHaystack(app), params.name_contains)) {
      return false;
    }
    const idNeedle = params.id_contains ?? params.id_includes;
    if (idNeedle && !matchesAny(appIdentityHaystack(app), idNeedle)) {
      return false;
    }
    return true;
  });
}

function rankApps(apps: readonly AppDescriptor[]): readonly AppDescriptor[] {
  return [...apps].sort((left, right) => {
    const rankDelta = appRank(left) - appRank(right);
    if (rankDelta !== 0) {
      return rankDelta;
    }
    return appSortLabel(left).localeCompare(appSortLabel(right), undefined, { sensitivity: "base" });
  });
}

function appRank(app: AppDescriptor): number {
  if (app.windows.length > 0 && app.id !== TASKBAR_APP_ID) {
    return 0;
  }
  if (app.id === TASKBAR_APP_ID) {
    return 1;
  }
  if (app.displayName || app.useCount !== undefined || app.lastUsedDate || app.activationModel === "app_user_model_id") {
    return 2;
  }
  if (app.isRunning) {
    return 3;
  }
  return 4;
}

function appSortLabel(app: AppDescriptor): string {
  return app.displayName ?? app.taskbarLabel ?? app.processNames?.[0] ?? app.id;
}

function matchesAny(values: readonly string[], needle: string): boolean {
  const normalizedNeedle = needle.toLowerCase();
  return values.some((value) => value.toLowerCase().includes(normalizedNeedle));
}

function appNameHaystack(app: AppDescriptor): readonly string[] {
  return [
    ...appIdentityHaystack(app),
    app.displayName,
    app.taskbarLabel,
    ...(app.processNames ?? []),
    ...app.windows.map((window) => window.title)
  ].filter(isNonEmptyString);
}

function appIdentityHaystack(app: AppDescriptor): readonly string[] {
  return [
    app.id,
    app.executablePath,
    ...(app.aliases ?? []),
    ...app.windows.map((window) => window.app)
  ].filter(isNonEmptyString);
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function buildAppliedFilters(
  params: ListAppsParams,
  limit: number
): NonNullable<ListAppsResult["diagnostics"]>["appliedFilters"] {
  return {
    ...(params.name_contains ? { name_contains: params.name_contains } : {}),
    ...(params.id_contains ? { id_contains: params.id_contains } : {}),
    ...(params.id_includes ? { id_includes: params.id_includes } : {}),
    ...(params.running_only !== undefined ? { running_only: params.running_only } : {}),
    ...(params.has_windows !== undefined ? { has_windows: params.has_windows } : {}),
    limit
  };
}

function normalizeAppsPayload(
  payload: readonly AppDescriptor[] | ListAppsResult
): readonly AppDescriptor[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (isListAppsResult(payload)) {
    return payload.apps;
  }

  throw new Error("discovery returned an invalid apps payload");
}

function isListAppsResult(value: unknown): value is ListAppsResult {
  return Boolean(
    value &&
      typeof value === "object" &&
      "apps" in value &&
      Array.isArray((value as { apps?: unknown }).apps)
  );
}

export function validateGetWindowParams(params: GetWindowParams): void {
  if (!Number.isInteger(params?.id) || params.id < 0) {
    throw new Error("get_window requires a non-negative integer id");
  }

  if (params.app !== undefined && (typeof params.app !== "string" || params.app.trim().length === 0)) {
    throw new Error("get_window app must be a non-empty string when provided");
  }
}

export function validateWindowRef(window: WindowRef): WindowRef {
  if (typeof window?.id !== "number" || !Number.isFinite(window.id) || window.id < 0) {
    throw new Error("discovery returned an invalid window id");
  }

  if (typeof window?.app !== "string" || window.app.trim().length === 0) {
    throw new Error("discovery returned an invalid window app identifier");
  }

  if (window.title !== undefined && typeof window.title !== "string") {
    throw new Error("discovery returned an invalid window title");
  }

  return {
    id: window.id,
    app: window.app,
    ...(window.title ? { title: window.title } : {})
  };
}

export function validateAppDescriptor(app: AppDescriptor): AppDescriptor {
  if (typeof app?.id !== "string" || app.id.trim().length === 0) {
    throw new Error("discovery returned an invalid app identifier");
  }

  if (!Array.isArray(app.windows)) {
    throw new Error("discovery returned an invalid app window list");
  }

  return {
    id: app.id,
    ...(app.displayName ? { displayName: app.displayName } : {}),
    ...(app.executablePath ? { executablePath: app.executablePath } : {}),
    ...preserveStringList("aliases", app.aliases),
    ...preserveStringList("processNames", app.processNames),
    ...preserveNumberList("processIds", app.processIds),
    ...(app.taskbarLabel ? { taskbarLabel: app.taskbarLabel } : {}),
    ...(typeof app.isRunning === "boolean" ? { isRunning: app.isRunning } : {}),
    ...(app.lastUsedDate ? { lastUsedDate: app.lastUsedDate } : {}),
    ...(typeof app.useCount === "number" ? { useCount: app.useCount } : {}),
    ...(app.activationModel ? { activationModel: app.activationModel } : {}),
    windows: app.windows.map(validateWindowRef)
  };
}

function preserveStringList(
  key: "aliases" | "processNames",
  value: readonly string[] | undefined
): Pick<AppDescriptor, "aliases" | "processNames"> | {} {
  if (!Array.isArray(value)) {
    return {};
  }

  const normalized = value
    .map((entry) => typeof entry === "string" ? entry.trim() : "")
    .filter((entry) => entry.length > 0);
  if (normalized.length === 0) {
    return {};
  }

  return key === "aliases"
    ? { aliases: normalized }
    : { processNames: normalized };
}

function preserveNumberList(
  key: "processIds",
  value: readonly number[] | undefined
): Pick<AppDescriptor, "processIds"> | {} {
  if (!Array.isArray(value)) {
    return {};
  }

  const normalized = value.filter((entry) => Number.isInteger(entry) && entry > 0);
  return normalized.length > 0 ? { [key]: normalized } : {};
}

function buildRuntimeInfo(port: WindowDiscoveryPort): NonNullable<ListAppsResult["runtime"]> {
  const runtime = port as {
    driverName?: unknown;
    capabilities?: unknown;
  };
  const capabilities = runtime.capabilities && typeof runtime.capabilities === "object" && !Array.isArray(runtime.capabilities)
    ? runtime.capabilities as Record<string, unknown>
    : undefined;

  return {
    schemaVersion: "computer-use/list-apps/v1",
    ...(typeof runtime.driverName === "string" ? { driverName: runtime.driverName } : {}),
    ...(capabilities ? { capabilities } : {})
  };
}
