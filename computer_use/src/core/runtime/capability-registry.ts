import type { CapabilityMethod } from "../contracts/capability.js";

export interface CapabilityDefinition {
  method: CapabilityMethod;
  summary: string;
  requiresWindowActivation: boolean;
}

export class CapabilityRegistry {
  private readonly capabilities = new Map<CapabilityMethod, CapabilityDefinition>();

  register(definition: CapabilityDefinition): void {
    this.capabilities.set(definition.method, definition);
  }

  get(method: CapabilityMethod): CapabilityDefinition | undefined {
    return this.capabilities.get(method);
  }

  list(): readonly CapabilityDefinition[] {
    return Array.from(this.capabilities.values());
  }
}
