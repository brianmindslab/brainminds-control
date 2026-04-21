module.exports = {
  apps: [
    {
      name: 'orchestrator',
      script: '/opt/orchestrator/orchestrator/index.js',
      cwd: '/opt/orchestrator/orchestrator',
      env_file: '/opt/orchestrator/.env',
      restart_delay: 5000,
      max_restarts: 10,
      interpreter: 'node',
    },
    {
      name: 'control-panel',
      script: 'npm',
      args: 'start',
      cwd: '/opt/orchestrator/control-panel',
      env_file: '/opt/orchestrator/.env',
      env: {
        PORT: 3000,
        NODE_ENV: 'production',
        ORCHESTRATOR_URL: 'http://localhost:3001',
      },
    },
  ],
};
