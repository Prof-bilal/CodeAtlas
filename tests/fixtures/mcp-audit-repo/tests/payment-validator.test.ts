import { describe, expect, it } from "vitest";
import { validatePayment } from "../src/payments/payment-validator";

describe("validatePayment", () => {
  it("accepts small USD charges", () => {
    expect(validatePayment({ userId: "usr_ada", amount: 12, currency: "USD" })).toBe(true);
  });
});
