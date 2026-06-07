import type { CapabilityMethod } from "../../core/contracts/capability.js";

type JsonSchemaType = "object" | "string" | "number" | "integer" | "boolean" | "array";

export interface ToolInputSchema {
  type?: JsonSchemaType;
  description?: string;
  properties?: Record<string, ToolInputSchema>;
  required?: readonly string[];
  additionalProperties?: boolean;
  enum?: readonly (string | number | boolean)[];
  items?: ToolInputSchema;
  anyOf?: readonly ToolInputSchema[];
  minimum?: number;
  maximum?: number;
  default?: unknown;
}

const mouseButtonSchema: ToolInputSchema = {
  type: "string",
  enum: ["left", "right", "middle", "l", "r", "m"],
  description: "Mouse button alias. Short aliases map to left/right/middle."
};

const dragButtonSchema: ToolInputSchema = {
  ...mouseButtonSchema,
  default: "left"
};

const windowRefSchema: ToolInputSchema = {
  type: "object",
  description: "Window object returned by list_apps, list_windows, get_window, or get_window_state.",
  properties: {
    id: {
      type: "integer",
      minimum: 0,
      description: "Window handle id from a previous computer-use tool call."
    },
    app: {
      type: "string",
      description: "Application identifier for the owning process."
    },
    title: {
      type: "string",
      description: "Optional window title from the last discovery or snapshot call."
    },
    className: {
      type: "string",
      description: "Optional Win32 class name from the last discovery or snapshot call."
    },
    rect: {
      type: "object",
      description: "Optional window bounds carried forward from get_window_state for coordinate actions.",
      properties: {
        left: { type: "number" },
        top: { type: "number" },
        right: { type: "number" },
        bottom: { type: "number" }
      },
      required: ["left", "top", "right", "bottom"],
      additionalProperties: false
    },
    visible: {
      type: "boolean",
      description: "Optional visibility flag carried forward from get_window_state."
    },
    minimized: {
      type: "boolean",
      description: "Optional minimized flag carried forward from get_window_state."
    },
    focused: {
      type: "boolean",
      description: "Optional focus flag carried forward from get_window_state."
    },
    focusedSource: {
      type: "string",
      enum: ["GetForegroundWindow", "assumed_after_successful_call"],
      description: "How the focused flag was determined."
    },
    foregroundWindowId: {
      type: "integer",
      minimum: 0,
      description: "Window handle that Windows reported as the foreground window when focus was checked."
    },
    rectCoordinateSpace: {
      type: "string",
      enum: ["virtual_screen", "unknown"],
      description: "Coordinate space used by rect. virtual_screen can include negative x/y for secondary monitors."
    },
    rectOnVirtualScreen: {
      type: "boolean",
      description: "Whether rect intersects the current Windows virtual screen."
    },
    visibleClickableRegion: {
      type: "object",
      description: "Window-relative visible region that maps screenshot coordinates back to clickable coordinates.",
      properties: {
        left: { type: "number" },
        top: { type: "number" },
        right: { type: "number" },
        bottom: { type: "number" }
      },
      required: ["left", "top", "right", "bottom"],
      additionalProperties: false
    },
    screenshotCoordinateScale: {
      type: "object",
      description: "Scale from screenshot pixels to window-relative coordinates.",
      properties: {
        x: { type: "number" },
        y: { type: "number" }
      },
      required: ["x", "y"],
      additionalProperties: false
    },
    ownerWindowId: {
      type: "integer",
      minimum: 0,
      description: "Owner window handle when Windows reports one."
    },
    parentWindowId: {
      type: "integer",
      minimum: 0,
      description: "Parent window handle when Windows reports one."
    },
    modalForWindowId: {
      type: "integer",
      minimum: 0,
      description: "Owning app window handle when this window is a modal child."
    },
    health: {
      type: "object",
      description: "Window responsiveness health reported by Win32.",
      properties: {
        hung: {
          type: "boolean",
          description: "True when Windows reports the window as not responding."
        },
        isResponding: {
          type: "boolean",
          description: "Inverse of hung."
        },
        lastInputIdleMs: {
          type: "integer",
          minimum: -1,
          description: "Milliseconds since the last user input observed by Windows, or -1 if unavailable."
        }
      },
      required: ["hung", "isResponding"],
      additionalProperties: false
    }
  },
  required: ["id", "app"],
  additionalProperties: false
};

const virtualScreenSchema: ToolInputSchema = {
  type: "object",
  properties: {
    originX: { type: "integer" },
    originY: { type: "integer" },
    width: { type: "integer", minimum: 2 },
    height: { type: "integer", minimum: 2 },
    source: {
      type: "string",
      enum: ["default", "native"],
      description: "native means the metrics came from Windows SM_X/Y/CX/CYVIRTUALSCREEN."
    }
  },
  required: ["originX", "originY", "width", "height", "source"],
  additionalProperties: false
};

const activationPlanSchema: ToolInputSchema = {
  type: "object",
  properties: {
    targetWindow: windowRefSchema,
    strategy: {
      type: "object",
      properties: {
        maxForegroundRetries: { type: "integer", minimum: 0 },
        unlockSequence: {
          type: "array",
          items: { type: "string", enum: ["escape", "alt"] }
        },
        desktopFallback: { type: "boolean" },
        requiresAttachThreadInput: { type: "boolean" },
        attachThreadInputAvailable: { type: "boolean" },
        attachThreadInputMode: {
          type: "string",
          enum: ["native", "approximate", "unavailable"]
        },
        attachThreadInputOnOffscreenWindow: { type: "boolean" }
      },
      required: [
        "maxForegroundRetries",
        "unlockSequence",
        "desktopFallback",
        "requiresAttachThreadInput",
        "attachThreadInputAvailable",
        "attachThreadInputMode"
      ],
      additionalProperties: false
    }
  },
  required: ["targetWindow", "strategy"],
  additionalProperties: false
};

const turnMetadataSchema: ToolInputSchema = {
  type: "object",
  properties: {
    session_id: {
      type: "string",
      description: "Stable session identifier for turn-scoped lifecycle tracking."
    },
    turn_id: {
      type: "string",
      description: "Stable turn identifier for lifecycle and trace grouping."
    }
  },
  required: ["session_id", "turn_id"],
  additionalProperties: false
};

const traceSchema: ToolInputSchema = {
  type: "object",
  properties: {
    enabled: {
      type: "boolean",
      description: "Enable trace artifact capture for this request."
    },
    outputDir: {
      type: "string",
      description: "Optional trace artifact output directory."
    }
  },
  additionalProperties: false
};

const metaSchema: ToolInputSchema = {
  type: "object",
  properties: {
    codexTurnMetadata: turnMetadataSchema,
    computerUseTrace: traceSchema,
    "x-oai-cua-request-budget-ms": {
      type: "number",
      minimum: 0,
      description: "Optional request budget hint in milliseconds."
    }
  },
  additionalProperties: false
};

function withInvocationMetadata(schema: ToolInputSchema): ToolInputSchema {
  return {
    ...schema,
    type: "object",
    properties: {
      ...(schema.properties ?? {}),
      meta: metaSchema,
      claudeTurnMetadata: turnMetadataSchema,
      codexTurnMetadata: turnMetadataSchema,
      computerUseTrace: traceSchema
    },
    additionalProperties: false
  };
}

function emptyObjectSchema(description: string): ToolInputSchema {
  return {
    type: "object",
    description,
    properties: {},
    additionalProperties: false
  };
}

function elementActionSchema(
  description: string,
  extraProperties: Record<string, ToolInputSchema> = {},
  required: readonly string[] = []
): ToolInputSchema {
  return {
    type: "object",
    description,
    properties: {
      window: windowRefSchema,
      element_index: {
        type: "integer",
        minimum: 0,
        description: "Element index from get_window_state accessibility output."
      },
      screenshotId: {
        type: "string",
        description: "Optional screenshot correlation id from a prior snapshot."
      },
      ...extraProperties
    },
    required: ["window", "element_index", ...required],
    additionalProperties: false
  };
}

function commonDialogPathSchema(description: string): ToolInputSchema {
  return {
    type: "object",
    description,
    properties: {
      window: windowRefSchema,
      path: {
        type: "string",
        description: "Absolute local filesystem path for the standard dialog."
      }
    },
    required: ["window", "path"],
    additionalProperties: false
  };
}

export function getClaudeToolInputSchema(
  method: CapabilityMethod | "end_turn"
): ToolInputSchema {
  const baseSchema = getBaseToolInputSchema(method);
  return withInvocationMetadata(baseSchema);
}

export function getClaudeToolOutputSchema(
  method: CapabilityMethod | "end_turn"
): ToolInputSchema | undefined {
  switch (method) {
    case "list_windows":
      return {
        type: "object",
        description: "Structured list_windows result for MCP clients that require object-shaped structuredContent.",
        properties: {
          windows: {
            type: "array",
            items: windowRefSchema,
            description: "Targetable top-level windows."
          }
        },
        required: ["windows"],
        additionalProperties: false
      };

    case "activate_window":
      return {
        type: "object",
        description: "Structured activation result with focus evidence.",
        properties: {
          ok: {
            type: "boolean",
            description: "True when activation completed without an error."
          },
          window: windowRefSchema,
          focused: {
            type: "boolean",
            description: "Whether the target was the foreground window after activation."
          },
          focusedSource: {
            type: "string",
            enum: ["GetForegroundWindow", "assumed_after_successful_call"],
            description: "How the focus result was determined."
          },
          foregroundWindowId: {
            type: "integer",
            minimum: 0,
            description: "Foreground window handle observed after activation."
          },
          hint: {
            type: "string",
            description: "Optional fallback guidance when the bridge cannot provide direct focus evidence."
          }
        },
        required: ["ok", "window", "focused", "focusedSource"],
        additionalProperties: false
      };

    case "click":
      return {
        type: "object",
        description: "Structured click result with activation, screen-point, virtual-screen, hit-test, and focus evidence.",
        properties: {
          ok: {
            type: "boolean",
            description: "True when the click completed without an error."
          },
          window: windowRefSchema,
          screenPoint: {
            type: "object",
            description: "Final screen coordinates in Windows virtual-screen pixels.",
            properties: {
              x: { type: "integer" },
              y: { type: "integer" }
            },
            required: ["x", "y"],
            additionalProperties: false
          },
          clickPlan: {
            type: "object",
            description: "Normalized pointer plan used for diagnostics and trace evidence.",
            properties: {
              moveFlags: { type: "integer" },
              pixelX: { type: "integer" },
              pixelY: { type: "integer" },
              absoluteX: { type: "integer" },
              absoluteY: { type: "integer" },
              virtualScreen: virtualScreenSchema
            },
            required: ["moveFlags", "pixelX", "pixelY", "absoluteX", "absoluteY", "virtualScreen"],
            additionalProperties: false
          },
          activation: {
            type: "object",
            properties: {
              ok: { type: "boolean" },
              window: windowRefSchema,
              focused: { type: "boolean" },
              focusedSource: {
                type: "string",
                enum: ["GetForegroundWindow", "assumed_after_successful_call"]
              },
              foregroundWindowId: {
                type: "integer",
                minimum: 0
              },
              hint: { type: "string" },
              plan: activationPlanSchema
            },
            required: ["ok", "window", "focused", "focusedSource", "plan"],
            additionalProperties: false
          },
          postInputFocus: {
            type: "object",
            properties: {
              focused: { type: "boolean" },
              matchesTarget: { type: "boolean" },
              foregroundWindowId: { type: "integer", minimum: 0 }
            },
            required: ["focused", "matchesTarget"],
            additionalProperties: false
          },
          hitTest: {
            type: "object",
            properties: {
              hwndAtPoint: { type: "integer", minimum: 0 },
              rawHwndAtPoint: { type: "integer", minimum: 0 },
              window: windowRefSchema,
              processName: { type: "string" },
              matchesTarget: { type: "boolean" }
            },
            additionalProperties: false
          },
          warnings: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["ok", "window", "screenPoint", "clickPlan", "activation"],
        additionalProperties: false
      };

    case "launch_app":
      return {
        type: "object",
        description: "Structured launch_app result. Failures return ok:false with code, details, and guidance; successful calls never return null.",
        properties: {
          ok: {
            type: "boolean",
            description: "True when the launch request was accepted and delegated to Windows."
          },
          app: {
            type: "string",
            description: "Normalized app id or executable path that was passed to the native bridge."
          },
          strategy: {
            type: "string",
            enum: ["app_user_model_id", "executable_path"],
            description: "How the app identifier will be launched."
          },
          launchMode: {
            type: "string",
            enum: ["reuse_or_launch", "force_new"],
            description: "Effective launch policy used for this request."
          },
          disposition: {
            type: "string",
            enum: ["delegated_launch"],
            description: "The launch request was handed to the native Windows bridge."
          },
          message: {
            type: "string",
            description: "Human-readable success reason."
          },
          matchedAppId: {
            type: "string",
            description: "Optional app id matched during reuse_or_launch discovery."
          }
        },
        required: ["ok", "app", "strategy", "launchMode", "disposition", "message"],
        additionalProperties: false
      };

    default:
      return undefined;
  }
}

function getBaseToolInputSchema(method: CapabilityMethod | "end_turn"): ToolInputSchema {
  switch (method) {
    case "list_apps":
      return emptyObjectSchema("List launchable apps and include any currently targetable windows.");

    case "list_windows":
      return emptyObjectSchema("List targetable top-level windows.");

    case "get_window":
      return {
        type: "object",
        description: "Resolve a canonical window object from a previously returned window id.",
        properties: {
          id: {
            type: "integer",
            minimum: 0,
            description: "Window handle id from list_windows or an app window entry."
          },
          app: {
            type: "string",
            description: "Optional owning app identifier to help rehydrate the window."
          }
        },
        required: ["id"],
        additionalProperties: false
      };

    case "launch_app":
      return {
        type: "object",
        description: "Launch an installed app id or executable-path identifier. If the app is already running or minimized to tray, the hook rejects duplicate cold-launches and returns taskbar/tray recovery guidance. Use other available host tools, such as shell search, when that is faster for finding executable paths or checking installation state.",
        properties: {
          app: {
            type: "string",
            description: "Installed app id, executable name, or executable path."
          },
          launch_mode: {
            type: "string",
            enum: ["reuse_or_launch", "force_new"],
            description: "Defaults to reuse_or_launch. Use force_new only when the user explicitly asks for a new instance."
          },
          observe_timeout_ms: {
            type: "integer",
            minimum: 0,
            maximum: 5000,
            description: "Short post-launch window observation wait in milliseconds. Defaults to a small value."
          }
        },
        required: ["app"],
        additionalProperties: false
      };

    case "get_window_state":
      return {
        type: "object",
        description: "Capture a snapshot of a window, optionally including a screenshot and accessibility tree.",
        properties: {
          window: windowRefSchema,
          include_screenshot: {
            type: "boolean",
            default: true,
            description: "Include a JPEG screenshot in the response."
          },
          include_text: {
            type: "boolean",
            default: true,
            description: "Include accessibility text and indexed UIA nodes in the response."
          },
          jpeg_quality: {
            type: "number",
            minimum: 1,
            maximum: 100,
            description: "JPEG quality hint. Runtime clamps values into the 1-100 range."
          },
          max_elements: {
            type: "integer",
            minimum: 1,
            maximum: 10000,
            description: "Maximum indexed accessibility elements to include."
          },
          role_filter: {
            type: "array",
            items: { type: "string" },
            description: "Optional accessibility role filter, for example [\"Edit\", \"Button\"]."
          },
          name_contains: {
            type: "string",
            description: "Optional case-insensitive substring filter applied to accessibility node names."
          }
        },
        required: ["window"],
        additionalProperties: false
      };

    case "click":
      return {
        type: "object",
        description: "Click at window-relative coordinates. The model chooses the target point; the runtime only resolves window-relative coordinates into screen coordinates and executes the click.",
        properties: {
          window: windowRefSchema,
          x: {
            type: "number",
            description: "Window-relative x coordinate."
          },
          y: {
            type: "number",
            description: "Window-relative y coordinate."
          },
          coordinateSpace: {
            type: "string",
            enum: ["window", "screenshot"],
            default: "window",
            description: "Coordinate space for x/y. Use screenshot only with window metadata returned by get_window_state."
          },
          click_count: {
            type: "integer",
            minimum: 1,
            description: "Number of clicks to send."
          },
          mouse_button: mouseButtonSchema,
          screenshotId: {
            type: "string",
            description: "Optional screenshot correlation id from a prior snapshot."
          }
        },
        required: ["window", "x", "y"],
        additionalProperties: false
      };

    case "select_file_in_dialog":
      return commonDialogPathSchema("Select an existing local file in a standard Windows file picker. This only completes the local dialog; it does not send, upload, or publish the file.");

    case "select_folder_in_dialog":
      return commonDialogPathSchema("Select an existing local folder in a standard Windows folder picker. This only completes the local dialog; it does not send, upload, or publish content.");

    case "set_save_path_in_dialog":
      return commonDialogPathSchema("Set a save path in a standard Windows save dialog. This only completes the local dialog; it does not publish content.");

    case "click_element":
      return elementActionSchema(
        "Invoke the primary action on an indexed accessibility element.",
        {
          click_count: {
            type: "integer",
            minimum: 1,
            default: 1,
            description: "Number of clicks to send."
          },
          mouse_button: {
            ...mouseButtonSchema,
            default: "left"
          }
        }
      );

    case "press_key":
      return {
        type: "object",
        description: "Send a key or key chord to the target window.",
        properties: {
          window: windowRefSchema,
          key: {
            type: "string",
            description: "Literal keysym or chord string, for example Return, Tab, or Ctrl+L."
          }
        },
        required: ["window", "key"],
        additionalProperties: false
      };

    case "type_text":
      return {
        type: "object",
        description: "Type literal text into the target window. If the last snapshot used gdi_fallback or an IME candidate UI is visible, prefer press_key for explicit character-by-character input.",
        properties: {
          window: windowRefSchema,
          text: {
            type: "string",
            description: "Literal text only. Control keys must go through press_key."
          }
        },
        required: ["window", "text"],
        additionalProperties: false
      };

    case "scroll":
      return {
        type: "object",
        description: "Send wheel input at a window-relative point. Provide x+y coordinates and at least one of scroll_x or scroll_y; runtime validation enforces that contract.",
        properties: {
          window: windowRefSchema,
          x: {
            type: "number",
            description: "Window-relative x coordinate."
          },
          y: {
            type: "number",
            description: "Window-relative y coordinate."
          },
          scroll_x: {
            type: "integer",
            description: "Horizontal wheel delta. At least one of scroll_x or scroll_y must be non-zero."
          },
          scroll_y: {
            type: "integer",
            description: "Vertical wheel delta. At least one of scroll_x or scroll_y must be non-zero."
          },
          screenshotId: {
            type: "string",
            description: "Optional screenshot correlation id from a prior snapshot."
          }
        },
        required: ["window", "x", "y"],
        additionalProperties: false
      };

    case "set_value":
      return elementActionSchema(
        "Set the ValuePattern string on an indexed accessibility element.",
        {
          value: {
            type: "string",
            description: "Replacement string to write into the target element."
          }
        },
        ["value"]
      );

    case "drag":
      return {
        type: "object",
        description: "Send a pointer drag across window-relative coordinates.",
        properties: {
          window: windowRefSchema,
          from_x: {
            type: "number",
            description: "Drag start x coordinate."
          },
          from_y: {
            type: "number",
            description: "Drag start y coordinate."
          },
          to_x: {
            type: "number",
            description: "Drag end x coordinate."
          },
          to_y: {
            type: "number",
            description: "Drag end y coordinate."
          },
          button: dragButtonSchema,
          duration_ms: {
            type: "integer",
            minimum: 0,
            default: 250,
            description: "Drag duration in milliseconds."
          },
          steps: {
            type: "integer",
            minimum: 1,
            maximum: 120,
            default: 12,
            description: "Number of interpolated drag points."
          },
          screenshotId: {
            type: "string",
            description: "Optional screenshot correlation id from a prior snapshot."
          }
        },
        required: ["window", "from_x", "from_y", "to_x", "to_y"],
        additionalProperties: false
      };

    case "perform_secondary_action":
      return elementActionSchema(
        "Execute a named secondary action on an indexed accessibility element.",
        {
          action: {
            type: "string",
            description: "Named secondary action such as raise, scroll down, expand, or collapse."
          }
        },
        ["action"]
      );

    case "activate_window":
      return {
        type: "object",
        description: "Bring the target window to the foreground and restore it if minimized. Returns a structured focus report; use focusedSource and foregroundWindowId instead of inferring success from null.",
        properties: {
          window: windowRefSchema
        },
        required: ["window"],
        additionalProperties: false
      };

    case "end_turn":
      return emptyObjectSchema("Close the current turn and flush lifecycle state.");
  }
}
