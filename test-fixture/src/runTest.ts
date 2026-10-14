import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath, runTests } from '@vscode/test-electron';

// Runs the suite in a real editor.
//   VSCODE_EXECUTABLE  use a local VS Code / Insiders / Cursor binary instead of downloading
//   VSCODE_VERSION     version to download when VSCODE_EXECUTABLE is unset (default "stable")
//   ANAKIN_VSIX        install this packaged .vsix and test it, instead of the source tree
//   ANAKIN_EXPECT_HOST "vscode" (default) or "cursor"; read by the suite
async function main(): Promise<void> {
  const fixturePath = path.resolve(__dirname, '..');
  const extensionPath = path.resolve(fixturePath, '..');
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anakin-vscode-test-'));
  // An empty extensions dir isolates the run from installed extensions. `--disable-extensions`
  // would too in VS Code, but Cursor also disables development extensions with it.
  const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anakin-vscode-ext-'));

  const vscodeExecutablePath =
    process.env.VSCODE_EXECUTABLE || (await downloadAndUnzipVSCode(process.env.VSCODE_VERSION || 'stable'));

  // When this script is launched from a terminal inside VS Code or Cursor, the parent's
  // ELECTRON_RUN_AS_NODE / VSCODE_* variables leak into the child and make the editor
  // binary start as plain Node ("bad option: --disable-extensions").
  for (const key of Object.keys(process.env)) {
    if (key === 'ELECTRON_RUN_AS_NODE' || (key.startsWith('VSCODE_') && key !== 'VSCODE_EXECUTABLE' && key !== 'VSCODE_VERSION')) {
      delete process.env[key];
    }
  }

  const vsix = process.env.ANAKIN_VSIX ? path.resolve(process.env.ANAKIN_VSIX) : undefined;
  if (vsix) {
    const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);
    const result = cp.spawnSync(
      cli,
      [...cliArgs, '--extensions-dir', extensionsDir, '--install-extension', vsix, '--force'],
      { encoding: 'utf8', stdio: 'pipe', shell: process.platform === 'win32' },
    );
    if (result.status !== 0) {
      throw new Error(`Installing ${vsix} failed (exit ${result.status}): ${result.stderr || result.stdout}`);
    }
    console.log(result.stdout.trim());
  }

  try {
    await runTests({
      vscodeExecutablePath,
      // The fixture hosts the suite and has the proposed API enabled; the extension itself
      // is either loaded from source or installed from the .vsix above.
      extensionDevelopmentPath: vsix ? [fixturePath] : [extensionPath, fixturePath],
      extensionTestsPath: path.join(fixturePath, 'out', 'suite', 'index.js'),
      launchArgs: [
        '--extensions-dir',
        extensionsDir,
        '--user-data-dir',
        userDataDir,
        '--enable-proposed-api',
        'anakin-test.anakin-test-fixture',
      ],
    });
  } finally {
    fs.rmSync(userDataDir, { recursive: true, force: true });
    fs.rmSync(extensionsDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('Integration tests failed:', err);
  process.exit(1);
});
