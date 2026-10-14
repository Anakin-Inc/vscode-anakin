# Anakin for VS Code

Adds the hosted [Anakin](https://anakin.io) MCP server to VS Code, so the chat agent can
scrape, crawl, search and research the web. You sign in to anakin.io with OAuth the first
time a tool runs. There is no API key to paste and the extension stores no credentials.

## What the agent gets

The server at `https://mcp.anakin.io/mcp` exposes the Anakin tools, including:

| Tool | What it does |
|---|---|
| `scrape` | Fetch one URL as markdown, or as structured JSON extracted by AI. Can render JavaScript-heavy pages in a browser. |
| `search` | Web search with titles, URLs and snippets. |
| `map` | List the URLs reachable on a domain. |
| `crawl` | Crawl a site and return the content of each page. |
| `agentic_search` | Multi-step research that searches, reads sources and returns a cited answer. |
| `browser_task` | Have a hosted browser carry out a task described in plain language. |
| `monitor_create`, `monitor_changes` | Watch a page and report what changed. |
| `wire_catalog`, `wire_read_action`, `wire_write_action` | Run prebuilt actions against supported websites. |

The full, current list is shown in VS Code once the server is running (Chat view, then
**Configure Tools**).

## Requirements

- VS Code 1.101 or later with chat (GitHub Copilot) enabled.
- An Anakin account. The free tier includes 500 credits and needs no card; sign up at
  [anakin.io](https://anakin.io) or during the first sign-in.

## Getting started

1. Install the extension.
2. Open the Chat view and switch to **Agent** mode.
3. Ask for something that needs the web, for example
   `Use Anakin to scrape https://example.com and summarize it`.
4. On the first tool call, VS Code asks you to sign in to anakin.io. Approve the consent
   screen and the call continues.

You can also manage the server from the Command Palette: **MCP: List Servers**, then
**Anakin**, to start, stop or sign out. **Anakin: Show Setup Instructions** shows these
steps again.

## Cursor and other VS Code-based editors

The extension is also published on [Open VSX](https://open-vsx.org).

- **Cursor**: the extension registers the server through Cursor's own MCP extension API.
  Open Cursor Settings, then MCP, and sign in to anakin.io when prompted.
- **Editors without an MCP extension API**: the extension shows a one-time notice with a
  **Copy MCP Config** button. Paste the copied block into the editor's MCP configuration:

  ```json
  {
    "mcpServers": {
      "anakin": { "url": "https://mcp.anakin.io/mcp" }
    }
  }
  ```

## Settings

| Setting | Default | Description |
|---|---|---|
| `anakin.serverUrl` | `https://mcp.anakin.io/mcp` | MCP server URL. Machine-scoped, so a workspace cannot override it. Must be `https://` (`http://` is accepted only for `localhost`). |

## Privacy

The extension only tells the editor where the Anakin MCP server is. Sign-in, token storage
and tool calls are handled by the editor's built-in MCP client. Pages you ask the agent to
fetch are processed by Anakin under the [Anakin privacy policy](https://anakin.io/privacy).

## Development

```sh
npm ci
npm run compile
npm test                    # unit tests (vitest)
npm run test:integration    # runs the extension in a real VS Code (downloads stable)
npm run package             # builds anakin-<version>.vsix
```

Set `VSCODE_EXECUTABLE` to run the integration tests against a local VS Code build instead
of downloading one.

## Links

- Docs: <https://anakin.io/docs/integrations/ide-plugins/mcp-server>
- Issues: <https://github.com/Anakin-Inc/vscode-anakin/issues>
- Standalone MCP server (stdio, API key): [`@anakin-io/mcp`](https://www.npmjs.com/package/@anakin-io/mcp)

## License

Apache-2.0
