import type { AppIdentifier } from "../../core/contracts/app.js";

export interface AppLaunchPort {
  launchApp(app: AppIdentifier): Promise<void>;
}

export interface AppLaunchPlan {
  app: AppIdentifier;
  strategy: "app_user_model_id" | "executable_path";
}

export class AppLaunchService {
  constructor(private readonly port: AppLaunchPort) {}

  async launch(app: AppIdentifier): Promise<AppLaunchPlan> {
    const normalized = validateLaunchAppIdentifier(app);
    const plan: AppLaunchPlan = {
      app: normalized,
      strategy: classifyAppLaunchStrategy(normalized)
    };
    await this.port.launchApp(normalized);
    return plan;
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
