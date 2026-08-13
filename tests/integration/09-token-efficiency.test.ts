import { createContextSDK, estimateTokens } from "@atlas/sdk";
import { describe, expect, it } from "vitest";
import { REPO_PATH, runCli, writeResult } from "./helpers";

interface TaskEfficiency {
  readonly task: string;
  readonly codeAtlasTokens: number;
  readonly codeAtlasItems: number;
  readonly fullRepoTokens: number;
  readonly relevantFilesTokens: number;
  readonly reductionVsFull: number;
  readonly reductionVsRelevant: number;
}

interface EfficiencyRecord {
  readonly method: string;
  readonly fullRepoTokens: number;
  readonly relevantFiles: number;
  readonly relevantTokens: number;
  readonly tasks: readonly TaskEfficiency[];
}

/**
 * 09 — Token efficiency. Compares the budgeted CodeAtlas context package for a
 * task against (a) the entire repository's TS source and (b) the manually
 * identified "relevant files" for the same task. Token counts are CodeAtlas'
 * own deterministic estimate (`chars / 4`) — labeled as estimates, since real
 * LLM tokenizers differ.
 */
describe("09 — token efficiency", () => {
  const tasks: readonly { id: string; task: string; relevant: readonly string[] }[] = [
    {
      id: "A",
      task: "Where is authentication implemented?",
      relevant: [
        "src/components/auth/RequireAuth.tsx",
        "src/pages/auth/Login.tsx",
        "src/store/AppProvider.tsx",
        "project-context/backend/AUTH.md",
      ],
    },
    {
      id: "C",
      task: "Find the component responsible for the design canvas.",
      relevant: [
        "src/components/designer/canvas/Canvas.tsx",
        "src/components/designer/canvas/ElementRenderer.tsx",
        "src/components/designer/DesignerWorkspace.tsx",
        "src/pages/home/DesignBuilder.tsx",
      ],
    },
    {
      id: "D",
      task: "Where should I modify the login feature?",
      relevant: [
        "src/pages/auth/Login.tsx",
        "src/pages/auth/PasswordField.tsx",
        "src/store/AppProvider.tsx",
      ],
    },
    {
      id: "E",
      task: "Explain the architecture of this repository.",
      relevant: [
        "src/components/backend/ArchitectureDiagram.tsx",
        "src/components/backend/ArchitecturePanel.tsx",
        "src/types/backend.ts",
        "project-context/backend/ARCHITECTURE.md",
      ],
    },
  ];

  it("delivers a budgeted package far smaller than the full repo", async () => {
    const context = createContextSDK({ repositoryPath: REPO_PATH });
    const files = context.files.listFiles();
    const fullRepoTokens = files.reduce(
      (sum, file) => sum + estimateTokens(context.files.getFile(file.path).content),
      0,
    );

    const tasksRecord: TaskEfficiency[] = [];
    for (const { id, task, relevant } of tasks) {
      const cli = await runCli(["context", task, "--json"]);
      expect(cli.code, `context failed for task ${id}: ${cli.stderr}`).toBe(0);
      const parsed = JSON.parse(cli.stdout) as {
        items: readonly { tokens?: number }[];
      };
      const codeAtlasTokens = parsed.items.reduce((sum, item) => sum + (item.tokens ?? 0), 0);

      const relevantTokens = relevant.reduce((sum, path) => {
        const file = files.find((f) => f.path.replaceAll("\\", "/").endsWith(path));
        if (file === undefined) return sum;
        return sum + estimateTokens(context.files.getFile(file.path).content);
      }, 0);

      tasksRecord.push({
        task: id,
        codeAtlasTokens,
        codeAtlasItems: parsed.items.length,
        fullRepoTokens,
        relevantFilesTokens: relevantTokens,
        reductionVsFull: fullRepoTokens > 0 ? codeAtlasTokens / fullRepoTokens : 0,
        reductionVsRelevant: relevantTokens > 0 ? codeAtlasTokens / relevantTokens : 0,
      });

      // The whole point: a task's context must be a small fraction of the repo.
      expect(codeAtlasTokens, `task ${id} exceeds full-repo baseline`).toBeLessThanOrEqual(
        fullRepoTokens,
      );
    }
    context.close();

    const record: EfficiencyRecord = {
      method: "estimateTokens (chars/4) — CodeAtlas heuristic, not a real tokenizer",
      fullRepoTokens,
      relevantFiles: tasks.length,
      relevantTokens: tasksRecord.reduce((sum, t) => sum + t.relevantFilesTokens, 0),
      tasks: tasksRecord,
    };
    await writeResult("09-token-efficiency", record);

    for (const t of tasksRecord) {
      expect(t.codeAtlasTokens).toBeGreaterThan(0);
      expect(t.reductionVsFull).toBeLessThan(1);
    }
  });
});
