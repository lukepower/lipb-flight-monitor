import { defineRailway, image, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const historyData = volume("history-data");

  const web = service("web", {
    build: "npm run build",
    start: "node server.js",
    healthcheck: "/api/health",
    healthcheckTimeout: 120,
    volumeMounts: {
      "/data": historyData,
    },
    env: {
      NODE_ENV: "production",
      TZ: "Europe/Rome",
      HISTORY_DIR: "/data/history",
      // Set CRON_SECRET on web in the Railway dashboard / CLI.
      // history-cron references ${{web.CRON_SECRET}}.
    },
  });

  // Every 10 minutes (UTC). Must exit when done (restartPolicy NEVER).
  // Alpine + sh so env vars expand; curlimages/curl ENTRYPOINT breaks that.
  const historyCron = service("history-cron", {
    source: image("alpine:3.21"),
    deploy: {
      cronSchedule: "*/10 * * * *",
      restartPolicyType: "NEVER",
      startCommand:
        'sh -c "apk add --no-cache curl >/dev/null && curl -fsS -X POST \\"$SNAPSHOT_URL\\" -H \\"Authorization: Bearer $CRON_SECRET\\" --max-time 90"',
    },
    env: {
      CRON_SECRET: web.env.CRON_SECRET,
      SNAPSHOT_URL: {
        type: "literal",
        value:
          "https://${{ web.RAILWAY_PUBLIC_DOMAIN }}/api/history/snapshot",
      },
    },
  });

  return project("lipb-vfr-windows", {
    resources: [web, historyData, historyCron],
  });
});
