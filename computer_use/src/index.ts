import { createClaudeAdapter } from "./adapters/claude-code/index.js";
import { createCodexAdapter } from "./adapters/codex/index.js";
import { createDefaultRuntime } from "./core/runtime/execution-context.js";
import { CapabilityRegistry } from "./core/runtime/capability-registry.js";
import { Dispatcher } from "./core/dispatcher/dispatch.js";
import { MethodRegistry } from "./core/dispatcher/method-registry.js";
import { ActivateWindowHandler } from "./core/capabilities/actions/activate-window/handler.js";
import { ClickHandler } from "./core/capabilities/actions/click/handler.js";
import { ClickElementHandler } from "./core/capabilities/actions/click-element/handler.js";
import { DragHandler } from "./core/capabilities/actions/drag/handler.js";
import { PerformSecondaryActionHandler } from "./core/capabilities/actions/perform-secondary-action/handler.js";
import { PressKeyHandler } from "./core/capabilities/actions/press-key/handler.js";
import { ScrollHandler } from "./core/capabilities/actions/scroll/handler.js";
import { SetValueHandler } from "./core/capabilities/actions/set-value/handler.js";
import { TypeTextHandler } from "./core/capabilities/actions/type-text/handler.js";
import { GetWindowStateHandler } from "./core/capabilities/capture/get-window-state/handler.js";
import { GetWindowHandler } from "./core/capabilities/discovery/get-window/handler.js";
import { LaunchAppHandler } from "./core/capabilities/discovery/launch-app/handler.js";
import { ListAppsHandler } from "./core/capabilities/discovery/list-apps/handler.js";
import { ListWindowsHandler } from "./core/capabilities/discovery/list-windows/handler.js";
import { MockNativeBridge } from "./mocks/native-bridge.mock.js";
import { createNativeBridge } from "./windows/bridge/create-native-bridge.js";
import type { NativeBridge } from "./windows/bridge/native-bridge.js";
import type { TraceOptions } from "./core/trace/trace-config.js";

export interface RuntimeOptions {
  trace?: TraceOptions;
}

export function createScaffoldRuntime(options: RuntimeOptions = {}) {
  return createRuntime(new MockNativeBridge(), options);
}

export function createWindowsRuntime(options: RuntimeOptions = {}) {
  return createRuntime(createNativeBridge(), options);
}

function createRuntime(nativeBridge: NativeBridge, options: RuntimeOptions = {}) {
  const runtime = createDefaultRuntime({ nativeBridge, trace: options.trace });
  const capabilities = new CapabilityRegistry();
  const methods = new MethodRegistry();

  const click = new ClickHandler(runtime);
  const clickElement = new ClickElementHandler(runtime);
  const drag = new DragHandler(runtime);
  const getWindowState = new GetWindowStateHandler(runtime);
  const performSecondaryAction = new PerformSecondaryActionHandler(runtime);
  const pressKey = new PressKeyHandler(runtime);
  const scroll = new ScrollHandler(runtime);
  const setValue = new SetValueHandler(runtime);
  const typeText = new TypeTextHandler(runtime);
  const activateWindow = new ActivateWindowHandler(runtime);
  const listWindows = new ListWindowsHandler(runtime);
  const getWindow = new GetWindowHandler(runtime);
  const listApps = new ListAppsHandler(runtime);
  const launchApp = new LaunchAppHandler(runtime);

  capabilities.register(activateWindow.definition);
  capabilities.register(click.definition);
  capabilities.register(clickElement.definition);
  capabilities.register(drag.definition);
  capabilities.register(getWindow.definition);
  capabilities.register(getWindowState.definition);
  capabilities.register(launchApp.definition);
  capabilities.register(listApps.definition);
  capabilities.register(listWindows.definition);
  capabilities.register(performSecondaryAction.definition);
  capabilities.register(pressKey.definition);
  capabilities.register(scroll.definition);
  capabilities.register(setValue.definition);
  capabilities.register(typeText.definition);

  methods.register(activateWindow.definition.method, activateWindow.handle.bind(activateWindow));
  methods.register(click.definition.method, click.handle.bind(click));
  methods.register(clickElement.definition.method, clickElement.handle.bind(clickElement));
  methods.register(drag.definition.method, drag.handle.bind(drag));
  methods.register(getWindow.definition.method, getWindow.handle.bind(getWindow));
  methods.register(getWindowState.definition.method, getWindowState.handle.bind(getWindowState));
  methods.register(launchApp.definition.method, launchApp.handle.bind(launchApp));
  methods.register(listApps.definition.method, listApps.handle.bind(listApps));
  methods.register(listWindows.definition.method, listWindows.handle.bind(listWindows));
  methods.register(performSecondaryAction.definition.method, performSecondaryAction.handle.bind(performSecondaryAction));
  methods.register(pressKey.definition.method, pressKey.handle.bind(pressKey));
  methods.register(scroll.definition.method, scroll.handle.bind(scroll));
  methods.register(setValue.definition.method, setValue.handle.bind(setValue));
  methods.register(typeText.definition.method, typeText.handle.bind(typeText));

  return {
    runtime,
    capabilities,
    methods,
    dispatcher: new Dispatcher(methods)
  };
}

export function createAdapters(options: RuntimeOptions = {}) {
  const scaffold = createWindowsRuntime(options);

  return {
    codex: createCodexAdapter(scaffold.runtime, scaffold.dispatcher, scaffold.capabilities),
    claudeCode: createClaudeAdapter(scaffold.runtime, scaffold.dispatcher, scaffold.capabilities)
  };
}
