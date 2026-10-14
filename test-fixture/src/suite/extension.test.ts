import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

// `vscode.lm.mcpServerDefinitions` is the proposed `mcpServerDefinitions` API, enabled
// for the fixture extension only; it lists every MCP server VS Code knows about.
interface McpDefinitionsApi {
  readonly mcpServerDefinitions: readonly { label: string; uri?: vscode.Uri }[];
  readonly onDidChangeMcpServerDefinitions: vscode.Event<void>;
}

interface AnakinApi {
  host: string;
  serverUrl(): string;
  registered: Promise<boolean>;
}

const EXTENSION_ID = 'anakin.anakin';
const SERVER_URL = 'https://mcp.anakin.io/mcp';
// Set by runTest.ts: "vscode" (default) or "cursor" when VSCODE_EXECUTABLE points at Cursor.
const EXPECTED_HOST = process.env.ANAKIN_EXPECT_HOST || 'vscode';

async function activateAnakin(): Promise<AnakinApi> {
  const ext = vscode.extensions.getExtension<AnakinApi>(EXTENSION_ID);
  assert.ok(
    ext,
    `${EXTENSION_ID} is not loaded in ${vscode.env.appName} ${vscode.version}; loaded non-builtin extensions: ` +
      JSON.stringify(vscode.extensions.all.filter((e) => !e.id.startsWith('vscode.')).map((e) => e.id)),
  );
  return ext.activate();
}

async function waitForAnakinServer(lm: McpDefinitionsApi, timeoutMs = 30_000) {
  const find = () => lm.mcpServerDefinitions.find((d) => d.label === 'Anakin');
  const existing = find();
  if (existing) return existing;
  return new Promise<NonNullable<ReturnType<typeof find>>>((resolve, reject) => {
    const timer = setTimeout(() => {
      sub.dispose();
      reject(new Error(`Anakin not in mcpServerDefinitions after ${timeoutMs}ms: ${JSON.stringify(lm.mcpServerDefinitions.map((d) => d.label))}`));
    }, timeoutMs);
    const sub = lm.onDidChangeMcpServerDefinitions(() => {
      const found = find();
      if (found) {
        clearTimeout(timer);
        sub.dispose();
        resolve(found);
      }
    });
  });
}

describe(`Anakin extension in a real editor (expecting ${EXPECTED_HOST})`, () => {
  it('activates, picks the right MCP API and registers the hosted server', async () => {
    const api = await activateAnakin();
    assert.equal(api.host, EXPECTED_HOST);
    assert.equal(api.serverUrl(), SERVER_URL);
    assert.equal(await api.registered, true);
  });

  if (EXPECTED_HOST === 'vscode') {
    it('shows up in VS Code as an HTTP MCP server pointing at mcp.anakin.io', async function () {
      const lm = vscode.lm as unknown as McpDefinitionsApi;
      if (!Array.isArray(lm.mcpServerDefinitions)) {
        // The listing API used for this check postdates the 1.101 engine minimum.
        this.skip();
      }
      const def = await waitForAnakinServer(lm);
      assert.equal(def.uri?.toString(), SERVER_URL);
    });
  }

  it('registers the setup command', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('anakin.showSetup'));
  });
});
