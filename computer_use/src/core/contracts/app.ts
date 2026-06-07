export type AppIdentifier = string;

export interface AppDescriptor {
  id: AppIdentifier;
  displayName?: string;
  executablePath?: string;
  aliases?: readonly AppIdentifier[];
  processNames?: readonly string[];
  processIds?: readonly number[];
  taskbarLabel?: string;
  isRunning?: boolean;
  lastUsedDate?: string;
  useCount?: number;
  activationModel?: "app_user_model_id" | "executable_path";
  windows: readonly {
    id: number;
    app: AppIdentifier;
    title?: string;
  }[];
}
