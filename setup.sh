#!/bin/bash
set -e

echo "=== Brainminds Builder Server Setup ==="

# System packages
apt update && apt install -y git curl wget build-essential unzip

# Node.js 22 via fnm
curl -fsSL https://fnm.vercel.app/install | bash -s -- --install-dir /usr/local/bin
/usr/local/bin/fnm install 22
/usr/local/bin/fnm use 22

# Symlink node/npm/npx to /usr/local/bin
FNM_DIR="$HOME/.local/share/fnm"
NODE_VERSION=$(ls "$FNM_DIR/node-versions/" | sort -V | tail -1)
ln -sf "$FNM_DIR/node-versions/$NODE_VERSION/installation/bin/node" /usr/local/bin/node
ln -sf "$FNM_DIR/node-versions/$NODE_VERSION/installation/bin/npm" /usr/local/bin/npm
ln -sf "$FNM_DIR/node-versions/$NODE_VERSION/installation/bin/npx" /usr/local/bin/npx

# GitHub CLI
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
apt update && apt install gh -y

# Global npm packages
npm install -g @anthropic-ai/claude-code @google/gemini-cli @openai/codex pm2

# Symlink AI CLIs
GLOBAL_BIN="$FNM_DIR/node-versions/$NODE_VERSION/installation/bin"
for bin in claude gemini codex pm2; do
  ln -sf "$GLOBAL_BIN/$bin" /usr/local/bin/$bin 2>/dev/null || true
done

# Directory structure
mkdir -p /opt/orchestrator/{orchestrator,control-panel,projects}

# Configure git
git config --global user.name "Brainminds Orchestrator"
git config --global user.email "ai@brianmindslab.com"
git config --global --add safe.directory '*'
git config --global credential.helper store

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps (run manually — require interactive auth):"
echo "  1. gh auth login --with-token <<< 'YOUR_GITHUB_TOKEN'"
echo "  2. Clone repo: gh repo clone brianmindslab/brainminds-control /tmp/control"
echo "  3. cp -r /tmp/control/* /opt/orchestrator/"
echo "  4. cp /opt/orchestrator/.env.example /opt/orchestrator/.env"
echo "  5. nano /opt/orchestrator/.env   # fill in real values"
echo "  6. cd /opt/orchestrator/orchestrator && npm install"
echo "  7. cd /opt/orchestrator/control-panel && npm install && npm run build"
echo "  8. pm2 start /opt/orchestrator/ecosystem.config.js && pm2 save && pm2 startup"
echo "  9. claude   # login with Claude Max account"
echo " 10. gemini   # login with Google account"
echo " 11. codex    # login with OpenAI account"
