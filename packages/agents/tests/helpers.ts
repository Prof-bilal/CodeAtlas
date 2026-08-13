import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import type { SpawnFn, SpawnedProcess } from "../src/process";

export interface SpawnRecord {
  readonly command: string;
  readonly args: readonly string[];
  readonly options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    shell: boolean;
    stdio?: "pipe" | "ignore" | "inherit";
  };
}

export interface FakeProcess extends SpawnedProcess {
  /** Emit a close with the given exit code/signal. */
  close(code: number | null, signal?: NodeJS.Signals | null): void;
  /** Emit a spawn error (e.g. ENOENT). */
  error(err: Error): void;
  readonly killCalls: Array<NodeJS.Signals | undefined>;
  /** Push text onto the child's stdout stream. */
  writeStdout(text: string): void;
  /** Push text onto the child's stderr stream. */
  writeStderr(text: string): void;
  /** End both output streams (flush buffered data to listeners). */
  endOutput(): void;
}

/**
 * Build a fake `SpawnFn` that returns a controllable child and records every
 * invocation. Tests script the lifecycle (write output, close / error / kill)
 * manually, so no external CLI is ever required. Pass `autoRespond: true` to
 * make each child immediately emit stdout + a clean exit, useful for code paths
 * that fan out several sequential spawns (e.g. `detectAll`).
 */
export function createFakeSpawn(options: { autoRespond?: boolean } = {}): {
  spawn: SpawnFn;
  records: SpawnRecord[];
  processes: FakeProcess[];
} {
  const records: SpawnRecord[] = [];
  const processes: FakeProcess[] = [];

  const spawn: SpawnFn = (command, args, spawnOptions) => {
    const emitter = new EventEmitter();
    const killCalls: Array<NodeJS.Signals | undefined> = [];
    const stdout = new Readable({ read() {} });
    const stderr = new Readable({ read() {} });
    const fake: FakeProcess = {
      // Stable-but-unique pid so sessions and process handles can be told apart.
      pid: 9000 + processes.length + 1,
      stdout,
      stderr,
      kill(signal) {
        killCalls.push(signal);
        return true;
      },
      on(event, listener) {
        emitter.on(event, listener as (..._args: unknown[]) => void);
        return fake;
      },
      close(code, signal = null) {
        emitter.emit("close", code, signal);
      },
      error(err) {
        emitter.emit("error", err);
      },
      get killCalls() {
        return killCalls;
      },
      writeStdout(text) {
        stdout.push(Buffer.from(text, "utf8"));
      },
      writeStderr(text) {
        stderr.push(Buffer.from(text, "utf8"));
      },
      endOutput() {
        stdout.push(null);
        stderr.push(null);
      },
    };
    records.push({ command, args, options: spawnOptions });
    processes.push(fake);

    if (options.autoRespond === true) {
      // Respond on the next tick so the caller can still assert on `records`.
      setImmediate(() => {
        fake.writeStdout("1.0.0\n");
        fake.close(0);
      });
    }
    return fake;
  };

  return { spawn, records, processes };
}

/** Yield to the event loop once so buffered stream 'data' events flush. */
export function flushStreams(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
