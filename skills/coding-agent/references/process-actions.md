# Process Tool Actions

Reference for managing background coding agent sessions.

## Actions

| Action | Description |
|--------|-------------|
| `list` | List all running/recent sessions |
| `poll` | Check if session is still running |
| `log` | Get session output (with optional offset/limit) |
| `write` | Send raw data to stdin |
| `submit` | Send data + newline (like typing and pressing Enter) |
| `send-keys` | Send key tokens or hex bytes |
| `paste` | Paste text (with optional bracketed mode) |
| `kill` | Terminate the session |

## Examples

```bash
# List all sessions
process action:list

# Check if session is running
process action:poll sessionId:abc123

# Get session output
process action:log sessionId:abc123

# Get output with pagination
process action:log sessionId:abc123 offset:100 limit:50

# Send raw data
process action:write sessionId:abc123 data:"y"

# Submit with Enter
process action:submit sessionId:abc123 data:"yes"

# Kill session
process action:kill sessionId:abc123
```

## Tips

- Use `log` to monitor long-running agents
- Use `submit` for interactive prompts (adds newline)
- Use `write` for raw input (no newline)
- Use `poll` to check if agent is still working before sending more input
