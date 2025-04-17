# OpenAI Codex CLI + MCP Server

A powerful CLI for OpenAI Codex, now with Model Context Protocol (MCP) server support for integration with MCP-compatible clients.

## New: MCP Server Support

Run Codex as an MCP server to enable integration with MCP-compatible clients:

```bash
# Start the server on default port (3000)
npm run start:mcp

# Start on a specific port
npm run start:mcp -- --port 3001

# Development mode (rebuilds and runs on port 3001)
npm run dev:mcp
```

### Action Approvals

For security, when the AI agent proposes actions with potential side effects (like running shell commands or modifying files), you will be prompted in the terminal where the server is running to approve or reject the action.

- Press `Y` or select 'Approve' to allow the action
- Press `N` or select 'Reject' to block the action
- Press `R` to toggle whether this approval should be remembered for identical future actions
- Press `Esc` or `Ctrl+C` to cancel the prompt (treated as rejection)

Remembered permissions are stored in `~/.openai-codex-mcp/permissions.json`.

### MCP Project Structure

The MCP server implementation follows this structure:

- `src/`
  - `entrypoints/`: CLI and server entry points
  - `commands/`: Original CLI command implementations
  - `components/`: Ink UI components for approvals
  - `agent/`: Core agent logic
  - `services/`: Local action execution services
  - `utils/`: Utility functions
  - `types/`: TypeScript type definitions
- `tests/`: Unit and integration tests

[Original README content follows...]

---

<h1 align="center">OpenAI Codex CLI</h1>
<p align="center">Lightweight coding agent that runs in your terminal</p>

[Rest of original README...]