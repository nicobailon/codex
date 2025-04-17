# OpenAI Codex MCP Server

This is a Model Context Protocol (MCP) compliant server for OpenAI Codex. It allows you to use Codex AI capabilities with any MCP client, including IDE extensions and other tools.

## Features

- **MCP Compliance**: Implements the [Model Context Protocol](https://modelcontextprotocol.github.io/protocol/specification) specification.
- **Local Execution**: Actions from Codex are executed locally on the server with user approval.
- **Interactive Approvals**: Terminal UI prompts the server operator to approve/reject actions.
- **Persistent Permissions**: Remember approved actions to streamline workflow.
- **Security**: Careful validation of all actions before execution.

## Installation

```bash
# From the project directory
npm install

# Build the project
npm run build

# Optional: Install globally
npm install -g .
```

## Usage

### Starting the MCP Server

```bash
# Using the CLI
openai-codex mcp serve --port 3000 --api-key your-openai-api-key

# From npm scripts
npm run start:mcp -- --port 3000 --api-key your-openai-api-key

# For development (without building)
node dev-server.js --port 3000 --api-key your-openai-api-key
```

The server will listen on `ws://localhost:3000` (or your configured port) for MCP client connections.

### Configuration Options

You can configure the server via command line arguments, environment variables, or config files:

```bash
# CLI arguments
openai-codex mcp serve --port 3000 --api-key your-openai-api-key --model gpt-4-turbo --temperature 0.7

# Environment variables
export OPENAI_API_KEY=your-openai-api-key
export MCP_PORT=3000
export CODEX_MODEL=gpt-4-turbo
export CODEX_TEMPERATURE=0.7
openai-codex mcp serve

# Saving a configuration
openai-codex mcp config --api-key your-openai-api-key --model gpt-4-turbo

# Showing current configuration
openai-codex mcp config --show
```

Configuration is stored in `~/.openai-codex-mcp/config.json`.

### Managing Permissions

The system remembers permissions for actions that you've approved. You can manage these permissions:

```bash
# List all saved permissions
openai-codex mcp permissions --list

# Clear a specific permission by index
openai-codex mcp permissions --clear 1
```

## Action Approvals

When the AI agent or an MCP client attempts to perform an action with side effects (like running shell commands or editing files), you'll be prompted to approve or reject the action:

```
┌────────────────────────────────────────────────────────────────────────────┐
│ 🔒 Action Approval Required                                                │
│ Context: Proposed by agent in response to request from client abc123.       │
│                                                                             │
│ Action Type: shell/runCommand                                               │
│                                                                             │
│ Details:                                                                    │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ Command: ls -la                                                          │ │
│ │ Directory: /tmp                                                          │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ Remember this decision? (r to toggle)                                       │
│ Remember: NO                                                                │
│                                                                             │
│ ● Approve (y)                                                               │
│ ○ Reject (n)                                                                │
│                                                                             │
│ Shortcuts: y to approve, n to reject, r to toggle remember, Esc to cancel   │
└────────────────────────────────────────────────────────────────────────────┘
```

You can:
- Press `y` to approve the action
- Press `n` to reject the action
- Press `r` to toggle whether to remember this decision for identical future actions
- Press `Esc` to cancel (treated as rejection)

Actions are initially rejected by default unless explicitly approved.

## Supported MCP Methods

The server supports these MCP methods:

* `initialize`: Client handshake with the server.
* `context/setContext`: Set conversation context from the client.
* `chat/request`: Process a chat message and run agent logic.
* `shell/runCommand`: Run a shell command on the server.
* `workspace/applyEdit`: Edit a file on the server.
* `file/read`: Read the contents of a file on the server.
* `file/write`: Write content to a file on the server.

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run specific tests
npm test -- -t "ActionApprovalComponent"
```

### Development Server

For development without rebuilding:

```bash
# Use the dev-server.js script
node dev-server.js

# Or with npm
npm run dev:mcp
```

## Security Considerations

This server executes code locally, so be aware of the security implications:

1. Only use with trusted AI models and clients.
2. Always review actions before approving them.
3. The server sanitizes inputs, but use caution when approving actions.
4. The system blocks potentially dangerous commands like `rm -rf /`.

## License

[MIT](LICENSE)
