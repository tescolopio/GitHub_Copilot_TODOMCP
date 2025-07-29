# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please:

1. **DO NOT** create a public GitHub issue
2. Email security concerns to: [YOUR_EMAIL]
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will acknowledge receipt within 48 hours and provide a detailed response within 7 days.

## Security Considerations

### File System Access

- The MCP server has read/write access to the configured workspace
- Always use absolute paths in production
- Never expose the server to the public internet

### Authentication

- This server relies on the MCP client for authentication
- No built-in authentication mechanism
- Designed for local development use only

### Data Privacy

- No telemetry or data collection
- All operations are local to your machine
- Session data is stored locally and never transmitted

### Best Practices

1. Run in Docker for isolation
2. Use read-only volume mounts when possible
3. Regularly update dependencies
4. Review workspace permissions
5. Never commit sensitive configuration
