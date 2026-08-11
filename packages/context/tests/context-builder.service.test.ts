import type { FilePath } from "@atlas/shared";
import { ComingSoonError } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import { ContextBuilderService } from "../src/context-builder.service";

describe("ContextBuilderService (stub)", () => {
  it("implements ContextBuilderPort and throws ComingSoonError for build()", async () => {
    const service = new ContextBuilderService();
    await expect(service.build("what is a container?")).rejects.toThrow(ComingSoonError);
  });

  it("throws ComingSoonError for sourceFile()", async () => {
    const service = new ContextBuilderService();
    await expect(service.sourceFile("/src/main.ts" as FilePath)).rejects.toThrow(ComingSoonError);
  });
});
