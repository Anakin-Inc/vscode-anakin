import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { activate } from '../../extension';
import { DEFAULT_SERVER_URL } from '../../config';
import * as mock from './vscode-mock';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => mock.resetMock());

describe('VS Code host', () => {
  function setup(version = '0.1.0') {
    const register = vi.fn((_id: string, _provider: any) => ({ dispose: () => undefined }));
    mock.setHost({ lm: { registerMcpServerDefinitionProvider: register } });
    const context = mock.makeContext(version);
    const api = activate(context as unknown as vscode.ExtensionContext);
    const provider = register.mock.calls[0]?.[1];
    return { api, register, provider };
  }

  it('registers the provider id declared in package.json', async () => {
    const { api, register } = setup();
    expect(api.host).toBe('vscode');
    await expect(api.registered).resolves.toBe(true);
    expect(register).toHaveBeenCalledTimes(1);
    expect(register.mock.calls[0][0]).toBe('anakin');
    const pkg = (await import('../../../package.json')).default;
    expect(pkg.contributes.mcpServerDefinitionProviders.map((p: { id: string }) => p.id)).toContain('anakin');
  });

  it('provides one HTTP server at mcp.anakin.io with no auth headers', async () => {
    const { provider } = setup('0.3.1');
    const defs = await provider.provideMcpServerDefinitions();
    expect(defs).toHaveLength(1);
    expect(defs[0]).toBeInstanceOf(mock.McpHttpServerDefinition);
    expect(defs[0].label).toBe('Anakin');
    expect(defs[0].uri.toString()).toBe(DEFAULT_SERVER_URL);
    expect(defs[0].headers).toEqual({});
    expect(defs[0].version).toBe('0.3.1');
  });

  it('fires a change event and serves the new URL when the setting changes', async () => {
    const { provider } = setup();
    const onChange = vi.fn();
    provider.onDidChangeMcpServerDefinitions(onChange);

    mock.changeSetting('anakin.serverUrl', 'https://staging.example.com/mcp');

    expect(onChange).toHaveBeenCalledTimes(1);
    const defs = await provider.provideMcpServerDefinitions();
    expect(defs[0].uri.toString()).toBe('https://staging.example.com/mcp');
  });

  it('ignores unrelated setting changes', () => {
    const { provider } = setup();
    const onChange = vi.fn();
    provider.onDidChangeMcpServerDefinitions(onChange);
    mock.changeSetting('editor.fontSize', 14);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('falls back to the hosted server and logs when the setting is insecure', async () => {
    mock.state.settings['anakin.serverUrl'] = 'http://evil.example.com/mcp';
    const { provider } = setup();
    const defs = await provider.provideMcpServerDefinitions();
    expect(defs[0].uri.toString()).toBe(DEFAULT_SERVER_URL);
    expect(mock.state.logLines.some((l) => l.startsWith('warn:') && l.includes('must use https'))).toBe(true);
  });

  it('does not show any notification on activation', () => {
    setup();
    expect(mock.window.showInformationMessage).not.toHaveBeenCalled();
    expect(mock.window.showWarningMessage).not.toHaveBeenCalled();
  });
});

describe('Cursor host', () => {
  function setup(registerImpl: (...args: any[]) => unknown = async () => undefined) {
    const registerServer = vi.fn(registerImpl);
    const unregisterServer = vi.fn(async () => undefined);
    // Cursor exposes a no-op vscode.lm stub too; it must not be used.
    const lmStub = vi.fn(() => ({ dispose: () => undefined }));
    mock.setHost({ cursor: { mcp: { registerServer, unregisterServer } }, lm: { registerMcpServerDefinitionProvider: lmStub } });
    const context = mock.makeContext();
    const api = activate(context as unknown as vscode.ExtensionContext);
    return { api, context, registerServer, unregisterServer, lmStub };
  }

  it('registers the remote server through vscode.cursor.mcp', async () => {
    const { api, registerServer, lmStub } = setup();
    await expect(api.registered).resolves.toBe(true);
    expect(api.host).toBe('cursor');
    expect(lmStub).not.toHaveBeenCalled();
    expect(registerServer).toHaveBeenCalledWith({ name: 'anakin', server: { url: DEFAULT_SERVER_URL } });
  });

  it('re-registers when the URL setting changes', async () => {
    const { registerServer, unregisterServer } = setup();
    await flush();
    mock.changeSetting('anakin.serverUrl', 'https://staging.example.com/mcp');
    await flush();
    expect(unregisterServer).toHaveBeenCalledWith('anakin');
    expect(registerServer).toHaveBeenLastCalledWith({ name: 'anakin', server: { url: 'https://staging.example.com/mcp' } });
  });

  it('unregisters on dispose', async () => {
    const { context, unregisterServer } = setup();
    context.dispose();
    await flush();
    expect(unregisterServer).toHaveBeenCalledWith('anakin');
  });

  it('logs instead of throwing when Cursor rejects the registration', async () => {
    const { api } = setup(async () => {
      throw new Error('Invalid MCP server config');
    });
    await expect(api.registered).resolves.toBe(false);
    expect(mock.state.logLines.some((l) => l.startsWith('error:') && l.includes('Invalid MCP server config'))).toBe(true);
  });
});

describe('unsupported host', () => {
  it('shows setup instructions once, then only logs', async () => {
    mock.setHost({});
    const first = activate(mock.makeContext() as unknown as vscode.ExtensionContext);
    await flush();
    expect(first.host).toBe('unsupported');
    await expect(first.registered).resolves.toBe(false);
    expect(mock.window.showWarningMessage).toHaveBeenCalledTimes(1);

    activate(mock.makeContext() as unknown as vscode.ExtensionContext);
    await flush();
    expect(mock.window.showWarningMessage).toHaveBeenCalledTimes(1);
  });

  it('copies a key-free mcpServers snippet when asked', async () => {
    mock.setHost({});
    mock.window.showWarningMessage.mockResolvedValueOnce('Copy MCP Config');
    activate(mock.makeContext() as unknown as vscode.ExtensionContext);
    await flush();
    await flush();
    expect(mock.env.clipboard.writeText).toHaveBeenCalledTimes(1);
    const copied = JSON.parse(mock.env.clipboard.writeText.mock.calls[0][0]);
    expect(copied).toEqual({ mcpServers: { anakin: { url: DEFAULT_SERVER_URL } } });
  });
});

describe('anakin.showSetup command', () => {
  it('is registered on every host', () => {
    mock.setHost({});
    activate(mock.makeContext() as unknown as vscode.ExtensionContext);
    expect(mock.commands.registerCommand).toHaveBeenCalledWith('anakin.showSetup', expect.any(Function));
  });
});
