import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const marketing = process.argv.includes("--marketing");
const renderArgs = process.argv.slice(2).filter((arg) => arg !== "--marketing");
const require = createRequire(import.meta.url);
const remotionDirectory = join(root, "node_modules", "@remotion");
const executable = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
const bundledFfmpeg = readdirSync(remotionDirectory)
  .filter((name) => name.startsWith("compositor-"))
  .map((name) => join(remotionDirectory, name, executable))
  .find((path) => existsSync(path));
const ffmpeg = process.env.FFMPEG_PATH || bundledFfmpeg;
if (!ffmpeg) throw new Error("Set FFMPEG_PATH to a compatible FFmpeg executable.");
const audio = join(
  root,
  "public",
  ...(marketing ? ["marketing", "audio"] : ["audio"]),
  "narration.wav",
);
if (!existsSync(audio)) throw new Error("Generate narration.wav before rendering; see README.md.");
mkdirSync(join(root, "out"), { recursive: true });
const name = marketing ? "codeatlas-marketing" : "codeatlas-beta";
const silent = join(root, "out", `${name}-silent.mp4`);
const output = join(root, "out", `${name}.mp4`);

function run(file, args) {
  const result = spawnSync(file, args, { cwd: root, stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${file} exited with ${result.status}`);
}

// Render the visuals with Remotion, then mux one continuous narration track.
// Skipping alternate frames can otherwise fragment audio into thousands of mixes.
run(process.execPath, [
  join(dirname(require.resolve("@remotion/cli/package.json")), "remotion-cli.js"),
  "render",
  marketing ? "src/marketing/index.tsx" : "src/index.tsx",
  marketing ? "CodeAtlasMarketing" : "CodeAtlasBeta",
  silent,
  "--codec",
  "h264",
  "--concurrency",
  "4",
  "--every-nth-frame",
  marketing ? "1" : "2",
  "--scale",
  "0.6666667",
  "--muted",
  ...renderArgs,
]);
run(ffmpeg, [
  "-y",
  "-i",
  silent,
  "-i",
  audio,
  "-map",
  "0:v:0",
  "-map",
  "1:a:0",
  "-c:v",
  "copy",
  "-c:a",
  "aac",
  "-b:a",
  "160k",
  "-movflags",
  "+faststart",
  "-shortest",
  output,
]);
