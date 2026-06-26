module.exports = {
  apps: [
    {
      name: "tasmac-cash",
      script: "node",
      args: ".next/standalone/server.js",
      cwd: "/home/ec2-user/tasmac-cash",   // update to actual path on server
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
