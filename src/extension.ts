import * as vscode from 'vscode';
import {
  DOCS_URL,
  HostKind,
  PROVIDER_ID,
  SERVER_LABEL,
  SETTING_SECTION,
  SETTING_SERVER_URL,
  detectHost,
  manualConfigSnippet,
  resolveServerUrl,
} from './config';

/** Shape of Cursor's extension MCP API (cursor.com/docs/context/mcp-extension-api). */
interface CursorMcpApi {
  registerServer(config: { name: string; server: { url: string; headers?: Record<string, string> } }): unknown;
  unregisterServer(name: string): unknown;
}

const UNSUPPORTED_NOTICE_KEY = 'anakin.unsupportedNoticeShown';

export interface AnakinExtensionApi {
  host: HostKind;
  serverUrl(): string;
  /** Resolves to whether the server was registered with the editor's MCP API. */
  registered: Promise<boolean>;
}

let log: vscode.LogOutputChannel | undefined;

export function activate(context: vscode.ExtensionContext): AnakinExtensionApi {
  log = vscode.window.createOutputChannel(SERVER_LABEL, { log: true });
  context.subscriptions.push(log);

  const host = detectHost(vscode as unknown as Parameters<typeof detectHost>[0]);
  const version: string = context.extension.packageJSON.version;
  log.info(`Anakin ${version} activating on ${vscode.env.appName} ${vscode.version} (host API: ${host})`);

  context.subscriptions.push(
    vscode.commands.registerCommand('anakin.showSetup', () => showSetup(host)),
  );

  let registered: Promise<boolean>;
  switch (host) {
    case 'cursor':
      registered = registerWithCursor(context);
      break;
    case 'vscode':
      registerWithVsCode(context, version);
      registered = Promise.resolve(true);
      break;
    case 'unsupported':
      void showUnsupportedNotice(context);
      registered = Promise.resolve(false);
      break;
  }

  return { host, serverUrl: currentServerUrl, registered };
}

export function deactivate(): void {
  log = undefined;
}

function currentServerUrl(): string {
  const raw = vscode.workspace.getConfiguration(SETTING_SECTION).get<unknown>(SETTING_SERVER_URL);
  const resolved = resolveServerUrl(raw);
  if (resolved.error) {
    log?.warn(`${resolved.error}. Using ${resolved.url} instead.`);
  }
  return resolved.url;
}

function onServerUrlChanged(context: vscode.ExtensionContext, listener: () => void): void {
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(`${SETTING_SECTION}.${SETTING_SERVER_URL}`)) {
        listener();
      }
    }),
  );
}

function registerWithVsCode(context: vscode.ExtensionContext, version: string): void {
  const changed = new vscode.EventEmitter<void>();
  context.subscriptions.push(changed);

  context.subscriptions.push(
    vscode.lm.registerMcpServerDefinitionProvider(PROVIDER_ID, {
      onDidChangeMcpServerDefinitions: changed.event,
      provideMcpServerDefinitions: () => {
        const url = currentServerUrl();
        log?.info(`Providing MCP server ${SERVER_LABEL} at ${url}`);
        // No headers: VS Code runs the OAuth flow itself from the server's 401 +
        // protected-resource metadata, so no API key is stored by this extension.
        return [new vscode.McpHttpServerDefinition(SERVER_LABEL, vscode.Uri.parse(url), {}, version)];
      },
    }),
  );

  onServerUrlChanged(context, () => {
    log?.info('anakin.serverUrl changed; refreshing MCP server definition');
    changed.fire();
  });
}

function registerWithCursor(context: vscode.ExtensionContext): Promise<boolean> {
  const api = (vscode as unknown as { cursor: { mcp: CursorMcpApi } }).cursor.mcp;

  const register = async (): Promise<boolean> => {
    const url = currentServerUrl();
    try {
      await api.registerServer({ name: PROVIDER_ID, server: { url } });
      log?.info(`Registered MCP server ${SERVER_LABEL} with Cursor at ${url}`);
      return true;
    } catch (err) {
      log?.error(`Cursor rejected MCP server registration for ${url}: ${errorMessage(err)}`);
      return false;
    }
  };
  const unregister = async (): Promise<void> => {
    try {
      await api.unregisterServer(PROVIDER_ID);
    } catch (err) {
      log?.warn(`Cursor failed to unregister MCP server: ${errorMessage(err)}`);
    }
  };

  onServerUrlChanged(context, () => {
    void unregister().then(register);
  });
  context.subscriptions.push({ dispose: () => void unregister() });
  return register();
}

async function showUnsupportedNotice(context: vscode.ExtensionContext): Promise<void> {
  log?.warn(
    `${vscode.env.appName} ${vscode.version} has no MCP server registration API for extensions; ` +
      'add the server to your MCP configuration manually (run "Anakin: Show Setup Instructions").',
  );
  if (context.globalState.get<boolean>(UNSUPPORTED_NOTICE_KEY)) {
    return;
  }
  await context.globalState.update(UNSUPPORTED_NOTICE_KEY, true);
  await showSetup('unsupported');
}

async function showSetup(host: HostKind): Promise<void> {
  const url = currentServerUrl();
  const openDocs = 'Open Docs';

  if (host === 'vscode') {
    const listServers = 'List MCP Servers';
    const pick = await vscode.window.showInformationMessage(
      `Anakin is registered as an MCP server (${url}). Open Chat in Agent mode and enable the Anakin tools; ` +
        'the first tool call asks you to sign in to anakin.io.',
      listServers,
      openDocs,
    );
    if (pick === listServers) {
      await vscode.commands.executeCommand('workbench.mcp.listServer');
    } else if (pick === openDocs) {
      await vscode.env.openExternal(vscode.Uri.parse(DOCS_URL));
    }
    return;
  }

  if (host === 'cursor') {
    const pick = await vscode.window.showInformationMessage(
      `Anakin is registered as an MCP server (${url}). Open Cursor Settings > MCP and sign in to anakin.io to enable its tools.`,
      openDocs,
    );
    if (pick === openDocs) {
      await vscode.env.openExternal(vscode.Uri.parse(DOCS_URL));
    }
    return;
  }

  const copy = 'Copy MCP Config';
  const pick = await vscode.window.showWarningMessage(
    `${vscode.env.appName} cannot register MCP servers from extensions. Add Anakin to your editor's MCP configuration instead.`,
    copy,
    openDocs,
  );
  if (pick === copy) {
    await vscode.env.clipboard.writeText(manualConfigSnippet(url));
    void vscode.window.showInformationMessage('Anakin MCP config copied to the clipboard.');
  } else if (pick === openDocs) {
    await vscode.env.openExternal(vscode.Uri.parse(DOCS_URL));
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
