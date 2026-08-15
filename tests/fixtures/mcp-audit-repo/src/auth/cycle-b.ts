import { callCycleA } from "./cycle-a";

export function callCycleB(): string {
  return `B>${callCycleA.name}`;
}
