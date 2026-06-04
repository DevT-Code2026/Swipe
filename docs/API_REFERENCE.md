# API Reference

Base path: `/api`

## Health and diagnostics

- `GET /api/health`

Use this endpoint for app liveness checks in deployment smoke tests.

## Authentication

### Creator auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

### Reviewer account auth

- `POST /api/reviewer/register`
- `POST /api/reviewer/login`
- `GET /api/reviewer/me`
- `POST /api/reviewer/sessions/:id/claim`
- `GET /api/reviewer/sessions`

### Auth token model

- Creator token: required for creator dashboard and session management routes.
- Reviewer session token: issued by session join, scoped for review submission.
- Reviewer account token: used by reviewer account routes and session claim/list APIs.

## Sessions (creator)

- `POST /api/sessions`
- `GET /api/sessions`
- `GET /api/sessions/:id`
- `PATCH /api/sessions/:id`
- `DELETE /api/sessions/:id`
- `DELETE /api/sessions?scope=all|client|project&clientId=...&projectId=...`

`GET /api/sessions` response includes reviewer progress and post grouping metadata used by dashboard project cards.

## Reviewer session flow

- `POST /api/sessions/:id/join`
- `POST /api/sessions/:id/submit`
- `GET /api/sessions/:id/reviewer-history`

Reviewer matching prioritizes reviewer email to preserve done/pending continuity and history within the same client/project.

## Public session preview

- `GET /api/public/sessions/:id/preview`

Used by reviewer entry flow for public metadata and pre-review context.

## Images and template metadata

- `POST /api/sessions/:id/images`
- `GET /api/sessions/:id/images`
- `DELETE /api/sessions/:id/images/:imageId`

Each image payload item supports:

- `fileName`
- `data` (base64)
- `contentType`
- `templateChannel` (`LinkedIn`, `Instagram`, `YouTube`, `Other`)
- `templateText`
- `rowId`
- `rowOrder`

`GET /api/sessions/:id/images` returns template and row metadata for reviewer card rendering and post grouping.

## Submissions and exports

- `GET /api/sessions/:id/submissions`
- `GET /api/sessions/:id/export?format=xlsx|csv`

## Request body notes

### Create session (`POST /api/sessions`)

Important fields:

- `title`
- `clientName`
- `projectName`
- `clientId` (optional)
- `projectId` (optional)
- `expectedReviewers` (array of reviewer name/email)
- `deadline` (optional)
- `password` or `reviewerPassword` (optional)

### Submit review (`POST /api/sessions/:id/submit`)

- `decisions`: array of `{ imageId, liked }`
- `annotations`: array of image pin/comment objects

