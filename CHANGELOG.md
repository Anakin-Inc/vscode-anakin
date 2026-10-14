# Changelog

## 0.1.0

- Registers the hosted Anakin MCP server (`https://mcp.anakin.io/mcp`, OAuth sign-in) with
  VS Code through `mcpServerDefinitionProviders`.
- Registers the same server in Cursor through `vscode.cursor.mcp.registerServer`.
- Other editors: one-time notice with a copyable `mcpServers` config.
- `anakin.serverUrl` setting (machine scope, https only except localhost).
- `Anakin: Show Setup Instructions` command.
