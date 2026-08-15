import { callCycleB } from "./cycle-b";

export function callCycleA(): string {
  return `A>${callCycleB()}`;
}
