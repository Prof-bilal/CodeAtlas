import type {
  ClaimCheckInput,
  ClaimCheckResult,
  CommandRunResult,
  VerificationReport,
  VerificationStrategy,
  VerificationVerdict,
  VerifierPort,
  VerifyConfig,
} from "@atlas/core";
import { classifyResults } from "./baseline.js";
import { checkClaims } from "./claims.js";
import { runCommands as runCommandRunners } from "./runners.js";

export interface VerifierServiceDeps {
  /** Resolve symbols from the context index for the given project. */
  readonly resolveSymbols: (cwd: string) => Promise<readonly string[]>;
  /** Read the raw answer text. */
  readonly getAnswerText: () => string;
  /** Compute a fingerprint of the project state. */
  readonly computeFingerprint: (cwd: string) => Promise<string>;
  /** Logger for user-visible command output. */
  readonly log?: (msg: string) => void;
}

function determineStrategy(
  claimInput: ClaimCheckInput,
  config: VerifyConfig | undefined,
): VerificationStrategy {
  // Explicitly disabled: skip everything
  if (config && !config.enabled) {
    return "none";
  }

  // No config at all: claim-checks only
  if (!config) {
    const hasClaims =
      claimInput.citedPaths.length > 0 ||
      claimInput.citedSymbols.length > 0 ||
      claimInput.planTargets.length > 0;
    return hasClaims ? "claim-checks" : "none";
  }

  const hasCommands = Object.keys(config.commands).length > 0;
  const hasClaims =
    claimInput.citedPaths.length > 0 ||
    claimInput.citedSymbols.length > 0 ||
    claimInput.planTargets.length > 0;

  if (hasCommands && hasClaims) return "command-runners";
  if (hasCommands) return "command-runners";
  if (hasClaims) return "claim-checks";
  return "none";
}

function computeVerdict(
  claims: ClaimCheckResult,
  commands: readonly CommandRunResult[],
  strategy: VerificationStrategy,
): VerificationVerdict {
  if (strategy === "none") return "skipped";

  // Claim failures are hard failures (hallucinations)
  if (!claims.allPassed) return "fail";

  // Command failures: only introduced failures count
  const introducedFailures = commands.filter((c) => c.exitCode !== 0 && !c.preExisting);
  if (introducedFailures.length > 0) return "fail";

  // All pre-existing failures = partial (not model's fault)
  const preExistingFailures = commands.filter((c) => c.exitCode !== 0 && c.preExisting);
  if (preExistingFailures.length > 0) return "partial";

  return "pass";
}

function buildSummary(
  claims: ClaimCheckResult,
  commands: readonly CommandRunResult[],
  verdict: VerificationVerdict,
): string {
  const parts: string[] = [];

  parts.push(`Claims: ${claims.passed}/${claims.passed + claims.failed} passed`);

  if (commands.length > 0) {
    const introduced = commands.filter((c) => c.exitCode !== 0 && !c.preExisting).length;
    const preExisting = commands.filter((c) => c.exitCode !== 0 && c.preExisting).length;
    const passed = commands.filter((c) => c.exitCode === 0).length;
    parts.push(
      `Commands: ${passed}/${commands.length} passed, ${introduced} introduced failures, ${preExisting} pre-existing`,
    );
  }

  parts.push(`Verdict: ${verdict.toUpperCase()}`);

  return parts.join(" | ");
}

export function createVerifierService(deps: VerifierServiceDeps): VerifierPort {
  return {
    async checkClaims(input: ClaimCheckInput): Promise<ClaimCheckResult> {
      // Wrapper for standalone claim-check usage
      return checkClaims(input, process.cwd(), {
        resolveSymbols: deps.resolveSymbols,
        getAnswerText: deps.getAnswerText,
      });
    },

    async runCommands(config: VerifyConfig, cwd: string): Promise<readonly CommandRunResult[]> {
      return runCommandRunners(config, cwd, deps.log !== undefined ? { log: deps.log } : {});
    },

    async verify(
      input: ClaimCheckInput,
      config: VerifyConfig | undefined,
      cwd: string,
      _baselinePath?: string,
    ): Promise<VerificationReport> {
      const strategy = determineStrategy(input, config);

      // Step 1: claim checks (always run)
      const claims = await checkClaims(input, cwd, {
        resolveSymbols: deps.resolveSymbols,
        getAnswerText: deps.getAnswerText,
      });

      // Step 2: command runners (if configured and enabled)
      let commands: readonly CommandRunResult[] = [];
      if (config?.enabled && Object.keys(config.commands).length > 0) {
        commands = await runCommandRunners(
          config,
          cwd,
          deps.log !== undefined ? { log: deps.log } : {},
        );

        // Step 3: baseline-diff classification
        commands = await classifyResults(commands, cwd, {
          computeFingerprint: deps.computeFingerprint,
        });
      }

      const verdict = computeVerdict(claims, commands, strategy);
      const summary = buildSummary(claims, commands, verdict);

      return {
        task: input.task,
        strategy,
        claims,
        commands,
        verdict,
        summary,
        timestamp: new Date().toISOString(),
      };
    },
  };
}
