# MCP Server Configuration

## Available Servers

### Log Analyzer (SRE)
- **Server:** sre_log_analyzer
- **Capability:** Real-time log analysis and RCA
- **Transport:** stdio

### Output Evaluator (QA)
- **Server:** qa_evaluator
- **Capability:** LLM output validation
- **Transport:** stdio

### Slack Notifier (Comms)
- **Server:** comms_slack
- **Capability:** Slack integration for notifications
- **Transport:** http

## Configuration Format

```json
{
  "mcpServers": {
    "sre_log_analyzer": {
      "command": "node",
      "args": ["./skills/sre/log-analyzer.js"],
      "transport": "stdio"
    }
  }
}
```
