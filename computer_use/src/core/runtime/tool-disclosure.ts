import type { CapabilityMethod } from "../contracts/capability.js";

export type ToolDisclosureLane = "discovery" | "action" | "dialog" | "lifecycle";
export type ToolDisclosurePhase = ToolDisclosureLane;

export interface ToolDisclosure {
  lane: ToolDisclosureLane;
  phase: ToolDisclosurePhase;
  order: number;
  title: string;
  availableAfter: string;
  guidance: string;
  readOnly: boolean;
  destructive: boolean;
  idempotent: boolean;
  openWorld: boolean;
}

export type ToolAnnotations = {
  title: string;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
};

export type ComputerUseToolMethod = CapabilityMethod | "end_turn";

const disclosureByMethod = {
  list_apps: {
    lane: "discovery",
    phase: "discovery",
    order: 10,
    title: "List Windows Apps",
    availableAfter: "Use first to find the target app and any existing windows.",
    guidance: "Start here for app identity, launch candidates, running state, and visible windows.",
    readOnly: true,
    destructive: false,
    idempotent: true,
    openWorld: false
  },
  list_windows: {
    lane: "discovery",
    phase: "discovery",
    order: 20,
    title: "List Open Windows",
    availableAfter: "Use during discovery or recovery when the task is about current windows.",
    guidance: "Use as a flat open-window shortcut after the target is already likely running.",
    readOnly: true,
    destructive: false,
    idempotent: true,
    openWorld: false
  },
  get_window: {
    lane: "discovery",
    phase: "discovery",
    order: 30,
    title: "Refresh Window Reference",
    availableAfter: "Use after list_apps, list_windows, or a stale window error returns a window id.",
    guidance: "Rehydrate a canonical window object before state observation or action.",
    readOnly: true,
    destructive: false,
    idempotent: true,
    openWorld: false
  },
  launch_app: {
    lane: "discovery",
    phase: "discovery",
    order: 40,
    title: "Launch Or Reuse App",
    availableAfter: "Use only after discovery shows the target app has no suitable window.",
    guidance: "Policy-checked launch path that may refuse duplicates and return tray/taskbar recovery guidance.",
    readOnly: false,
    destructive: false,
    idempotent: false,
    openWorld: false
  },
  get_window_state: {
    lane: "action",
    phase: "action",
    order: 100,
    title: "Get Window State",
    availableAfter: "Use after selecting or rehydrating a canonical window.",
    guidance: "Load screenshot and/or UIA facts only when they drive the next decision.",
    readOnly: true,
    destructive: false,
    idempotent: true,
    openWorld: false
  },
  activate_window: {
    lane: "action",
    phase: "action",
    order: 200,
    title: "Activate Window",
    availableAfter: "Use after a canonical window is selected and foreground focus is needed.",
    guidance: "Bring the target forward before input or when focus alone is the intended operation.",
    readOnly: false,
    destructive: false,
    idempotent: true,
    openWorld: false
  },
  click: {
    lane: "action",
    phase: "action",
    order: 210,
    title: "Click Coordinates",
    availableAfter: "Use after get_window_state identifies a safe window-relative or screenshot-relative point.",
    guidance: "Dispatch one pointer click; verify app-level effects with a later get_window_state call.",
    readOnly: false,
    destructive: false,
    idempotent: false,
    openWorld: false
  },
  drag: {
    lane: "action",
    phase: "action",
    order: 220,
    title: "Drag Pointer",
    availableAfter: "Use after get_window_state identifies stable start and end points.",
    guidance: "Dispatch a multi-step drag stroke or selection gesture.",
    readOnly: false,
    destructive: false,
    idempotent: false,
    openWorld: false
  },
  scroll: {
    lane: "action",
    phase: "action",
    order: 230,
    title: "Scroll At Point",
    availableAfter: "Use after get_window_state identifies the pane or point that should receive wheel input.",
    guidance: "Dispatch wheel input at a specific window-relative point.",
    readOnly: false,
    destructive: false,
    idempotent: false,
    openWorld: false
  },
  press_key: {
    lane: "action",
    phase: "action",
    order: 240,
    title: "Press Key",
    availableAfter: "Use after the target window or focused control is verified.",
    guidance: "Send a key or chord; use for control keys instead of embedding them in typed text.",
    readOnly: false,
    destructive: false,
    idempotent: false,
    openWorld: false
  },
  type_text: {
    lane: "action",
    phase: "action",
    order: 250,
    title: "Type Text",
    availableAfter: "Use after get_window_state or focus proves the intended editable surface is active.",
    guidance: "Send literal text only; verify visible results before claiming completion.",
    readOnly: false,
    destructive: false,
    idempotent: false,
    openWorld: false
  },
  click_element: {
    lane: "action",
    phase: "action",
    order: 260,
    title: "Click UIA Element",
    availableAfter: "Use after get_window_state includes fresh UIA text with an element_index.",
    guidance: "Invoke the latest text snapshot element's primary UIA pattern.",
    readOnly: false,
    destructive: false,
    idempotent: false,
    openWorld: false
  },
  set_value: {
    lane: "action",
    phase: "action",
    order: 270,
    title: "Set UIA Value",
    availableAfter: "Use after get_window_state includes a fresh ValuePattern element_index.",
    guidance: "Set the value of a UIA element from the latest text-bearing snapshot.",
    readOnly: false,
    destructive: false,
    idempotent: false,
    openWorld: false
  },
  perform_secondary_action: {
    lane: "action",
    phase: "action",
    order: 280,
    title: "Run UIA Secondary Action",
    availableAfter: "Use after get_window_state lists a supported secondary action for an element_index.",
    guidance: "Run a named UIA secondary action from the latest text-bearing snapshot.",
    readOnly: false,
    destructive: false,
    idempotent: false,
    openWorld: false
  },
  select_file_in_dialog: {
    lane: "dialog",
    phase: "dialog",
    order: 300,
    title: "Select File In Dialog",
    availableAfter: "Use only after get_window_state verifies a standard Windows file-open dialog.",
    guidance: "Complete local file selection; it does not upload, send, or publish afterward.",
    readOnly: false,
    destructive: false,
    idempotent: false,
    openWorld: false
  },
  select_folder_in_dialog: {
    lane: "dialog",
    phase: "dialog",
    order: 310,
    title: "Select Folder In Dialog",
    availableAfter: "Use only after get_window_state verifies a standard Windows folder picker.",
    guidance: "Complete local folder selection; it does not publish or submit afterward.",
    readOnly: false,
    destructive: false,
    idempotent: false,
    openWorld: false
  },
  set_save_path_in_dialog: {
    lane: "dialog",
    phase: "dialog",
    order: 320,
    title: "Set Save Path In Dialog",
    availableAfter: "Use only after get_window_state verifies a standard Windows save dialog.",
    guidance: "Set a local save path; it does not confirm any later external destination.",
    readOnly: false,
    destructive: false,
    idempotent: false,
    openWorld: false
  },
  end_turn: {
    lane: "lifecycle",
    phase: "lifecycle",
    order: 900,
    title: "End Computer Use Turn",
    availableAfter: "Use once after the workflow is verified complete or abandoned.",
    guidance: "Flush lifecycle state and close turn-scoped native resources.",
    readOnly: false,
    destructive: false,
    idempotent: true,
    openWorld: false
  }
} as const satisfies Record<ComputerUseToolMethod, ToolDisclosure>;

export const progressiveDisclosureOrder: readonly ToolDisclosurePhase[] = [
  "discovery",
  "action",
  "dialog",
  "lifecycle"
];

export function getToolDisclosure(method: ComputerUseToolMethod): ToolDisclosure {
  return disclosureByMethod[method];
}

export function getToolAnnotations(method: ComputerUseToolMethod): ToolAnnotations {
  const disclosure = getToolDisclosure(method);
  return {
    title: disclosure.title,
    readOnlyHint: disclosure.readOnly,
    destructiveHint: disclosure.destructive,
    idempotentHint: disclosure.idempotent,
    openWorldHint: disclosure.openWorld
  };
}

export function getToolDisclosureMeta(method: ComputerUseToolMethod): Record<string, unknown> {
  const disclosure = getToolDisclosure(method);
  return {
    "computer-use/disclosureLane": disclosure.lane,
    "computer-use/disclosurePhase": disclosure.phase,
    "computer-use/progressiveOrder": disclosure.order,
    "computer-use/availableAfter": disclosure.availableAfter,
    "computer-use/guidance": disclosure.guidance
  };
}
