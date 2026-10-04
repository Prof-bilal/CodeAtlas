import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * MCP Apps UI resources for the ChatGPT/Codex plugin.
 *
 * Each widget is a self-contained HTML document served over `resources/read`
 * at a stable `ui://` URI and bound to a tool through `_meta.ui.resourceUri`
 * (plus the ChatGPT-specific `openai/outputTemplate` key for compatibility).
 * Widgets are an **enhancement only** — every tool returns complete structured
 * output, so the plugin remains fully usable with no UI support.
 *
 * Hosts that implement the Apps SDK inject the tool result on
 * `window.openai.toolOutput`; widgets degrade gracefully to a compact
 * placeholder when that global is absent.
 */

/** Base URI for every CodeAtlas widget. */
export const UI_RESOURCES = {
  base: "ui://codeatlas/",
} as const;

/** Mime type for MCP Apps HTML content. */
const MCP_APP_MIME = "text/html;profile=mcp-app";

export interface UiResourceDefinition {
  readonly name: string;
  readonly uri: string;
  readonly title: string;
  readonly description: string;
  readonly html: string;
}

/** Shared CSS + helpers injected into every widget. */
const SHARED = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 14px 16px;
    font: 13px/1.5 ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    background: #0b0f14; color: #d7e0ea;
  }
  .head { display:flex; align-items:baseline; gap:10px; margin-bottom:10px; }
  .brand { font-size:11px; letter-spacing:.18em; color:#2dd4a7; font-weight:700; }
  .title { font-size:12px; color:#8b98a5; text-transform:uppercase; letter-spacing:.08em; }
  .panel { border:1px solid #1f2a37; border-radius:8px; background:#111820; padding:12px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(96px,1fr)); gap:10px; }
  .metric { border:1px solid #1f2a37; border-radius:6px; padding:8px 10px; background:#0e141b; }
  .metric .n { font-size:18px; font-weight:700; color:#e6edf3; }
  .metric .l { font-size:10px; color:#7d8b99; text-transform:uppercase; letter-spacing:.06em; }
  .row { display:flex; gap:8px; padding:7px 0; border-top:1px solid #18212c; align-items:baseline; }
  .row:first-child { border-top:0; }
  .path { color:#e6edf3; word-break:break-all; }
  .sym { color:#2dd4a7; font-weight:600; }
  .muted { color:#7d8b99; font-size:11px; }
  .pill { display:inline-block; padding:1px 7px; border-radius:999px; font-size:10px;
          border:1px solid #2a3644; color:#9aa7b4; margin-right:6px; }
  .find { padding:4px 0; color:#a9b6c3; }
  .find.warn { color:#e3b341; }
  .flow { margin-top:4px; }
  .flow .node { color:#e6edf3; }
  .flow .arr { color:#2dd4a7; margin-left:14px; }
  pre { margin:0; white-space:pre-wrap; word-break:break-word; color:#c9d3dd; }
  .btn { margin-top:10px; background:#16202b; color:#2dd4a7; border:1px solid #2a3644;
         border-radius:6px; padding:5px 10px; font:inherit; cursor:pointer; }
  .btn:hover { border-color:#2dd4a7; }
  .empty { color:#7d8b99; padding:8px 0; }
`;

/** Wrap a widget renderer into a full HTML document. */
function page(title: string, _body: string, render: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>CodeAtlas — ${title}</title><style>${SHARED}</style></head>
<body>
<div class="head"><span class="brand">CODEATLAS</span><span class="title">${title}</span></div>
<div id="root" class="panel"><div class="empty">Loading CodeAtlas result…</div></div>
<script>
(function () {
  var data = (window.openai && window.openai.toolOutput) || null;
  var root = document.getElementById('root');
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }
  function callTool(name, args) {
    try {
      if (window.openai && typeof window.openai.callTool === 'function') {
        window.openai.callTool(name, args);
        return true;
      }
    } catch (e) { /* no host tool bridge */ }
    return false;
  }
  function followUp(prompt) {
    try {
      if (window.openai && typeof window.openai.sendFollowUpMessage === 'function') {
        window.openai.sendFollowUpMessage({ prompt: prompt });
        return true;
      }
    } catch (e) { /* no host message bridge */ }
    return false;
  }
  try {
    root.innerHTML = (${render})(data, esc, callTool, followUp);
  } catch (e) {
    root.innerHTML = '<div class="empty">Could not render CodeAtlas result.</div>';
  }
})();
</script>
</body></html>`;
}

/** Repository summary widget — the `analyze_repository` result. */
const repositorySummary = page(
  "Repository summary",
  "",
  `function (d, esc) {
    if (!d || !d.counts) return '<div class="empty">No repository data.</div>';
    var m = function (n, l) {
      return '<div class="metric"><div class="n">' + esc(n) + '</div><div class="l">' + esc(l) + '</div></div>';
    };
    var out = '<div class="grid">'
      + m(d.counts.files, 'Files') + m(d.counts.symbols, 'Symbols')
      + m(d.counts.modules, 'Modules') + m(d.counts.dependencies, 'Deps') + '</div>';
    if (d.repository) {
      out += '<div class="row"><span class="muted">repo</span><span class="path">' + esc(d.repository.name) + '</span>'
        + (d.repository.framework ? '<span class="pill">' + esc(d.repository.framework) + '</span>' : '') + '</div>';
    }
    if (d.areas && d.areas.length) {
      out += '<div class="row"><span class="muted">areas</span><span class="path">'
        + d.areas.map(function (a) { return esc(a.name); }).join(' · ') + '</span></div>';
    }
    var findings = (d.findings || []).map(function (f) {
      var warn = /unresolved|circular|no parsed|no dependency/i.test(f);
      return '<div class="find ' + (warn ? 'warn' : '') + '">' + (warn ? '! ' : '+ ') + esc(f) + '</div>';
    }).join('');
    if (findings) out += '<div class="row" style="display:block"><span class="muted">findings</span>' + findings + '</div>';
    out += '<button class="btn" id="explore">Find where a feature lives</button>';
    setTimeout(function () {
      var b = document.getElementById('explore');
      if (b) b.onclick = function () { if (!callTool('search_repository', { query: 'feature' })) b.textContent = 'Use search_repository in chat'; };
    }, 0);
    return out;
  }`,
);

/** Search results / explanation widget — `search_repository` + `explain_repository`. */
const searchResults = page(
  "Relevant code",
  "",
  `function (d, esc) {
    if (!d) return '<div class="empty">No results.</div>';
    var rows = d.results || d.items || [];
    if (!rows.length) return '<div class="empty">No matches for "' + esc(d.query || d.question || '') + '".</div>';
    var html = rows.map(function (r) {
      var label = r.symbolKind ? '<span class="pill">' + esc(r.symbolKind) + '</span>' : '';
      var title = r.title ? '<span class="sym">' + esc(r.title) + '</span> ' : '';
      var loc = r.line ? '<span class="muted">:' + esc(r.line) + '</span>' : '';
      return '<div class="row"><div style="flex:1">' + label + title + esc(r.path || '') + loc
        + (r.reason ? '<div class="muted">' + esc(r.reason) + '</div>' : '') + '</div></div>';
    }).join('');
    if (d.relationships && d.relationships.length) {
      var rel = d.relationships.slice(0, 8).map(function (e) {
        return '<div class="row"><span class="muted">' + esc(e.relation) + '</span><span class="path">'
          + esc(e.fromLabel) + ' → ' + esc(e.toLabel) + '</span></div>';
      }).join('');
      html += '<div class="row" style="display:block"><span class="muted">relationships</span>' + rel + '</div>';
    }
    if (d.conclusion) html += '<div class="row" style="display:block"><span class="muted">conclusion</span><div class="find">' + esc(d.conclusion) + '</div></div>';
    return html;
  }`,
);

/** Change-impact widget — the `impact_analysis` result. */
const impactAnalysis = page(
  "Change impact",
  "",
  `function (d, esc) {
    if (!d || !d.affected) return '<div class="empty">No impact data.</div>';
    var out = '<div class="grid"><div class="metric"><div class="n">' + esc(d.affected.length)
      + '</div><div class="l">Affected</div></div><div class="metric"><div class="n">' + esc(d.risk.directDependents)
      + '</div><div class="l">Direct</div></div><div class="metric"><div class="n">' + esc(d.risk.affectedTests)
      + '</div><div class="l">Tests</div></div><div class="metric"><div class="n">' + esc(d.risk.level)
      + '</div><div class="l">Risk</div></div></div>';
    var subject = (d.subjects && d.subjects[0]) || 'subject';
    var chain = d.affected.slice(0, 6).map(function (a) {
      return '<div class="node">' + esc(a.path) + (a.isTestFile ? ' <span class="pill">test</span>' : '') + '</div>';
    }).join('<div class="arr">↓</div>');
    out += '<div class="flow"><div class="node">' + esc(subject) + '</div><div class="arr">↓</div>' + chain + '</div>';
    return out;
  }`,
);

/** Code context widget — the `get_context` result. */
const contextView = page(
  "Code context",
  "",
  `function (d, esc) {
    if (!d || !d.resolved) return '<div class="empty">No context.</div>';
    var head = '<div class="row"><span class="pill">' + esc(d.resolved.kind) + '</span><span class="path">'
      + esc(d.resolved.path) + (d.resolved.name ? ' — ' + esc(d.resolved.name) : '') + '</span></div>';
    var code = '<pre>' + esc(d.content || '') + '</pre>';
    return head + code + (d.truncated ? '<div class="muted">truncated</div>' : '');
  }`,
);

/** Every widget this plugin serves. */
export const UI_RESOURCES_LIST: readonly UiResourceDefinition[] = [
  {
    name: "repository-summary",
    uri: `${UI_RESOURCES.base}repository-summary.html`,
    title: "Repository summary",
    description: "CodeAtlas repository overview: counts, areas, findings.",
    html: repositorySummary,
  },
  {
    name: "search-results",
    uri: `${UI_RESOURCES.base}search-results.html`,
    title: "Relevant code",
    description: "CodeAtlas ranked file/symbol results for a search.",
    html: searchResults,
  },
  {
    name: "explanation",
    uri: `${UI_RESOURCES.base}explanation.html`,
    title: "Architecture explanation",
    description: "CodeAtlas architecture explanation: relevant code and relationships.",
    html: searchResults,
  },
  {
    name: "impact-analysis",
    uri: `${UI_RESOURCES.base}impact-analysis.html`,
    title: "Change impact",
    description: "CodeAtlas change blast radius and risk.",
    html: impactAnalysis,
  },
  {
    name: "context-view",
    uri: `${UI_RESOURCES.base}context-view.html`,
    title: "Code context",
    description: "CodeAtlas resolved code context for a file or symbol.",
    html: contextView,
  },
];

/** Register every widget as a readable MCP resource. */
export function registerUiResources(server: McpServer): void {
  for (const widget of UI_RESOURCES_LIST) {
    server.registerResource(
      widget.name,
      widget.uri,
      {
        title: widget.title,
        description: widget.description,
        mimeType: MCP_APP_MIME,
      },
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: MCP_APP_MIME,
            text: widget.html,
          },
        ],
      }),
    );
  }
}
