const fs = require('fs');

function loadEnv(path) {
  try {
    return Object.fromEntries(
      fs.readFileSync(path, 'utf8')
        .split('\n')
        .filter((l) => l && !l.startsWith('#') && l.includes('='))
        .map((l) => {
          const i = l.indexOf('=');
          return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
        })
    );
  } catch {
    return {};
  }
}

const env = loadEnv('/opt/orchestrator/.env');

module.exports = {
  apps: [
    {
      name: 'orchestrator',
      script: '/opt/orchestrator/orchestrator/index.js',
      cwd: '/opt/orchestrator/orchestrator',
      restart_delay: 5000,
      max_restarts: 10,
      interpreter: 'node',
      env: { ...env },
    },
    {
      name: 'control-panel',
      script: 'npm',
      args: 'start',
      cwd: '/opt/orchestrator/control-panel',
      env: {
        ...env,
        PORT: '3000',
        NODE_ENV: 'production',
        ORCHESTRATOR_URL: 'http://localhost:3001',
      },
    },
  ],
};
