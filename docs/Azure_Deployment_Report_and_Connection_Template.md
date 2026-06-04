# Azure Deployment Report + Connection Template
## Project: CreativeSwipe
## Environment: [dev | staging | prod]
## Deployment Date: [YYYY-MM-DD HH:mm UTC]
## Release/Tag: [git tag or commit]
## Owner: [Name]

---

## 1) Deployment Summary
- **Objective:** [What this deployment delivered]
- **Status:** Success / Partial / Failed
- **User impact window:** [start-end]
- **Rollback required:** Yes / No
- **Final production URL:** [https://<your-swa>.azurestaticapps.net]

---

## 2) Azure Resource Inventory
- Subscription ID: [xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx]
- Resource Group: [rg-name]
- Region: [region]

### Core resources
- Azure Static Web App: [name]
- Azure Functions (integrated): [name if separate/app-level reference]
- Azure Cosmos DB account: [name]
- Cosmos DB database: [creativeswipe]
- Storage account: [name]
- Blob container: [creatives]
- Application Insights: [name]

---

## 3) Connection Matrix (Fill for each environment)

| Purpose | Key | Source | Required | Example / Notes |
|---|---|---|---|---|
| Cosmos endpoint | `COSMOS_ENDPOINT` | SWA App Settings | Yes | `https://<account>.documents.azure.com:443/` |
| Cosmos key | `COSMOS_KEY` | SWA App Settings (secret) | Yes | Account key or secret reference |
| Cosmos DB name | `COSMOS_DATABASE` | SWA App Settings | Yes | `creativeswipe` |
| Storage connection string | `AZURE_STORAGE_CONNECTION_STRING` | SWA App Settings (secret) | Yes | `DefaultEndpointsProtocol=...` |
| Blob container | `AZURE_STORAGE_CONTAINER` | SWA App Settings | Yes | `creatives` |
| JWT secret | `JWT_SECRET` | SWA App Settings (secret) | Yes | >= 32 chars random |
| Creator token TTL | `JWT_CREATOR_EXPIRY` | SWA App Settings | Optional | `8h` |
| Reviewer token TTL | `JWT_REVIEWER_EXPIRY` | SWA App Settings | Optional | `4h` |
| Functions runtime | `FUNCTIONS_WORKER_RUNTIME` | App setting | Yes | `node` |
| AzureWebJobs storage | `AzureWebJobsStorage` | App setting | Yes | For Functions host runtime |

> Note: In local development, fallback/in-memory modes may hide missing cloud settings. Validate all required keys in target Azure environment before go-live.

---

## 4) Deployment Method and Pipeline
### Method used
- [ ] GitHub Actions (recommended for SWA)
- [ ] Azure Static Web Apps CLI
- [ ] Azure DevOps Pipeline

### Build/deploy details
- Frontend build command: `npm run build` (from `client`)
- API location: `api`
- App artifact location: `client/dist`
- Config file: `staticwebapp.config.json`

### If using SWA CLI
- Install: `npm install -g @azure/static-web-apps-cli`
- Init: `npx swa init --yes`
- Build: `npx swa build`
- Deploy: `npx swa deploy --env production`

---

## 5) Azure CLI Connection Checks

### 5.1 Confirm Azure context
- `az account show`
- `az account set --subscription <subscription-id>`

### 5.2 Validate SWA settings exist
- `az staticwebapp appsettings list --name <swa-name> --resource-group <rg>`

### 5.3 Set/update app settings
- `az staticwebapp appsettings set --name <swa-name> --resource-group <rg> --setting-names COSMOS_ENDPOINT=<value> COSMOS_KEY=<value> COSMOS_DATABASE=creativeswipe AZURE_STORAGE_CONNECTION_STRING=<value> AZURE_STORAGE_CONTAINER=creatives JWT_SECRET=<value> JWT_CREATOR_EXPIRY=8h JWT_REVIEWER_EXPIRY=4h FUNCTIONS_WORKER_RUNTIME=node AzureWebJobsStorage=<value>`

### 5.4 Optional: get SWA deployment token
- `az staticwebapp secrets list --name <swa-name> --resource-group <rg> --query properties.apiKey -o tsv`

---

## 6) Smoke Test Results
### App availability
- [ ] Frontend root loads
- [ ] Route fallback works (`/r/{sessionId}` opens app)

### API checks
- [ ] `POST /api/auth/register`
- [ ] `POST /api/auth/login`
- [ ] `POST /api/sessions`
- [ ] `POST /api/sessions/{id}/images`
- [ ] `POST /api/sessions/{id}/join`
- [ ] `POST /api/sessions/{id}/submit`
- [ ] `GET /api/sessions/{id}/export?format=xlsx`

### Data checks
- [ ] Cosmos writes/reads confirmed
- [ ] Blob upload and signed image URL retrieval confirmed

---

## 7) Security Verification
- [ ] `JWT_SECRET` is not default/dev value
- [ ] No secrets in repo or client bundle
- [ ] CORS and CSP reviewed for production domains
- [ ] HSTS and security headers verified
- [ ] Anonymous access restricted to intended routes only

---

## 8) Monitoring and Alerts
- App Insights linked: Yes / No
- Key alerts configured:
  - [ ] Function error rate
  - [ ] API 5xx threshold
  - [ ] Cosmos throttling / RU saturation
  - [ ] Storage availability anomalies
- Dashboard URL: [link]

---

## 9) Issues / Deviations
| Severity | Area | Description | Action | Owner | ETA |
|---|---|---|---|---|---|
| [Critical/High/Med/Low] | [API/DB/UI/Pipeline] | [issue] | [fix/mitigation] | [name] | [date] |

---

## 10) Rollback Plan and Evidence
### Rollback trigger criteria
- API error rate > [threshold] for [duration]
- Login/session creation fails consistently

### Rollback action
- Revert to previous successful deployment artifact/commit.
- Restore prior app settings snapshot if configuration regression is detected.

### Rollback test result
- [pass/fail + notes]

---

## 11) Post-Deployment Decision
- **Go / No-Go:** [Go | No-Go]
- **Approvers:** [Product], [Engineering], [Ops]
- **Follow-up tasks:** [list]

---

## 12) Next Deployment Prep Checklist (Template)
- [ ] Confirm subscription/resource group/region.
- [ ] Confirm all required app settings present for target env.
- [ ] Confirm JWT + data-store secrets rotated if policy requires.
- [ ] Run local build and API tests before deployment.
- [ ] Execute staging deployment and smoke tests.
- [ ] Deploy production and verify telemetry within first 15 minutes.
