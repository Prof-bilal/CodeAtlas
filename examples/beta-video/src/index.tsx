import type { CSSProperties } from "react";
import {
  AbsoluteFill,
  Audio,
  Composition,
  Sequence,
  interpolate,
  registerRoot,
  staticFile,
  useCurrentFrame,
} from "remotion";
import evidence from "./evidence.json";
import timeline from "./timeline.json";

interface Caption {
  start: number;
  end: number;
  text: string;
}
interface SceneData {
  chapter: string;
  title: string;
  kicker: string;
  commands: string[];
  points: string[];
  narration: string;
  kind: string;
  audio: string;
  durationInFrames: number;
  captions: Caption[];
}
const scenes: SceneData[] = timeline;
const FPS = 24;
const totalFrames = scenes.reduce((sum, scene) => sum + scene.durationInFrames, 0);
const ink = "#edf7f5";
const mint = "#78f3c8";
const amber = "#ffbe7a";
const mono = "'DejaVu Sans Mono', monospace";
const panel: CSSProperties = {
  border: "1px solid #294440",
  borderRadius: 24,
  background: "#0c191dcc",
  boxShadow: "0 28px 80px #0004",
};

function Terminal({ scene, frame }: { scene: SceneData; frame: number }) {
  const revealEvery = Math.max(40, (scene.durationInFrames * 0.38) / scene.commands.length);
  const count = Math.min(scene.commands.length, Math.floor(frame / revealEvery) + 1);
  const proof = evidence.find((row) => scene.commands.some((cmd) => cmd === row.command));
  return (
    <div style={{ ...panel, padding: 32, minHeight: 300 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 26 }}>
        {["#ff8e88", "#ffcc7b", mint].map((color) => (
          <div key={color} style={{ width: 12, height: 12, borderRadius: 20, background: color }} />
        ))}
        <span style={{ marginLeft: 18, color: "#7c9f9c", fontSize: 19, fontFamily: mono }}>
          {scene.kind === "ai" ? "OpenCode · actual captured run" : "terminal · your project"}
        </span>
      </div>
      {scene.commands.slice(0, count).map((command, index) => {
        const elapsed = frame - index * revealEvery;
        const typed = command.slice(0, Math.max(0, Math.floor(elapsed * 2.3)));
        return (
          <div
            key={command}
            style={{ fontFamily: mono, fontSize: 23, lineHeight: 1.62, marginBottom: 13 }}
          >
            <span style={{ color: mint, paddingRight: 14 }}>$</span>
            <span style={{ overflowWrap: "anywhere" }}>{typed}</span>
            {typed.length < command.length && frame % 18 < 9 ? "▌" : ""}
          </div>
        );
      })}
      {proof && frame > scene.durationInFrames * 0.4 ? (
        <div style={{ borderTop: "1px solid #294440", paddingTop: 20, marginTop: 20 }}>
          <div style={{ color: mint, fontSize: 17, letterSpacing: 2, marginBottom: 14 }}>
            CAPTURED EXCERPT · EXIT {proof.exitCode}
          </div>
          <pre
            style={{
              color: "#b9d1ce",
              fontFamily: mono,
              fontSize: 21,
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              lineHeight: 1.48,
              margin: 0,
              maxHeight: 240,
              overflow: "hidden",
            }}
          >
            {proof.display.split("\n").slice(0, 7).join("\n")}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

function Pipeline({ frame }: { frame: number }) {
  const labels = ["SCAN", "HASH", "PARSE", "GRAPH", "STORE", "SEARCH"];
  return (
    <div style={{ marginTop: 45 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 22 }}>
        {labels.map((label, index) => {
          const opacity = interpolate(frame - index * 16, [0, 20], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div key={label} style={{ ...panel, padding: "40px 24px", opacity }}>
              <div style={{ color: amber, fontSize: 20, marginBottom: 20 }}>0{index + 1}</div>
              <div style={{ fontSize: 29, fontFamily: mono, color: mint }}>{label}</div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 24, color: "#99b4b0", fontSize: 25 }}>
        REPOSITORY → LOCAL CONTEXT → YOUR AI TOOL
      </div>
    </div>
  );
}

function Scene({ scene, index }: { scene: SceneData; index: number }) {
  const frame = useCurrentFrame();
  const entry = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const caption = scene.captions.find(
    (item) => frame / FPS >= item.start && frame / FPS < item.end,
  );
  return (
    <AbsoluteFill
      style={{
        padding: "74px 90px 150px",
        color: ink,
        fontFamily: "'DejaVu Sans', sans-serif",
        background: "radial-gradient(ellipse at 95% 0%, #164d43 0%, #071217 58%)",
      }}
    >
      <AbsoluteFill
        style={{
          opacity: 0.15,
          backgroundImage:
            "linear-gradient(#779f9920 1px, transparent 1px), linear-gradient(90deg, #779f9920 1px, transparent 1px)",
          backgroundSize: "80px 80px",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 50,
          position: "relative",
        }}
      >
        <div style={{ fontSize: 25, fontWeight: 700, letterSpacing: -1 }}>
          <span style={{ color: mint }}>▣</span> CodeAtlas
          <span style={{ marginLeft: 22, fontSize: 16, color: "#87a9a3", letterSpacing: 3 }}>
            BETA FIELD GUIDE
          </span>
        </div>
        <div style={{ color: "#95b1ac", fontSize: 18, fontFamily: mono }}>{scene.chapter}</div>
      </div>
      <div
        style={{
          position: "relative",
          opacity: entry,
          transform: `translateY(${(1 - entry) * 24}px)`,
          display: "grid",
          gridTemplateColumns: scene.kind === "hero" ? "1.3fr 1fr" : "0.92fr 1.3fr",
          gap: 70,
        }}
      >
        <div>
          <div style={{ color: mint, letterSpacing: 3, fontSize: 18, lineHeight: 1.7 }}>
            {scene.kicker}
          </div>
          <h1
            style={{
              fontSize: scene.kind === "hero" ? 78 : 64,
              lineHeight: 1.08,
              letterSpacing: -3,
              whiteSpace: "pre-line",
              margin: "22px 0 35px",
            }}
          >
            {scene.title}
          </h1>
          <div style={{ height: 4, width: 88, background: mint, marginBottom: 32 }} />
          {scene.points.map((point, item) => (
            <div
              key={point}
              style={{
                marginBottom: 22,
                fontSize: 25,
                lineHeight: 1.45,
                color: "#b4ceca",
                display: "flex",
                gap: 15,
                opacity: frame > item * 15 ? 1 : 0,
              }}
            >
              <span style={{ color: amber }}>↗</span>
              <span>{point}</span>
            </div>
          ))}
        </div>
        <div>
          {scene.kind === "pipeline" || (scene.kind === "hero" && scene.commands.length === 0) ? (
            <Pipeline frame={frame} />
          ) : scene.kind === "cards" ? (
            <div style={{ ...panel, padding: 48, marginTop: 35 }}>
              <div style={{ color: mint, fontSize: 80, fontWeight: 700 }}>1,394</div>
              <div style={{ fontSize: 28, marginBottom: 35 }}>tests passed · 132 suites</div>
              <div style={{ fontSize: 28, color: amber, marginBottom: 24 }}>
                BROAD BETA: NOT READY
              </div>
              <div style={{ color: "#aec9c4", fontSize: 25, lineHeight: 1.55 }}>
                Working core. Reproducible release blockers.
                <br />
                See BETA_READINESS_2026-09-30.md
              </div>
            </div>
          ) : (
            <Terminal scene={scene} frame={frame} />
          )}
        </div>
      </div>
      <div style={{ position: "absolute", left: 90, right: 90, bottom: 72, textAlign: "center" }}>
        {caption ? (
          <span
            style={{
              display: "inline-block",
              background: "#030a0fe8",
              padding: "13px 26px",
              borderRadius: 12,
              fontSize: 25,
              lineHeight: 1.45,
              maxWidth: 1650,
            }}
          >
            {caption.text}
          </span>
        ) : null}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 28,
          left: 90,
          color: "#89a8a2",
          fontFamily: mono,
          fontSize: 16,
        }}
      >
        {String(index + 1).padStart(2, "0")} / {scenes.length} · SOURCE-VERIFIED WALKTHROUGH
      </div>
    </AbsoluteFill>
  );
}

function Walkthrough() {
  const frame = useCurrentFrame();
  let cursor = 0;
  return (
    <AbsoluteFill style={{ background: "#071217" }}>
      {scenes.map((scene, index) => {
        const from = cursor;
        cursor += scene.durationInFrames;
        return (
          <Sequence key={scene.title} from={from} durationInFrames={scene.durationInFrames}>
            <Scene scene={scene} index={index} />
          </Sequence>
        );
      })}
      <Audio src={staticFile("audio/narration.wav")} />
      <div
        style={{
          position: "absolute",
          bottom: 0,
          height: 5,
          background: mint,
          width: `${(frame / totalFrames) * 100}%`,
        }}
      />
    </AbsoluteFill>
  );
}

function Root() {
  return (
    <Composition
      id="CodeAtlasBeta"
      component={Walkthrough}
      fps={FPS}
      width={1920}
      height={1080}
      durationInFrames={totalFrames}
    />
  );
}
registerRoot(Root);
