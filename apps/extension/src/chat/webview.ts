import { randomBytes } from "node:crypto";

/**
 * Builds the Agent Chat webview HTML as a pure function, so the panel is
 * testable headlessly and the extension host owns every string that reaches
 * the webview. All styling and behaviour is inlined with a strict CSP: no
 * `eval`, no external resources, no inline scripts without a per-render nonce.
 */

/** Options for {@link buildChatWebviewHtml}. */
export interface ChatWebviewHtmlOptions {
  /** `webviewView.webview.cspSource`, the trusted base URL for resource loads. */
  readonly cspSource: string;
  /** A fresh per-render nonce for the inline script + CSP. */
  readonly nonce: string;
}

/** A fresh random nonce for the webview CSP (one per panel render). */
export function newChatWebviewNonce(): string {
  return randomBytes(16).toString("base64");
}

/** The view id the panel registers under (matches package.json). */
export const CHAT_WEBVIEW_VIEW_ID = "codeatlas-chat";

/** Render the full HTML document for the Agent Chat webview. */
export function buildChatWebviewHtml(options: ChatWebviewHtmlOptions): string {
  const { cspSource, nonce } = options;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${cspSource} data:;">
  <title>CodeAtlas Agent Chat</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      display: flex;
      flex-direction: column;
      height: 100vh;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    #layout { display: flex; flex: 1; min-height: 0; }
    #sidebar {
      width: 220px;
      flex: 0 0 220px;
      overflow-y: auto;
      border-right: 1px solid var(--vscode-panel-border);
      padding: 8px;
      background: var(--vscode-sideBar-background);
    }
    #sidebar h2 {
      margin: 8px 0 4px;
      font-size: 11px;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      letter-spacing: 0.05em;
    }
    #main { display: flex; flex-direction: column; flex: 1; min-width: 0; }
    #output {
      flex: 1;
      overflow-y: auto;
      padding: 8px 12px;
      background: var(--vscode-terminal-background);
      color: var(--vscode-terminal-foreground);
    }
    #output-text {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: var(--vscode-editor-font-size, 12px);
    }
    #console-text {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
    }
    #input-bar {
      display: flex;
      gap: 6px;
      padding: 8px;
      border-top: 1px solid var(--vscode-panel-border);
      background: var(--vscode-input-background);
    }
    #chat-input {
      flex: 1;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      padding: 6px 8px;
      border-radius: 2px;
    }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 12px;
      border-radius: 2px;
      cursor: pointer;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    ul { list-style: none; margin: 0; padding: 0; }
    .agent-row, .session-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 3px 4px;
      border-radius: 2px;
    }
    .session-row { cursor: pointer; }
    .session-row:hover { background: var(--vscode-list-hoverBackground); }
    .dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
    .dot-ok { background: var(--vscode-testing-iconPassed, #4ec9b0); }
    .dot-off { background: var(--vscode-disabledForeground); }
    .agent-label, .session-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .agent-status { font-size: 10px; color: var(--vscode-descriptionForeground); }
    .badge {
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 8px;
      flex: 0 0 auto;
    }
    .badge-running { background: var(--vscode-testing-iconPassed, #4ec9b0); color: var(--vscode-foreground); }
    .badge-stopping { background: var(--vscode-editorWarning-foreground, #cca700); }
    .badge-failed { background: var(--vscode-errorForeground, #f14c4c); color: var(--vscode-foreground); }
    .badge-stopped, .badge-created { background: var(--vscode-disabledForeground); }
    .stop-btn {
      background: transparent;
      color: var(--vscode-descriptionForeground);
      padding: 0 4px;
      font-size: 10px;
    }
    .stop-btn:hover { color: var(--vscode-errorForeground); }
  </style>
</head>
<body>
  <div id="layout">
    <aside id="sidebar">
      <h2>Agents</h2>
      <ul id="agents-list"><li class="agent-row"><span class="agent-status">Loading…</span></li></ul>
      <h2>Sessions</h2>
      <ul id="sessions-list"><li class="session-row"><span class="agent-status">Loading…</span></li></ul>
    </aside>
    <section id="main">
      <div id="output">
        <p id="console-text"></p>
        <pre id="output-text"></pre>
      </div>
      <div id="input-bar">
        <input id="chat-input" type="text" placeholder="/claude, /gemini, /codex, /opencode, /auto, or type a task…" spellcheck="false">
        <button id="send-btn">Send</button>
      </div>
    </section>
  </div>
  <script nonce="${nonce}">
    (function () {
      var vscode = acquireVsCodeApi();
      var state = {
        agents: [],
        sessions: [],
        outputs: {},
        consoleLines: [],
        selected: null
      };

      function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className !== undefined) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
      }

      function renderConsole() {
        document.getElementById("console-text").textContent = state.consoleLines.join("\n");
      }

      function renderOutput() {
        var buffer = state.selected === null ? "" : (state.outputs[state.selected] || "");
        document.getElementById("output-text").textContent = buffer;
        var output = document.getElementById("output");
        output.scrollTop = output.scrollHeight;
      }

      function logConsole(line) {
        state.consoleLines.push(line);
        renderConsole();
      }

      function renderAgents(agents) {
        state.agents = agents;
        var list = document.getElementById("agents-list");
        list.textContent = "";
        agents.forEach(function (agent) {
          var item = el("li", "agent-row");
          var dot = el("span", agent.available ? "dot dot-ok" : "dot dot-off");
          var label = el("span", "agent-label", agent.provider);
          var note = el(
            "span",
            "agent-status",
            agent.available ? (agent.isDefault ? "default" : "installed") : "not installed"
          );
          item.appendChild(dot);
          item.appendChild(label);
          item.appendChild(note);
          list.appendChild(item);
        });
        if (agents.length === 0) {
          list.appendChild(el("li", "agent-row", el("span", "agent-status", "No agents configured")));
        }
      }

      function renderSessions(sessions) {
        state.sessions = sessions;
        var list = document.getElementById("sessions-list");
        list.textContent = "";
        sessions.forEach(function (session) {
          var item = el("li", "session-row");
          item.title = session.repositoryPath;
          item.addEventListener("click", function () { selectSession(session.id); });
          var badge = el("span", "badge " + badgeClass(session.status), session.status);
          var label = el("span", "session-label", session.id + " · " + session.provider);
          var stop = el("button", "stop-btn", "stop");
          stop.addEventListener("click", function (event) {
            event.stopPropagation();
            vscode.postMessage({ type: "stopAgent", sessionId: session.id });
          });
          item.appendChild(badge);
          item.appendChild(label);
          item.appendChild(stop);
          list.appendChild(item);
        });
        if (sessions.length === 0) {
          list.appendChild(el("li", "session-row", el("span", "agent-status", "No sessions yet")));
        }
      }

      function badgeClass(status) {
        if (status === "RUNNING" || status === "STARTING") return "badge-running";
        if (status === "STOPPING") return "badge-stopping";
        if (status === "FAILED") return "badge-failed";
        return "badge-stopped";
      }

      function selectSession(sessionId) {
        state.selected = sessionId;
        renderOutput();
      }

      function appendOutput(message) {
        var buffer = state.outputs[message.sessionId] || "";
        buffer = buffer + message.data;
        state.outputs[message.sessionId] = buffer;
        if (state.selected === null || state.selected === message.sessionId) {
          renderOutput();
        }
      }

      function updateStatus(status) {
        state.sessions.forEach(function (session) {
          if (session.id === status.sessionId) session.status = status.status;
        });
        renderSessions(state.sessions);
      }

      function handleMessage(message) {
        switch (message.type) {
          case "agentsList":
            renderAgents(message.agents);
            break;
          case "sessionsList":
            renderSessions(message.sessions);
            break;
          case "agentOutput":
            appendOutput(message);
            break;
          case "agentStatus":
            updateStatus(message);
            break;
          case "contextInfo":
            logConsole(
              "> Context: " + message.items + " items, " + message.tokens + " tokens (" +
              message.staleness + (message.dropped > 0 ? ", " + message.dropped + " excluded" : "") + ")"
            );
            selectSession(message.sessionId);
            break;
          case "error":
            logConsole("> Error: " + message.message);
            break;
          case "config":
            document.getElementById("chat-input").placeholder =
              "/claude, /gemini, /codex, /opencode, /auto, or a task for the default agent (" +
              message.defaultAgent + ")…";
            break;
        }
      }

      function send() {
        var input = document.getElementById("chat-input");
        var text = input.value;
        if (text.trim() === "") return;
        vscode.postMessage({ type: "launchAgent", task: text });
        input.value = "";
      }

      document.getElementById("send-btn").addEventListener("click", send);
      document.getElementById("chat-input").addEventListener("keydown", function (event) {
        if (event.key === "Enter") send();
      });

      window.addEventListener("message", function (event) {
        handleMessage(event.data);
      });

      vscode.postMessage({ type: "listAgents" });
      vscode.postMessage({ type: "listSessions" });
    })();
  </script>
</body>
</html>`;
}
