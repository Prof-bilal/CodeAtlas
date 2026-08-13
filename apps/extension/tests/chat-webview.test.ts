import { describe, expect, it } from "vitest";
import { buildChatWebviewHtml, newChatWebviewNonce } from "../src/chat/webview";

describe("newChatWebviewNonce", () => {
  it("produces a base64 nonce unique across calls", () => {
    const first = newChatWebviewNonce();
    const second = newChatWebviewNonce();
    expect(first).not.toEqual(second);
    expect(first).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  });
});

describe("buildChatWebviewHtml", () => {
  const nonce = newChatWebviewNonce();
  const html = buildChatWebviewHtml({ cspSource: "vscode-webview://test", nonce });

  it("embeds the CSP with the render nonce and the webview source", () => {
    expect(html).toContain(`<meta http-equiv="Content-Security-Policy"`);
    expect(html).toContain(`script-src 'nonce-${nonce}'`);
    expect(html).toContain(`img-src ${"vscode-webview://test"}`);
  });

  it("renders the split layout shell (sidebar, output, input bar)", () => {
    expect(html).toContain('id="sidebar"');
    expect(html).toContain('id="output"');
    expect(html).toContain('id="input-bar"');
    expect(html).toContain('id="chat-input"');
  });

  it("references the postMessage protocol handlers", () => {
    expect(html).toContain('type: "launchAgent"');
    expect(html).toContain('type: "stopAgent"');
  });

  it("loads its script with the nonce (no other inline scripts)", () => {
    const scriptTags = html.match(/<script/g) ?? [];
    expect(scriptTags).toHaveLength(1);
    expect(html).toContain(`nonce="${nonce}"`);
  });
});
