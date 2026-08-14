module.exports = {
  apps: [
    {
      name: "rage-optimiser-backend",
      script: "npm",
      args: "start",
      cwd: "./backend",
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 5000,
        WS_PORT: 5001
      }
    }
  ]
}

