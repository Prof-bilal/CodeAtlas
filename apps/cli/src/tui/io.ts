/**
 * Terminal I/O seam for the interactive TUI. The TUI speaks through this
 * interface so tests can drive it with a fake; the real implementation wraps
 * `node:readline`.
 */

import { createInterface } from "node:readline";

/** The I/O surface the TUI uses. */
export interface TuiIo {
  /** Write a line to the terminal. */
  write(text: string): void;
  /** Prompt and read a single line (input loop). */
  readLine(prompt: string): Promise<string>;
  /**
   * Release the terminal so an interactive child process (inherited stdio)
   * owns it. The readline prompt is paused, not closed.
   */
  suspend(): void;
  /** Reclaim the terminal after an interactive child exits. */
  resume(): void;
  /** Close the underlying stream/interface. */
  close(): void;
}

/** Create the real `node:readline`-backed IO. */
export function createReadlineIo(): TuiIo {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return {
    write(text) {
      process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
    },
    readLine(prompt) {
      return new Promise((resolve) => {
        rl.question(prompt, resolve);
      });
    },
    suspend() {
      rl.pause();
    },
    resume() {
      rl.resume();
    },
    close() {
      rl.close();
    },
  };
}
