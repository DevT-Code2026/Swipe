# Azure Resource Tidy Plan (2026-03-19)

## Subscription Context
- Subscription: `Azure for Students`
- Subscription ID: `77787920-bb7a-4ac0-90cf-f4878f106031`
- Tenant: `62c4c248-b9c7-437b-9184-64791c7bb9b4`

> Note: Azure Extension auth context and Azure CLI context can differ. This inventory was validated from Azure CLI (same path used for your deployments).

## 1) Current Resource Groups
- `Share` (CreativeSwipe + legacy Web App assets)
- `MM` (another project + shared Container Apps environment/certs currently used by CreativeSwipe)
- `rg-invoiceapp` (invoice app)
- `rg-taskdock` (taskdock storage)
- `DefaultResourceGroup-CID` (Log Analytics workspace)

## 2) CreativeSwipe-Related Resources

### Active (keep)
- `creativeswipe-app` — `Microsoft.App/containerApps` (Running, latest image `creativeswipeacr.azurecr.io/creativeswipe:v20`)
- `creativeswipeacr` — `Microsoft.ContainerRegistry/registries` (Basic)
- `creativeswipedb` — `Microsoft.DocumentDB/databaseAccounts`
- `creativeswipestorage` — `Microsoft.Storage/storageAccounts`

### Dependency currently in another RG (`MM`) (keep for now)
- `stt-premium-app-env` — `Microsoft.App/managedEnvironments`
- `stt-premium-app-env/cert-apex-http` — managed certificate
- `stt-premium-app-env/cert-www-giggidy` — managed certificate

### Likely legacy for CreativeSwipe (cleanup candidates)
- `creativeswipe-62261` — `Microsoft.Web/sites` (App Service, only default hostname bound)
- `plan-creativeswipe` — `Microsoft.Web/serverFarms` (SKU `B1`)
- `workspace-hareUyWu` — `Microsoft.OperationalInsights/workspaces` (needs dependency check)
- `workspace-hareeSiK` — `Microsoft.OperationalInsights/workspaces` (needs dependency check)

## 3) Why your Azure looks confusing
- Two hosting stacks exist for the same app domain lifecycle:
  1. **Current**: Container Apps (`creativeswipe-app`) — this is what you are using now.
  2. **Legacy**: App Service (`creativeswipe-62261` + `plan-creativeswipe`) — likely leftover.
- CreativeSwipe app in `Share` depends on a managed environment + certs located in `MM`, mixing project boundaries.

## 4) Clean Target Structure (recommended)

### Target RG layout
- `rg-creativeswipe-prod`
  - Container App: `creativeswipe-app`
  - Managed Environment: `creativeswipe-env`
  - Managed Certificates: apex + www for `giggidy.work`
  - ACR: `creativeswipeacr`
  - Cosmos DB: `creativeswipedb`
  - Storage: `creativeswipestorage`
  - (Optional) one Log Analytics workspace only if diagnostics needed
- Keep other projects in separate RGs (`MM`, `rg-invoiceapp`, `rg-taskdock`) with no cross-project dependencies.

## 5) Safe cleanup order

### Phase A — No-risk validation
1. Confirm DNS and ingress traffic for `giggidy.work` points to Container App only.
2. Confirm App Service `creativeswipe-62261` has no custom domains (already observed).
3. Confirm no diagnostics/alerts depend on `workspace-hareUyWu` / `workspace-hareeSiK`.

### Phase B — Low-risk immediate cleanup
1. Stop/delete legacy App Service stack if confirmed unused:
   - `creativeswipe-62261`
   - `plan-creativeswipe`
2. Keep one Log Analytics workspace (or none) and remove unused duplicates after dependency check.

### Phase C — Structural cleanup (best long-term)
1. Create a dedicated Container Apps managed environment in CreativeSwipe RG.
2. Re-create certificates in that environment.
3. Move `creativeswipe-app` to that environment (redeploy/update).
4. Remove CreativeSwipe dependency on `MM` RG environment.

## 6) What to combine vs create
- **Combine**: Keep one hosting model (Container Apps) and remove legacy App Service resources.
- **Combine**: Keep only one relevant Log Analytics workspace for this app.
- **Create**: Dedicated CreativeSwipe managed environment + certs inside CreativeSwipe RG.

## 7) Practical next step
If you approve, execute this in order:
1. Backup/export current App Service config for rollback.
2. Delete `creativeswipe-62261` and `plan-creativeswipe`.
3. Dependency-check and clean `workspace-hareUyWu` / `workspace-hareeSiK`.
4. (Optional but recommended) create dedicated `creativeswipe-env` and migrate cert dependency from `MM`.
