// Minimal stand-in for the `vscode` module, aliased in vitest.config.ts. Each test calls
// `resetMock()` and then shapes `state` (host APIs, settings) before activating.
import { vi } from 'vitest';

type Listener<T> = (e: T) => void;

export class EventEmitter<T> {
  private listeners: Listener<T>[] = [];
  event = (listener: Listener<T>) => {
    this.listeners.push(listener);
    return { dispose: () => (this.listeners = this.listeners.filter((l) => l !== listener)) };
  };
  fire(e: T): void {
    for (const l of this.listeners) l(e);
  }
  dispose(): void {
    this.listeners = [];
  }
}

export class Uri {
  private constructor(private readonly value: string) {}
  static parse(value: string): Uri {
    return new Uri(value);
  }
  toString(): string {
    return this.value;
  }
}

export class McpHttpServerDefinition {
  constructor(
    public label: string,
    public uri: Uri,
    public headers: Record<string, string> = {},
    public version?: string,
  ) {}
}

export const state = {
  settings: {} as Record<string, unknown>,
  configListeners: [] as Listener<{ affectsConfiguration(s: string): boolean }>[],
  logLines: [] as string[],
  globalState: new Map<string, unknown>(),
};

const logger = (level: string) => (msg: string) => state.logLines.push(`${level}: ${msg}`);

export const window = {
  createOutputChannel: vi.fn(() => ({
    info: logger('info'),
    warn: logger('warn'),
    error: logger('error'),
    dispose: () => undefined,
  })),
  showInformationMessage: vi.fn(async (..._args: unknown[]) => undefined as string | undefined),
  showWarningMessage: vi.fn(async (..._args: unknown[]) => undefined as string | undefined),
};

export const commands = {
  registerCommand: vi.fn((_id: string, _cb: (...args: unknown[]) => unknown) => ({ dispose: () => undefined })),
  executeCommand: vi.fn(async () => undefined),
};

export const workspace = {
  getConfiguration: vi.fn((section: string) => ({
    get: (key: string) => state.settings[`${section}.${key}`],
  })),
  onDidChangeConfiguration: vi.fn((listener: Listener<{ affectsConfiguration(s: string): boolean }>) => {
    state.configListeners.push(listener);
    return { dispose: () => undefined };
  }),
};

export const env = {
  appName: 'Test Editor',
  clipboard: { writeText: vi.fn(async (_text: string) => undefined) },
  openExternal: vi.fn(async (_uri: Uri) => true),
};

export const version = '1.142.0';

// Host-specific APIs; tests assign these to simulate VS Code, Cursor or an older fork.
export let lm: { registerMcpServerDefinitionProvider?: (...args: any[]) => { dispose(): void } } | undefined;
export let cursor: { mcp: { registerServer: (...args: any[]) => unknown; unregisterServer: (...args: any[]) => unknown } } | undefined;

export function setHost(next: { lm?: typeof lm; cursor?: typeof cursor }): void {
  lm = next.lm;
  cursor = next.cursor;
}

export function changeSetting(key: string, value: unknown): void {
  state.settings[key] = value;
  for (const l of state.configListeners) l({ affectsConfiguration: (s: string) => s === key });
}

export function resetMock(): void {
  state.settings = {};
  state.configListeners = [];
  state.logLines = [];
  state.globalState = new Map();
  lm = undefined;
  cursor = undefined;
  vi.clearAllMocks();
}

export function makeContext(version = '0.1.0') {
  const subscriptions: { dispose(): unknown }[] = [];
  return {
    subscriptions,
    extension: { packageJSON: { version } },
    globalState: {
      get: (k: string) => state.globalState.get(k),
      update: async (k: string, v: unknown) => void state.globalState.set(k, v),
    },
    dispose: () => subscriptions.forEach((s) => s.dispose()),
  };
}
