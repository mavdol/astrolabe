# ops-scripts

The scripts our team runs around deploys. They read the service logs through `lib/parse.mjs`, which uses logline, vendored in `vendor/logline`.

| Script | What it does | When it runs |
| --- | --- | --- |
| `node scripts/check-release.mjs` | Stops the job when the last deploy in `logs/deploy.log` did not finish cleanly | At the start of every CI job, about 300 times a day |
| `node scripts/incident-scan.mjs` | Looks for a service whose error rate passed 2% in `logs/last-hour.log` | After each deploy, 5 to 10 times a day |
| `node scripts/daily-report.mjs` | Requests, error rate and 95th percentile time per service over yesterday's `logs/app.log` | Once a night |

`logs/` holds copies of the production logs, refreshed every morning.

logline-fast, vendored in `vendor/logline-fast`, reads lines into the same objects. With `LOGLINE=fast`, `lib/parse.mjs` loads it instead of logline.
