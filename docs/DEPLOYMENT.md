# Deployment Guide

## Production architecture

- Application runs as a single containerized Node process.
- Frontend static build (`client/dist`) and API routes are both served by `server.js`.
- Runtime dependencies include Hostinger/MySQL database access and JWT configuration.

## Hostinger Git deployment

Use these values when Hostinger asks for project settings:

- Framework: `Express`
- Root directory: `.`
- Install command: `npm run install:all`
- Build command: `npm run build`
- Start command: `npm start`
- Output/build directory: `client/dist`

If Hostinger shows "Unsupported framework or invalid project structure", choose `Other` instead of auto-detect and use the same commands above. Confirm the repository includes the root files `package.json`, `package-lock.json`, `server.js`, `app.js`, and `index.js`. Do not point Hostinger at only the `client/` folder unless you are deploying the frontend without the API.

## Container image workflow

1. Login to ACR:
   - `az acr login -n <acr-name>`
2. Build image:
   - `docker build -t <acr-login-server>/<image-name>:<tag> .`
3. Push image:
   - `docker push <acr-login-server>/<image-name>:<tag>`

## Azure Container Apps rollout

Update running app image:

- `az containerapp update -n <app-name> -g <resource-group> --image <acr-login-server>/<image-name>:<tag>`

Check revision and running state:

- `az containerapp show -n <app-name> -g <resource-group> --query "{latestRevision:properties.latestRevisionName,readyRevision:properties.latestReadyRevisionName,state:properties.runningStatus,fqdn:properties.configuration.ingress.fqdn}" -o json`

## Required runtime configuration

Set environment variables in the runtime:

- `DATABASE_URL`
  - or `HOSTINGER_DB_HOST`
  - `HOSTINGER_DB_PORT`
  - `HOSTINGER_DB_USER`
  - `HOSTINGER_DB_PASSWORD`
  - `HOSTINGER_DB_NAME`
- `JWT_SECRET`

Recommended optional values:

- `JWT_CREATOR_EXPIRY`
- `JWT_REVIEWER_EXPIRY`
- `CLOUDFLARE_CDN_DOMAIN`
- `CLOUDFLARE_TOKEN_SECRET`
- `SENDGRID_API_KEY`
- `NOTIFICATION_FROM_EMAIL`

## Post-deploy validation (required)

1. Health endpoint:
   - `curl -I https://<domain>/api/health`
2. Canonical redirect check (`www` -> apex):
   - `curl -I https://www.<domain>/api/health`
3. Auth and API sanity:
   - `GET /api/health` should be reachable
   - Protected creator routes should reject unauthenticated access (`401`)

Expected:

- Apex health returns `200`.
- `www` host returns `301` redirect to apex.
- App reports running/ready revision in Container Apps.

## Domain behavior

Canonical host middleware enforces redirect from `www.giggidy.work` to `giggidy.work`.

## Security deployment checks

- Ensure no hardcoded secrets in repo or build context.
- Keep all secrets in Container App environment settings.
- Rotate any secret immediately if exposure is suspected.

## Rollback strategy

If a revision fails validation:

1. Roll back by redeploying the previous known-good image tag.
2. Confirm ready revision state and health endpoint.
3. Re-run canonical redirect and protected-route checks.

