module.exports = {
  apps: [
    {
      name: 'cabzone-api',
      cwd: './apps/api',
      script: 'dist/server.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 4090,
      },
    },
    {
      name: 'cabzone-worker',
      cwd: './apps/api',
      script: 'dist/worker.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'cabzone-web',
      script: './apps/web/.next/standalone/apps/web/server.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3090,
        HOSTNAME: '127.0.0.1',
      },
    },
  ],
};
