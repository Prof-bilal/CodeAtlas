import { StaticPricingSource, UsageService, UsageStore } from "../src";

/** A usage service wired for tests: in-memory store + built-in pricing table. */
export function createTestUsage(): UsageService {
  return new UsageService({
    store: new UsageStore({ filePath: ":memory:" }),
    pricing: new StaticPricingSource(),
  });
}
