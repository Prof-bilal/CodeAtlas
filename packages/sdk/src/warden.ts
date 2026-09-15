import {
  type WardenService,
  type WardenServiceOptions,
  createWardenService as createToolkitWardenService,
} from "@prof-bilal/atlas-toolkit";

/** SDK composition seam for the optional Warden security runtime. */
export function createWardenService(options: WardenServiceOptions = {}): WardenService {
  return createToolkitWardenService(options);
}

export type {
  WardenRunPlan,
  WardenRunRequest,
  WardenRunResult,
  WardenService,
  WardenServiceOptions,
  WardenStatus,
} from "@prof-bilal/atlas-toolkit";
