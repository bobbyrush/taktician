#!/bin/sh
set -e

# Ensure Claude CLI config directory exists with correct permissions
if [ ! -d "/home/taktician/.claude" ]; then
    mkdir -p /home/taktician/.claude
fi

# If CLAUDE_OAUTH_CREDENTIALS is set, write it to the credentials file
# This allows passing OAuth tokens from host (especially macOS where they're in Keychain)
if [ -n "$CLAUDE_OAUTH_CREDENTIALS" ]; then
    echo "$CLAUDE_OAUTH_CREDENTIALS" > /home/taktician/.claude/.credentials.json
    chmod 600 /home/taktician/.claude/.credentials.json
fi

# Fix permissions on Claude CLI config directory
chown -R taktician:taktician /home/taktician/.claude
chmod 700 /home/taktician/.claude

# Ensure Cursor CLI config directory exists with correct permissions
# This handles both: mounted volumes (owned by root) and empty directories
if [ ! -d "/home/taktician/.cursor" ]; then
    mkdir -p /home/taktician/.cursor
fi
chown -R taktician:taktician /home/taktician/.cursor
chmod -R 700 /home/taktician/.cursor

# Ensure OpenCode CLI config directory exists with correct permissions
# OpenCode stores config and auth in ~/.local/share/opencode/
if [ ! -d "/home/taktician/.local/share/opencode" ]; then
    mkdir -p /home/taktician/.local/share/opencode
fi
chown -R taktician:taktician /home/taktician/.local/share/opencode
chmod -R 700 /home/taktician/.local/share/opencode

# OpenCode also uses ~/.config/opencode for configuration
if [ ! -d "/home/taktician/.config/opencode" ]; then
    mkdir -p /home/taktician/.config/opencode
fi
chown -R taktician:taktician /home/taktician/.config/opencode
chmod -R 700 /home/taktician/.config/opencode

# OpenCode also uses ~/.cache/opencode for cache data (version file, etc.)
if [ ! -d "/home/taktician/.cache/opencode" ]; then
    mkdir -p /home/taktician/.cache/opencode
fi
chown -R taktician:taktician /home/taktician/.cache/opencode
chmod -R 700 /home/taktician/.cache/opencode

# Ensure npm cache directory exists with correct permissions
# This is needed for using npx to run MCP servers
if [ ! -d "/home/taktician/.npm" ]; then
    mkdir -p /home/taktician/.npm
fi
chown -R taktician:taktician /home/taktician/.npm

# If CURSOR_AUTH_TOKEN is set, write it to the cursor auth file
# On Linux, cursor-agent uses ~/.config/cursor/auth.json for file-based credential storage
# The env var CURSOR_AUTH_TOKEN is also checked directly by cursor-agent
if [ -n "$CURSOR_AUTH_TOKEN" ]; then
    CURSOR_CONFIG_DIR="/home/taktician/.config/cursor"
    mkdir -p "$CURSOR_CONFIG_DIR"
    # Write auth.json with the access token
    cat > "$CURSOR_CONFIG_DIR/auth.json" << EOF
{
  "accessToken": "$CURSOR_AUTH_TOKEN"
}
EOF
    chmod 600 "$CURSOR_CONFIG_DIR/auth.json"
    chown -R taktician:taktician /home/taktician/.config
fi

# Switch to taktician user and execute the command
exec gosu taktician "$@"
