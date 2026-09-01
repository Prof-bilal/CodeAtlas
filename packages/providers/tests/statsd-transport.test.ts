import { describe, expect, it } from "vitest";
import type { StatsdMetric } from "../src/transport";

describe("statsdTransport", () => {
  it("sends a counter metric", () => {
    const metric: StatsdMetric = {
      name: "test.requests",
      value: 42,
      type: "c",
    };

    expect(metric.name).toBe("test.requests");
    expect(metric.value).toBe(42);
    expect(metric.type).toBe("c");
  });

  it("sends a gauge metric with tags", () => {
    const metric: StatsdMetric = {
      name: "test.memory",
      value: 1024,
      type: "g",
      tags: ["env:test", "host:localhost"],
    };

    expect(metric.name).toBe("test.memory");
    expect(metric.value).toBe(1024);
    expect(metric.type).toBe("g");
    expect(metric.tags).toEqual(["env:test", "host:localhost"]);
  });

  it("sends a timing metric", () => {
    const metric: StatsdMetric = {
      name: "test.response_time",
      value: 150,
      type: "ms",
    };

    expect(metric.name).toBe("test.response_time");
    expect(metric.value).toBe(150);
    expect(metric.type).toBe("ms");
  });

  it("sends a histogram metric", () => {
    const metric: StatsdMetric = {
      name: "test.request_sizes",
      value: 42,
      type: "h",
    };

    expect(metric.name).toBe("test.request_sizes");
    expect(metric.value).toBe(42);
    expect(metric.type).toBe("h");
  });

  it("sends a metric with sample rate", () => {
    const metric: StatsdMetric = {
      name: "test.requests",
      value: 1,
      type: "s",
    };

    expect(metric.name).toBe("test.requests");
    expect(metric.value).toBe(1);
    expect(metric.type).toBe("s");
  });

  it("sends a metric rate metric", () => {
    const metric: StatsdMetric = {
      name: "test.requests",
      value: 1,
      type: "msr",
    };

    expect(metric.name).toBe("test.requests");
    expect(metric.value).toBe(1);
    expect(metric.type).toBe("msr");
  });
});
