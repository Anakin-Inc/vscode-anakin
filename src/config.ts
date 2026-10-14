// Pure helpers with no `vscode` import, so they can be unit tested directly.

export const PROVIDER_ID = 'anakin';
export const SERVER_LABEL = 'Anakin';
export const SETTING_SECTION = 'anakin';
export const SETTING_SERVER_URL = 'serverUrl';
export const DEFAULT_SERVER_URL = 'https://mcp.anakin.io/mcp';
export const DOCS_URL = 'https://anakin.io/docs/integrations/ide-plugins/mcp-server';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export interface ResolvedServerUrl {
  url: string;
  /** Set when the configured value was rejected and the default is used instead. */
  error?: string;
}

/**
 * Validates the `anakin.serverUrl` setting. Anything that is not https (or http on a
 * loopback host, for local development) falls back to the hosted server, so a bad
 * value can never send OAuth tokens over plain http to a remote host.
 */
export function resolveServerUrl(raw: unknown): ResolvedServerUrl {
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    return { url: DEFAULT_SERVER_URL };
  }
  if (typeof raw !== 'string') {
    return { url: DEFAULT_SERVER_URL, error: `anakin.serverUrl must be a string, got ${typeof raw}` };
  }
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { url: DEFAULT_SERVER_URL, error: `anakin.serverUrl is not a valid URL: ${raw}` };
  }
  const secure = parsed.protocol === 'https:';
  const localDev = parsed.protocol === 'http:' && LOOPBACK_HOSTS.has(parsed.hostname);
  if (!secure && !localDev) {
    return {
      url: DEFAULT_SERVER_URL,
      error: `anakin.serverUrl must use https:// (http:// is allowed only for localhost): ${raw}`,
    };
  }
  if (parsed.username || parsed.password) {
    return { url: DEFAULT_SERVER_URL, error: 'anakin.serverUrl must not contain credentials' };
  }
  return { url: parsed.toString() };
}

/** Which MCP registration API the running editor offers. */
export type HostKind = 'cursor' | 'vscode' | 'unsupported';

interface HostApiShape {
  cursor?: { mcp?: { registerServer?: unknown } };
  lm?: { registerMcpServerDefinitionProvider?: unknown };
}

/**
 * Cursor ships `vscode.lm.registerMcpServerDefinitionProvider` as a no-op stub, so its own
 * `vscode.cursor.mcp.registerServer` API must win when both are present. Editors with
 * neither (older VS Code forks) get setup instructions instead.
 */
export function detectHost(api: HostApiShape): HostKind {
  if (typeof api.cursor?.mcp?.registerServer === 'function') {
    return 'cursor';
  }
  if (typeof api.lm?.registerMcpServerDefinitionProvider === 'function') {
    return 'vscode';
  }
  return 'unsupported';
}

/** `mcp.json` snippet for editors where the extension cannot register the server itself. */
export function manualConfigSnippet(url: string): string {
  return JSON.stringify({ mcpServers: { anakin: { url } } }, null, 2);
}
