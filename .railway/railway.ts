import { defineRailway, project, service } from "railway/iac";

export default defineRailway(() => {
  const web = service("web", {
    build: "npm run build",
    start: "node server.js",
    healthcheck: "/api/health",
    healthcheckTimeout: 120,
    env: {
      NODE_ENV: "production",
      TZ: "Europe/Rome",
    },
  });

  return project("lipb-vfr-windows", {
    resources: [web],
  });
});
