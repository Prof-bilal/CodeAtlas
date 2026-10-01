# CodeAtlas beta walkthrough (Remotion)

A separate promotional film is documented in [marketing/README.md](./marketing/README.md).
Use `npm run marketing:studio` or `npm run marketing:render` for that composition.

A narrated **5–10 minute** developer tutorial covering the problem, deterministic
context engine, all 29 top-level commands, primary subcommand workflows, a real
OpenCode response, and the repository's beta launch blockers. English synthetic
narration, timed captions, chapter timestamps, and actual offline command results
are included. The full flag-by-flag reference is in [COMMANDS.md](./COMMANDS.md).

The content documents local CLI **0.5.1** source as audited on **2026-09-30**.
It does not claim an unconditional beta launch or advertise planned features.

The delivered MP4 runs **9 minutes 36 seconds** at **1280×720 / 12 fps**, with
H.264 video, AAC narration, and captions burned into the image. All video frames
and the full audio track were decoded successfully; the render helper also
passed a short end-to-end export. `out/video-verification.json` records the checks.

## Files

- `out/codeatlas-beta.mp4` — rendered H.264/AAC video (generated, gitignored).
- `src/index.tsx` — editable 1920×1080, 24 fps Remotion composition.
- `src/scenes.json` — editorial script, commands, teaching points.
- `src/timeline.json` — generated audio timing and captions.
- `src/evidence.json` — selected, clearly labeled real output excerpts.
- `public/audio/*.mp3` — generated narration (gitignored).
- `public/audio/narration.wav` — one continuous, sample-aligned narration track.
- `public/captions.srt` — full timed subtitles.
- `TRANSCRIPT.md` / `CHAPTERS.txt` — narration and navigation.
- [Beta audit](../../docs/BETA_READINESS_2026-09-30.md) — evidence and prioritized fixes.

## Edit and render

This is an **isolated example**, outside the product's pnpm workspace patterns.
It adds no runtime dependency to CodeAtlas and does not create a browser-control
feature in the product. Remotion renders this local media artifact only.

From this directory:

```bash
npm ci
npm run typecheck
npm run studio
npm run render
```

The initial export uses 720p at 12 fps for practical local rendering of terminal
scenes; the editable composition is 1080p at 24 fps. `render.mjs` renders muted
Remotion visuals, then muxes the continuous narration with the bundled FFmpeg.
This avoids excessive fragmented audio intermediates when skipping frames.
For a 1080p/24 fps export, change its frame stride to 1 and scale to 1.
To reproduce the initial
export on this Linux host:

```bash
npm run render -- --browser-executable /usr/bin/chromium
```

Remotion can use its own pinned Chromium when the custom executable flag is
omitted. See the [official renderer documentation](https://www.remotion.dev/docs/renderer/render-media).

The MP4 requires the generated narration files. On a fresh checkout, generate
them first (commands below run from the repository root):

```bash
python3 -m venv examples/beta-video/node_modules/.video-voice
examples/beta-video/node_modules/.video-voice/bin/pip install edge-tts==7.2.8
examples/beta-video/node_modules/.video-voice/bin/python scripts/beta-video-narration.py
```

Speech generation uses a remote speech service. **Only the public tutorial
narration paragraphs** are submitted; it does not send source files, keys, or
the real repository. MP3 durations are probed with the installed Remotion Linux
compositor binary. An optional 1-based scene number regenerates one scene and
reuses the others, e.g. `scripts/beta-video-narration.py 23`.

After script edits, regenerate narration/timing, check that total duration stays
within 300–600 seconds, and review representative stills before rendering.
Use `scripts/beta-video-narration.py --mix-only` to rebuild the continuous track
from existing scene MP3s without making speech-service requests. If the system
temporary directory has limited capacity, set `TMPDIR` to a directory on a disk
with sufficient space for the render's intermediate files.

## Evidence and command coverage

`pnpm exec tsx scripts/capture-beta-demo.ts` captures offline demo results and
the complete command tree under `.release/beta-audit/`. This also indexes the
real repository locally into a separate audit database. It does not modify
production code or send repository content to AI.

The live scene shows excerpts from a successful **direct OpenCode** run with
`opencode/big-pickle` on a tiny synthetic example. The default model failed for
insufficient account funds. The video explicitly distinguishes the direct run
from the current Atlas launcher's missing output handoff. Raw responses are
retained locally in the audit evidence. No model response or successful launch
is fabricated. Free-model availability can change; see
[OpenCode's model documentation](https://opencode.ai/docs/zen).

All top-level commands are introduced, and important subcommands are grouped
into workflows. The companion reference contains every registered subcommand
and flag; the video does not claim to demonstrate every flag or perform live
installs, user-config writes, or destructive resets.

## Dependency rationale

Remotion is explicitly requested and supplies video composition, rendering, and
studio preview; Node built-ins cannot replace that requested renderer. React is
its composition runtime. TypeScript and React types support checking the example.
Versions are pinned and isolated in this example's lockfile; no existing context
engine, registry, or production abstraction is duplicated. The package registry
reported current Remotion 4.0.531 during this task, and its npm installation audit
reported no advisories. Remotion uses its own license rather than MIT; it is not
redistributed as a CodeAtlas runtime dependency. Consult the
[Remotion license](https://www.remotion.dev/license) for reuse eligibility.
