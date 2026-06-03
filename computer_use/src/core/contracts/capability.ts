import type { ActionMethod } from "./action.js";
import type { CaptureMethod } from "./capture.js";
import type { DiscoveryMethod } from "./discovery.js";

export type CapabilityMethod = ActionMethod | CaptureMethod | DiscoveryMethod;
