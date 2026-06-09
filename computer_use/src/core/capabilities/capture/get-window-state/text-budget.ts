import type { JsonRpcRequest } from "../../../contracts/rpc.js";
import type {
  AccessibilityNode,
  AccessibilityTextSummary,
  WindowStateParams,
  WindowStateResult
} from "../../../contracts/capture.js";
import { getDefaultTraceOutputDir } from "../../../trace/trace-config.js";
import { TraceArtifactWriter } from "../../../trace/artifact-writer.js";

const DEFAULT_TEXT_CHAR_BUDGET = 20000;
const DEFAULT_SUMMARY_NODE_LIMIT = 80;
const STRING_VALUE_LIMIT = 160;

export async function compactWindowStateTextForResponse(args: {
  state: WindowStateResult;
  request: JsonRpcRequest<WindowStateParams>;
  existingTextArtifactPath?: string;
  outputDir?: string;
  textCharBudget?: number;
  summaryNodeLimit?: number;
}): Promise<WindowStateResult> {
  if (!args.state.text) {
    return args.state;
  }

  const serializedText = JSON.stringify(args.state.text);
  const textCharBudget = args.textCharBudget ?? DEFAULT_TEXT_CHAR_BUDGET;
  if (serializedText.length <= textCharBudget) {
    return args.state;
  }

  const textArtifactPath = args.existingTextArtifactPath ??
    await writeOffloadedTextArtifact({
      request: args.request,
      text: args.state.text,
      outputDir: args.outputDir
    });
  const summary = summarizeAccessibilityText(
    args.state.text,
    args.summaryNodeLimit ?? DEFAULT_SUMMARY_NODE_LIMIT
  );

  return {
    ...args.state,
    text: summary.root,
    capture: {
      ...args.state.capture,
      textOmitted: true,
      textCharCount: serializedText.length,
      textArtifactPath,
      textSummary: summary.metadata
    }
  };
}

function summarizeAccessibilityText(
  root: AccessibilityNode,
  maxSummaryNodes: number
): {
  root: AccessibilityNode;
  metadata: AccessibilityTextSummary;
} {
  const actionableNodes: AccessibilityNode[] = [];
  const fallbackNodes: AccessibilityNode[] = [];
  let originalNodeCount = 0;
  let actionableNodeCount = 0;

  const stack: AccessibilityNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    originalNodeCount++;

    if (node !== root && isActionableNode(node)) {
      actionableNodeCount++;
      if (actionableNodes.length < maxSummaryNodes) {
        actionableNodes.push(cloneSummaryNode(node));
      }
    } else if (
      node !== root &&
      fallbackNodes.length < maxSummaryNodes &&
      isUsefulFallbackNode(node)
    ) {
      fallbackNodes.push(cloneSummaryNode(node));
    }

    for (let index = node.children.length - 1; index >= 0; index--) {
      stack.push(node.children[index]!);
    }
  }

  const selectedNodes = actionableNodes.length > 0
    ? actionableNodes
    : fallbackNodes.slice(0, maxSummaryNodes);
  const summaryRoot = cloneSummaryNode(root, selectedNodes);

  return {
    root: summaryRoot,
    metadata: {
      mode: "actionable_nodes",
      originalNodeCount,
      summaryNodeCount: 1 + selectedNodes.length,
      actionableNodeCount,
      maxSummaryNodes,
      note: "Full accessibility text was omitted from the tool response; read capture.textArtifactPath for the complete UIA tree or retry with narrower filters."
    }
  };
}

function isActionableNode(node: AccessibilityNode): boolean {
  if (node.offscreen === true) {
    return false;
  }

  if ((node.patterns?.length ?? 0) > 0 || (node.secondaryActions?.length ?? 0) > 0) {
    return true;
  }

  return [
    "Button",
    "CheckBox",
    "ComboBox",
    "Edit",
    "Hyperlink",
    "ListItem",
    "MenuItem",
    "RadioButton",
    "TabItem",
    "TreeItem"
  ].includes(node.role);
}

function isUsefulFallbackNode(node: AccessibilityNode): boolean {
  if (node.offscreen === true) {
    return false;
  }

  return Boolean(node.name || node.value || node.bounds);
}

function cloneSummaryNode(
  node: AccessibilityNode,
  children: readonly AccessibilityNode[] = []
): AccessibilityNode {
  return {
    index: node.index,
    role: node.role,
    ...(node.name ? { name: truncateText(node.name) } : {}),
    ...(node.value ? { value: truncateText(node.value) } : {}),
    ...(node.bounds ? { bounds: node.bounds } : {}),
    ...(node.description ? { description: truncateText(node.description) } : {}),
    ...(typeof node.enabled === "boolean" ? { enabled: node.enabled } : {}),
    ...(typeof node.offscreen === "boolean" ? { offscreen: node.offscreen } : {}),
    ...(node.patterns && node.patterns.length > 0 ? { patterns: node.patterns } : {}),
    ...(node.secondaryActions && node.secondaryActions.length > 0
      ? { secondaryActions: node.secondaryActions }
      : {}),
    children
  };
}

function truncateText(value: string): string {
  if (value.length <= STRING_VALUE_LIMIT) {
    return value;
  }

  return `${value.slice(0, STRING_VALUE_LIMIT)}...`;
}

async function writeOffloadedTextArtifact(args: {
  request: JsonRpcRequest<WindowStateParams>;
  text: AccessibilityNode;
  outputDir?: string;
}): Promise<string> {
  const writer = new TraceArtifactWriter(args.outputDir ?? getDefaultTraceOutputDir());
  const location = await writer.createActionLocation({
    sessionId: args.request.meta?.codexTurnMetadata?.session_id ?? "session-unscoped",
    turnId: args.request.meta?.codexTurnMetadata?.turn_id ?? `turn-${String(args.request.id)}`,
    actionId: `get_window_state-${String(args.request.id)}-uia-offload`
  });
  const artifact = await writer.writeJson(location, "uia-offload", "uia-tree.json", args.text);
  return artifact.absolutePath;
}
