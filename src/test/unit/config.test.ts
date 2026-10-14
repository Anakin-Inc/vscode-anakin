import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_URL, detectHost, manualConfigSnippet, resolveServerUrl } from '../../config';

describe('resolveServerUrl', () => {
  it('uses the hosted server when unset or blank', () => {
    expect(resolveServerUrl(undefined)).toEqual({ url: DEFAULT_SERVER_URL });
    expect(resolveServerUrl(null)).toEqual({ url: DEFAULT_SERVER_URL });
    expect(resolveServerUrl('   ')).toEqual({ url: DEFAULT_SERVER_URL });
  });

  it('accepts https URLs and trims whitespace', () => {
    expect(resolveServerUrl(' https://staging.example.com/mcp ')).toEqual({ url: 'https://staging.example.com/mcp' });
  });

  it('accepts http only on loopback hosts', () => {
    expect(resolveServerUrl('http://localhost:8080/mcp')).toEqual({ url: 'http://localhost:8080/mcp' });
    expect(resolveServerUrl('http://127.0.0.1:8080/mcp')).toEqual({ url: 'http://127.0.0.1:8080/mcp' });
    expect(resolveServerUrl('http://[::1]:8080/mcp')).toEqual({ url: 'http://[::1]:8080/mcp' });
  });

  it.each([
    ['http://mcp.example.com/mcp', /must use https/],
    ['http://localhost.evil.com/mcp', /must use https/],
    ['ftp://mcp.anakin.io/mcp', /must use https/],
    ['not a url', /not a valid URL/],
    ['https://user:pass@mcp.anakin.io/mcp', /credentials/],
  ])('rejects %s and falls back to the default', (raw, message) => {
    const result = resolveServerUrl(raw);
    expect(result.url).toBe(DEFAULT_SERVER_URL);
    expect(result.error).toMatch(message);
  });

  it('rejects non-string values', () => {
    expect(resolveServerUrl(42)).toEqual({ url: DEFAULT_SERVER_URL, error: expect.stringMatching(/must be a string/) });
  });
});

describe('detectHost', () => {
  const fn = () => undefined;

  it('prefers Cursor when its API exists, even though Cursor also stubs vscode.lm', () => {
    expect(detectHost({ cursor: { mcp: { registerServer: fn } }, lm: { registerMcpServerDefinitionProvider: fn } })).toBe('cursor');
  });

  it('uses the VS Code provider API when present', () => {
    expect(detectHost({ lm: { registerMcpServerDefinitionProvider: fn } })).toBe('vscode');
  });

  it('reports unsupported editors', () => {
    expect(detectHost({})).toBe('unsupported');
    expect(detectHost({ lm: {} })).toBe('unsupported');
    expect(detectHost({ cursor: { mcp: {} } })).toBe('unsupported');
  });
});

describe('manualConfigSnippet', () => {
  it('produces an mcpServers block with no env or key', () => {
    expect(JSON.parse(manualConfigSnippet(DEFAULT_SERVER_URL))).toEqual({
      mcpServers: { anakin: { url: DEFAULT_SERVER_URL } },
    });
  });
});
