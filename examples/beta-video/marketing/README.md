# CodeAtlas marketing film

A separate **1 minute 44 second** promotional video. The original 9:36 tutorial,
its MP4, and its previously delivered source archive are preserved.

The film opens with the context gap, introduces the local repository map,
demonstrates symbol search and a captured OpenCode response, introduces Skills,
and closes with a GitHub invitation. It uses animated dependency diagrams,
English synthetic narration, burned-in captions, and a quiet original synthesized
instrumental score. No third-party music recording or stock footage is used.

The product is labeled **developer preview**. Claims refer to the audited source
on 2026-09-30: TypeScript/JavaScript context, local indexing, deterministic search,
incremental updates, context export/MCP, and 13 built-in Skills. The 1,394-test
figure is an audit snapshot. No performance improvement or public release
readiness is asserted. The OpenCode excerpt is the previously captured direct
run on the synthetic fixture; it is not evidence of a working Atlas session
output handoff. See the [beta audit](../../../docs/BETA_READINESS_2026-09-30.md).

## Edit and export

From `examples/beta-video`:

```bash
npm ci
npm run typecheck
npm run marketing:studio
npm run marketing:render -- --browser-executable /usr/bin/chromium
```

The renderer produces `out/codeatlas-marketing.mp4` at 1280×720, 24 fps, with
H.264 video and AAC audio. It renders muted Remotion visuals first, then muxes
the continuous narration/music track. Remove the executable flag to use
Remotion's managed Chromium. Scale can be changed in `render.mjs`.

Edit `src/marketing/scenes.json` for narration and `src/marketing/index.tsx` for
visuals. Regenerate timing, captions, and the audio track from the repository root:

```bash
examples/beta-video/node_modules/.video-voice/bin/python scripts/beta-video-narration.py --marketing
```

The Python environment requires `edge-tts==7.2.8`; setup instructions are in
the parent README. Only public narration text is sent to the speech service.
`--marketing --mix-only` reuses existing MP3s and rebuilds the original score
without a speech request. Marketing outputs use separate paths; default script
behavior still targets the tutorial. `CHAPTERS.txt`, `TRANSCRIPT.md`, and
`public/marketing/captions.srt` accompany the editable film.
