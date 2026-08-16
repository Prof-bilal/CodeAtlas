export interface ExtensionConfig6 {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  enabled: boolean;
  settings: Record<string, unknown>;
  commands: CommandConfig6[];
  keybindings: KeybindingConfig6[];
  menus: MenuConfig6[];
  views: ViewConfig6[];
  languages: LanguageConfig6[];
  themes: ThemeConfig6[];
  iconPaths: { light: string; dark: string; highContrast: string };
  activationEvents: string[];
  main: string;
  exports: Record<string, unknown>;
}
export interface CommandConfig6 {
  id: string;
  title: string;
  category: string;
  description: string;
  enabled: boolean;
  when?: string;
  icon?: string;
  arguments: Array<{ name: string; type: string; description: string; default?: unknown }>;
}
export interface KeybindingConfig6 {
  command: string;
  key: string;
  mac?: string;
  when?: string;
  args?: unknown[];
}
export interface MenuConfig6 {
  menu: string;
  group: string;
  command: string;
  when?: string;
  order?: number;
}
export interface ViewConfig6 {
  id: string;
  name: string;
  type: string;
  location: string;
  icon?: string;
  when?: string;
  dataProviders: string[];
}
export interface LanguageConfig6 {
  id: string;
  extensions: string[];
  aliases: string[];
  configuration: string;
}
export interface ThemeConfig6 {
  id: string;
  label: string;
  type: string;
  uiTheme: string;
  path: string;
}
export interface ExtensionState6 {
  activated: boolean;
  activatedAt: Date | null;
  commandsRegistered: boolean;
  viewsRegistered: boolean;
  languagesRegistered: boolean;
  themesRegistered: boolean;
  disposables: string[];
  diagnostics: Diagnostic6[];
  telemetryEvents: TelemetryEvent6[];
}
export interface Diagnostic{N> {
  id: string;
  severity: string;
  message: string;
  source: string;
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  relatedInformation?: Array<{ message: string; location: { uri: string; range: unknown } }>;
}
export interface TelemetryEvent6 {
  name: string;
  properties: Record<string, unknown>;
  timestamp: Date;
}
export class Extension6 {
  private config: ExtensionConfig6;
  private state: ExtensionState6;
  private commandHandlers: Map<string, (...args: unknown[]) => Promise<unknown>> = new Map();
  private eventHandlers: Map<string, Array<(...args: unknown[]) => void>> = new Map();
  private diagnostics: Map<string, Diagnostic6[]> = new Map();
  private outputChannel: { name: string; lines: string[]; visible: boolean };
  private statusBarItem: { text: string; tooltip: string; command: string; color: string; priority: number };
  private treeViews: Map<string, { data: unknown[]; refresh: () => void; dispose: () => void }> = new Map();
  private webviewPanels: Map<string, { title: string; content: string; visible: boolean; viewType: string }> = new Map();
  private watchedFiles: Map<string, Date> = new Map();
  private caches: Map<string, { data: unknown; expiresAt: Date }> = new Map();
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(config: ExtensionConfig6) {
    this.config = config;
    this.state = {
      activated: false, activatedAt: null, commandsRegistered: false, viewsRegistered: false,
      languagesRegistered: false, themesRegistered: false, disposables: [], diagnostics: [], telemetryEvents: [],
    };
    this.outputChannel = { name: config.name + ' Output', lines: [], visible: false };
    this.statusBarItem = { text: '', tooltip: '', command: '', color: '', priority: 100 };
  }

  async activate(): Promise<void> {
    if (this.state.activated) return;
    this.log('Activating extension ' + this.config.name);
    this.state.activated = true;
    this.state.activatedAt = new Date();
    this.registerCommands();
    this.registerViews();
    this.registerLanguages();
    this.registerThemes();
    this.track('extension.activated', { version: this.config.version });
    this.log('Extension activated successfully');
  }

  async deactivate(): Promise<void> {
    this.log('Deactivating extension ' + this.config.name);
    this.state.activated = false;
    this.disposeAll();
    this.log('Extension deactivated');
  }

  private registerCommands(): void {
    for (var cmd of this.config.commands) {
      if (cmd.enabled) this.commandHandlers.set(cmd.id, this.createCommandHandler(cmd));
    }
    this.state.commandsRegistered = true;
  }

  private createCommandHandler(cmd: CommandConfig6): (...args: unknown[]) => Promise<unknown> {
    return async function(...args: unknown[]): Promise<unknown> {
      this.log('Executing command: ' + cmd.id);
      this.track('command.executed', { commandId: cmd.id });
      return { success: true, commandId: cmd.id, args: args };
    }.bind(this);
  }

  private registerViews(): void {
    for (var view of this.config.views) {
      this.treeViews.set(view.id, { data: [], refresh: function() {}, dispose: function() {} });
    }
    this.state.viewsRegistered = true;
  }

  private registerLanguages(): void {
    this.state.languagesRegistered = true;
  }

  private registerThemes(): void {
    this.state.themesRegistered = true;
  }

  async executeCommand(commandId: string, ...args: unknown[]): Promise<unknown> {
    var handler = this.commandHandlers.get(commandId);
    if (!handler) throw new Error('Command not found: ' + commandId);
    return handler(...args);
  }

  showOutputChannel(): void {
    this.outputChannel.visible = true;
  }

  appendOutput(message: string): void {
    var timestamp = new Date().toISOString();
    this.outputChannel.lines.push('[' + timestamp + '] ' + message);
    if (this.outputChannel.lines.length > 10000) this.outputChannel.lines = this.outputChannel.lines.slice(-5000);
  }

  setStatusBarText(text: string, tooltip?: string, command?: string): void {
    this.statusBarItem.text = text;
    this.statusBarItem.tooltip = tooltip || '';
    this.statusBarItem.command = command || '';
  }

  setDiagnostics(uri: string, diagnostics: Diagnostic6[]): void {
    this.diagnostics.set(uri, diagnostics);
    this.state.diagnostics = Array.from(this.diagnostics.values()).flat();
  }

  getDiagnostics(uri?: string): Diagnostic6[] {
    if (uri) return this.diagnostics.get(uri) || [];
    return this.state.diagnostics;
  }

  createTreeView(id: string, data: unknown[]): void {
    this.treeViews.set(id, { data: data, refresh: function() {}, dispose: function() {} });
  }

  createWebviewPanel(viewType: string, title: string, content: string): void {
    this.webviewPanels.set(viewType, { title: title, content: content, visible: true, viewType: viewType });
  }

  setCache(key: string, value: unknown, ttlMs: number = 300000): void {
    this.caches.set(key, { data: value, expiresAt: new Date(Date.now() + ttlMs) });
  }

  getCache(key: string): unknown | null {
    var entry = this.caches.get(key);
    if (!entry) return null;
    if (entry.expiresAt < new Date()) { this.caches.delete(key); return null; }
    return entry.data;
  }

  watchFile(filePath: string): void {
    this.watchedFiles.set(filePath, new Date());
  }

  onDidChangeConfiguration(section: string, handler: (config: unknown) => void): () => void {
    this.eventListeners.push({ event: 'config:' + section, handler: handler });
    return function() {}.bind(this);
  }

  private eventListeners: Array<{ event: string; handler: (...args: unknown[]) => void }> = [];

  track(name: string, properties: Record<string, unknown> = {}): void {
    this.state.telemetryEvents.push({ name: name, properties: properties, timestamp: new Date() });
    if (this.state.telemetryEvents.length > 1000) this.state.telemetryEvents = this.state.telemetryEvents.slice(-500);
  }

  private disposeAll(): void {
    this.commandHandlers.clear();
    this.treeViews.clear();
    this.webviewPanels.clear();
    this.diagnostics.clear();
    this.caches.clear();
    this.watchedFiles.clear();
    this.timers.forEach(function(t) { clearTimeout(t); });
    this.timers = [];
  }

  private log(message: string): void {
    this.appendOutput(message);
  }

  getState(): ExtensionState6 { return Object.assign({}, this.state); }
  getConfig(): ExtensionConfig6 { return Object.assign({}, this.config); }
  getOutputLines(): string[] { return this.outputChannel.lines.slice(); }
  getTreeViewData(id: string): unknown[] { var tv = this.treeViews.get(id); return tv ? tv.data.slice() : []; }
  getWebviewContent(viewType: string): string { var wv = this.webviewPanels.get(viewType); return wv ? wv.content : ''; }
  destroy(): void { this.deactivate(); }
}
export function createExtension6(config: ExtensionConfig6): Extension6 { return new Extension6(config); }
export function getDefaultExtensionConfig6(): ExtensionConfig6 {
  return { id: 'extension-6', name: 'Extension 6', version: '1.0.0', description: 'A VS Code extension', author: 'Author', enabled: true, settings: {}, commands: [], keybindings: [], menus: [], views: [], languages: [], themes: [], iconPaths: { light: '', dark: '', highContrast: '' }, activationEvents: ['*'], main: './out/extension.js', exports: {} };
}