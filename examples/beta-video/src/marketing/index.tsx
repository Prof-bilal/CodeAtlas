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
import evidence from "../evidence.json";
import timeline from "./timeline.json";

const FPS = 24;
const mint = "#88ffd0";
const ink = "#effcf7";
const muted = "#96b2b4";
const mono = "'DejaVu Sans Mono', monospace";
const frames = timeline.reduce((total, scene) => total + scene.durationInFrames, 0);
const card: CSSProperties = {
  background: "#0c1a22ee",
  border: "1px solid #31514d",
  borderRadius: 24,
  boxShadow: "0 30px 100px #0006",
};

function Logo({ size = 36 }: { size?: number }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 18,
        alignItems: "center",
        fontSize: size,
        fontWeight: 750,
        letterSpacing: -1.5,
      }}
    >
      <svg width={size + 8} height={size + 8} viewBox="0 0 52 52" aria-hidden="true">
        <path
          d="M10 38L26 10L43 38L10 38M26 10V29L43 38M10 38L26 29"
          fill="none"
          stroke={mint}
          strokeWidth="3"
        />
        {[
          [10, 38],
          [26, 10],
          [43, 38],
          [26, 29],
        ].map(([cx, cy]) => (
          <circle key={cx + cy} cx={cx} cy={cy} r="4" fill={mint} />
        ))}
      </svg>
      CodeAtlas
    </div>
  );
}

function Graph({ frame, chaotic = false }: { frame: number; chaotic?: boolean }) {
  const nodes = [
    { x: 330, y: 270, label: "CONTEXT", file: "your project", main: true },
    { x: 115, y: 95, label: "auth.ts", file: "authenticate()" },
    { x: 545, y: 105, label: "app.ts", file: "login()" },
    { x: 80, y: 440, label: "routes.ts", file: "references" },
    { x: 585, y: 435, label: "index.ts", file: "exports" },
  ];
  return (
    <div style={{ position: "relative", width: 710, height: 590 }}>
      <svg
        width="710"
        height="590"
        style={{ position: "absolute", overflow: "visible" }}
        aria-hidden="true"
      >
        {[120, 200, 278].map((r) => (
          <circle key={r} cx="330" cy="270" r={r} fill="none" stroke="#79f4c81a" strokeWidth="1" />
        ))}
        {nodes.slice(1).map((node, i) => (
          <g
            key={node.label}
            opacity={interpolate(frame, [15 + i * 12, 40 + i * 12], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}
          >
            <path
              d={`M330 270 L${node.x} ${node.y}`}
              stroke={chaotic ? "#fa9f9580" : "#88ffd080"}
              strokeWidth="2"
              strokeDasharray={chaotic ? "8 10" : undefined}
            />
            {!chaotic && (
              <circle
                cx={330 + (node.x - 330) * ((frame % 90) / 90)}
                cy={270 + (node.y - 270) * ((frame % 90) / 90)}
                r="5"
                fill={mint}
              />
            )}
          </g>
        ))}
      </svg>
      {nodes.map((node, i) => (
        <div
          key={node.label}
          style={{
            ...card,
            position: "absolute",
            left: node.x - 110,
            top: node.y - 44 + Math.sin(frame / 35 + i) * 5,
            width: 220,
            padding: "24px 16px",
            textAlign: "center",
            borderColor: node.main ? mint : "#31514d",
            opacity: interpolate(frame, [i * 9, i * 9 + 18], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div style={{ fontFamily: mono, fontSize: 22, color: chaotic ? "#ffb7a8" : mint }}>
            {chaotic && node.main ? "???" : node.label}
          </div>
          <div style={{ color: muted, fontSize: 16, marginTop: 12 }}>
            {chaotic ? "Where does this connect?" : node.file}
          </div>
        </div>
      ))}
    </div>
  );
}

function Terminal({ ai, frame }: { ai?: boolean; frame: number }) {
  const response = evidence.find((item) => item.command.startsWith("opencode run"));
  const command = ai ? 'opencode run … "Explain this example"' : "atlas search authenticate";
  return (
    <div style={{ ...card, padding: 38, width: 820 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 38 }}>
        {["#ff9484", "#ffd987", mint].map((color) => (
          <div key={color} style={{ width: 13, height: 13, background: color, borderRadius: 20 }} />
        ))}
        <span style={{ color: muted, fontFamily: mono, marginLeft: 18, fontSize: 19 }}>
          {ai ? "OpenCode · direct fixture run" : "CodeAtlas · indexed project"}
        </span>
      </div>
      <div style={{ color: ink, fontFamily: mono, fontSize: 24, marginBottom: 32 }}>
        <span style={{ color: mint }}>$ </span>
        {command.slice(0, Math.floor(frame * 1.5))}
        <span style={{ color: mint }}>{frame % 24 < 12 ? "▌" : ""}</span>
      </div>
      {frame > 45 &&
        (ai ? (
          <div style={{ color: "#c4d8d5", lineHeight: 1.6, fontSize: 23, whiteSpace: "pre-wrap" }}>
            {response?.display.replaceAll("**", "").replaceAll("`", "")}
          </div>
        ) : (
          <>
            <div
              style={{
                border: "1px solid #3f7065",
                background: "#12392d",
                padding: 26,
                borderRadius: 14,
                display: "flex",
                justifyContent: "space-between",
                fontFamily: mono,
                fontSize: 25,
              }}
            >
              <span style={{ color: mint }}>authenticate</span>
              <span style={{ color: muted }}>symbol · 100</span>
            </div>
            <pre
              style={{
                color: "#c4d8d5",
                fontFamily: mono,
                fontSize: 23,
                lineHeight: 1.6,
                marginTop: 28,
              }}
            >
              {"export function authenticate(user: string) {\n  return user.length > 0;\n}"}
            </pre>
            <div style={{ color: mint, fontSize: 19, marginTop: 26 }}>
              SOURCE EVIDENCE → FOCUSED CONTEXT
            </div>
          </>
        ))}
      <div style={{ marginTop: 28, color: muted, fontSize: 16, letterSpacing: 1.5 }}>
        CAPTURED DEMO {ai ? "RESPONSE EXCERPTS" : "SYMBOL RESULT · SOURCE EXCERPT"}
      </div>
    </div>
  );
}

function PromoScene({ scene }: { scene: (typeof timeline)[number] }) {
  const frame = useCurrentFrame();
  const opacity = Math.min(
    interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" }),
    interpolate(frame, [scene.durationInFrames - 12, scene.durationInFrames], [1, 0], {
      extrapolateLeft: "clamp",
    }),
  );
  const caption = scene.captions.find((c) => frame / FPS >= c.start && frame / FPS < c.end);
  const centered = ["reveal", "proof", "cta"].includes(scene.kind);
  return (
    <AbsoluteFill
      style={{
        background: "radial-gradient(ellipse at 80% 30%, #123e3b 0%, #07111b 62%)",
        color: ink,
        fontFamily: "'DejaVu Sans', sans-serif",
      }}
    >
      <AbsoluteFill
        style={{
          opacity: 0.12,
          backgroundImage:
            "linear-gradient(#88ffd030 1px,transparent 1px),linear-gradient(90deg,#88ffd030 1px,transparent 1px)",
          backgroundSize: "90px 90px",
          transform: `translateY(${(frame / 12) % 90}px)`,
        }}
      />
      <div style={{ position: "absolute", top: 58, left: 80 }}>
        <Logo size={32} />
      </div>
      <div
        style={{
          position: "absolute",
          top: 72,
          right: 80,
          color: muted,
          letterSpacing: 3,
          fontSize: 16,
        }}
      >
        OPEN SOURCE · DEVELOPER PREVIEW
      </div>
      <div
        style={{
          position: "absolute",
          left: 90,
          right: 90,
          top: centered ? 190 : 250,
          opacity,
          transform: `translateY(${(1 - opacity) * 20}px)`,
          textAlign: centered ? "center" : "left",
        }}
      >
        {centered ? (
          <>
            <div style={{ color: mint, letterSpacing: 6, fontSize: 23, marginBottom: 28 }}>
              {scene.kind === "reveal"
                ? "AI CONTEXT ENGINE"
                : scene.kind === "proof"
                  ? "AUDITED BUILD · SEPTEMBER 2026"
                  : "MAP → CONTEXT → BUILD"}
            </div>
            <h1
              style={{
                fontSize: scene.kind === "cta" ? 90 : 104,
                letterSpacing: -5,
                lineHeight: 1.08,
                margin: "0 auto 40px",
                maxWidth: 1500,
              }}
            >
              {scene.title}
            </h1>
            {scene.kind === "reveal" ? (
              <>
                <div style={{ fontSize: 38, color: muted }}>Your project. Connected.</div>
                <div style={{ display: "flex", gap: 22, justifyContent: "center", marginTop: 68 }}>
                  {["SCAN", "INDEX", "SEARCH", "CONTEXT"].map((label, i) => (
                    <div
                      key={label}
                      style={{
                        ...card,
                        padding: "30px 46px",
                        fontFamily: mono,
                        color: mint,
                        fontSize: 29,
                        opacity: frame > 30 + i * 18 ? 1 : 0,
                      }}
                    >
                      {label}
                    </div>
                  ))}
                </div>
              </>
            ) : scene.kind === "proof" ? (
              <>
                <div style={{ fontSize: 156, color: mint, fontWeight: 750, letterSpacing: -8 }}>
                  1,394
                </div>
                <div style={{ fontSize: 30, color: muted }}>tests passed · 132 suites</div>
                <div
                  style={{
                    display: "flex",
                    gap: 55,
                    justifyContent: "center",
                    marginTop: 46,
                    fontSize: 25,
                  }}
                >
                  <span>Local index</span>
                  <span>Deterministic search</span>
                  <span>AI enrichment optional</span>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 34, color: muted, marginBottom: 55 }}>
                  Explore. Try. Contribute.
                </div>
                <div
                  style={{
                    ...card,
                    display: "inline-block",
                    padding: "30px 55px",
                    color: mint,
                    fontFamily: mono,
                    fontSize: 36,
                  }}
                >
                  github.com/Prof-bilal/CodeAtlas
                </div>
                <div style={{ color: muted, marginTop: 32, fontSize: 23 }}>
                  TypeScript & JavaScript context · developer preview
                </div>
              </>
            )}
          </>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "0.95fr 1.25fr",
              alignItems: "center",
              gap: 65,
            }}
          >
            <div>
              <div style={{ color: mint, fontSize: 22, letterSpacing: 4, marginBottom: 25 }}>
                {
                  (
                    {
                      hook: "THE CONTEXT GAP",
                      map: "A REUSABLE REPOSITORY MAP",
                      search: "EVIDENCE FOR THE TASK",
                      ai: "EXPORT + MCP",
                      skills: "13 BUILT-IN SKILLS",
                    } as Record<string, string>
                  )[scene.kind]
                }
              </div>
              <h1 style={{ fontSize: 88, lineHeight: 1.09, letterSpacing: -4, margin: 0 }}>
                {scene.title}
              </h1>
              <div style={{ width: 85, height: 4, background: mint, marginTop: 36 }} />
              <div style={{ color: muted, fontSize: 28, lineHeight: 1.5, marginTop: 30 }}>
                {
                  (
                    {
                      hook: "Files. Dependencies. Repeated exploration.",
                      map: "Symbols and dependencies. Stored locally. Updated incrementally.",
                      search: "Search symbols. Inspect source. Set a context budget.",
                      ai: "Connect context to the tools you use.",
                      skills: "Debugging. Research. Development.",
                    } as Record<string, string>
                  )[scene.kind]
                }
              </div>
            </div>
            {scene.kind === "hook" || scene.kind === "map" ? (
              <Graph frame={frame} chaotic={scene.kind === "hook"} />
            ) : scene.kind === "skills" ? (
              <div style={{ display: "grid", gap: 24 }}>
                {["systematic-debugging", "deep-research", "mcp-builder"].map((label, i) => (
                  <div
                    key={label}
                    style={{
                      ...card,
                      padding: "35px 40px",
                      opacity: frame > i * 20 ? 1 : 0,
                      transform: `translateX(${Math.sin(frame / 30 + i) * 4}px)`,
                    }}
                  >
                    <div style={{ fontSize: 25, fontFamily: mono, color: mint }}>{label}</div>
                    <div style={{ fontSize: 20, color: muted, marginTop: 14 }}>
                      SKILL.md · reusable instructions
                    </div>
                  </div>
                ))}
                <div style={{ fontSize: 24, color: muted, textAlign: "center" }}>
                  Discover optional tools. Choose what to install.
                </div>
              </div>
            ) : (
              <Terminal frame={frame} ai={scene.kind === "ai"} />
            )}
          </div>
        )}
      </div>
      {caption && (
        <div
          style={{ position: "absolute", left: 160, right: 160, bottom: 64, textAlign: "center" }}
        >
          <span
            style={{
              display: "inline-block",
              background: "#030b12e8",
              borderRadius: 10,
              padding: "12px 24px",
              fontSize: 25,
              lineHeight: 1.4,
            }}
          >
            {caption.text}
          </span>
        </div>
      )}
    </AbsoluteFill>
  );
}

function Marketing() {
  let cursor = 0;
  return (
    <AbsoluteFill style={{ background: "#07111b" }}>
      {timeline.map((scene) => {
        const from = cursor;
        cursor += scene.durationInFrames;
        return (
          <Sequence key={scene.kind} from={from} durationInFrames={scene.durationInFrames}>
            <PromoScene scene={scene} />
          </Sequence>
        );
      })}
      <Audio src={staticFile("marketing/audio/narration.wav")} />
    </AbsoluteFill>
  );
}
function Root() {
  return (
    <Composition
      id="CodeAtlasMarketing"
      component={Marketing}
      width={1920}
      height={1080}
      fps={FPS}
      durationInFrames={frames}
    />
  );
}
registerRoot(Root);
