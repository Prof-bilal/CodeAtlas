#!/usr/bin/env node
/**
 * Runs a command under memory/CPU monitoring with a safety guard.
 *
 * Records wall time, peak process RSS, min system MemAvailable, and kills the
 * child (SIGKILL) if either:
 *   - process RSS exceeds --max-rss Mb (default 3500)
 *   - system MemAvailable drops below --min-avail Mb (default 200)
 *
 * Usage:
 *   node benchmarks/extreme/run-monitored.mjs --label init -- cmd args...
 *
 * Output: JSON on stdout with { label, ok, killed, trigger, startMs, endMs,
 * wallMs, peakRssMb, minMemAvailMb, exitCode, signal, outputHead, outputTail }.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";

const args = process.argv.slice(2);
function takeArg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
const label = takeArg("--label") ?? "run";
const maxRssMb = Number(takeArg("--max-rss") ?? "3500");
const minAvailMb = Number(takeArg("--min-avail") ?? "200");
const sep = args.indexOf("--");
const cmd = args.slice(sep + 1);
if (sep < 0 || cmd.length === 0) {
  console.error("usage: run-monitored.mjs --label NAME [--max-rss MB] [--min-avail MB] -- <cmd> [args...]");
  process.exit(2);
}

const startMs = Date.now();
const child = spawn(cmd[0], cmd.slice(1), {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS ?? "" },
});

let peakRss = 0;
let minAvail = Infinity;
let output = "";
let killed = false;
let trigger = null;

function rssOf(pid) {
  try {
    const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
    const m = /VmRSS:\s+(\d+)/.exec(status);
    return m ? Number(m[1]) / 1024 : 0; // kB -> MB
  } catch {
    return 0;
  }
}

function memAvailMb() {
  try {
    const info = fs.readFileSync("/proc/meminfo", "utf8");
    const m = /MemAvailable:\s+(\d+)/.exec(info);
    return m ? Number(m[1]) / 1024 : Infinity;
  } catch {
    return Infinity;
  }
}

const timer = setInterval(() => {
  const rss = rssOf(child.pid);
  const avail = memAvailMb();
  if (rss > peakRss) peakRss = rss;
  if (avail < minAvail) minAvail = avail;
  if (rss > maxRssMb) {
    killed = true;
    trigger = `RSS ${rss.toFixed(0)}MB > ${maxRssMb}MB cap`;
    child.kill("SIGKILL");
  } else if (avail < minAvailMb) {
    killed = true;
    trigger = `MemAvailable ${avail.toFixed(0)}MB < ${minAvailMb}MB`;
    child.kill("SIGKILL");
  }
}, 1000);

child.stdout.on("data", (d) => {
  output += d;
  if (output.length > 2_000_000) output = output.slice(-1_000_000);
});
child.stderr.on("data", (d) => {
  output += d;
  if (output.length > 2_000_000) output = output.slice(-1_000_000);
});

child.on("error", (err) => {
  console.error(JSON.stringify({ label, error: String(err) }));
  process.exit(2);
});

child.on("close", (code, signal) => {
  clearInterval(timer);
  const endMs = Date.now();
  const result = {
    label,
    ok: code === 0 && !killed,
    killed,
    trigger,
    startTimeIso: new Date(startMs).toISOString(),
    endTimeIso: new Date(endMs).toISOString(),
    wallMs: endMs - startMs,
    wallSec: Number(((endMs - startMs) / 1000).toFixed(1)),
    peakRssMb: Math.round(peakRss),
    minMemAvailMb: minAvail === Infinity ? null : Math.round(minAvail),
    exitCode: code,
    signal,
    outputHead: output.slice(0, 4000),
    outputTail: output.slice(-4000),
  };
  console.log(JSON.stringify(result, null, 2));
});