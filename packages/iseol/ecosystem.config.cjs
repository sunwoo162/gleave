const path = require("node:path");

const cwd = process.env.ISEOL_RELEASE_DIR || __dirname;
const runtimeConfig = process.env.ISEOL_RUNTIME_CONFIG || path.join(cwd, "iseol-runtime.json");

module.exports = {
  apps: [
    {
      name: "iseol-bot",
      script: "dist/index.js",
      node_args: "--use-system-ca",
      cwd: __dirname,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      exp_backoff_restart_delay: 100,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "iseol-web",
      script: process.execPath,
      args: "--use-system-ca --import tsx scripts/iseol-runtime-host.ts start",
      cwd,
      autorestart: true,
      watch: false,
      max_memory_restart: "768M",
      exp_backoff_restart_delay: 100,
      env: {
        NODE_ENV: "production",
        ISEOL_RUNTIME_CONFIG: runtimeConfig,
        ISEOL_WEB_HOST: process.env.ISEOL_WEB_HOST || "127.0.0.1",
        ISEOL_WEB_PORT: process.env.ISEOL_WEB_PORT || "3000",
      },
    },
  ],
};
