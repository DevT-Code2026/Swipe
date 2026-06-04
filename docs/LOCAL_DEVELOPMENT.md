# Local Development Guide

## Prerequisites

- Node.js 18+
- npm
- Optional: Docker Desktop

## Setup

1. Install dependencies:
   - `npm run install:all`
2. Create `.env` in repo root from `.env.example`.

## Run modes

### Standard development mode

- Command: `npm run dev`
- Runs frontend and backend dev workflows for iterative development.

### Production-like local mode

1. Build frontend:
   - `npm run build`
2. Start unified server:
   - `npm start`

Server listens on `PORT` or defaults to `8080`.

## Current functional flow to validate locally

1. Creator login/register and dashboard load.
2. Create session with client/project and expected reviewers.
3. Upload multi-row post groups with platform/template metadata.
4. Reviewer joins by name/email and submits decisions.
5. Dashboard updates reviewer done/pending and feedback counts.

## Data behavior

- Without MySQL env vars, app runs with in-memory fallback for DB/storage.
- In-memory mode is non-persistent and best for UI and flow validation.

## Common tasks

- Install all deps: `npm run install:all`
- Build frontend: `npm run build`
- Start server: `npm start`
- Docker build: `npm run docker:build`
- Docker run: `npm run docker:run`

## Environment variables

Required for persistent Hostinger/MySQL-backed local runs:

- `DATABASE_URL`
  - or `HOSTINGER_DB_HOST`
  - `HOSTINGER_DB_PORT`
  - `HOSTINGER_DB_USER`
  - `HOSTINGER_DB_PASSWORD`
  - `HOSTINGER_DB_NAME`
- `JWT_SECRET`

## Troubleshooting

### Data not persisting

Likely running in in-memory mode. Configure the Hostinger/MySQL env vars.

### Reviewer history/status mismatch

Ensure reviewer email is consistently provided during join and submit.

### Upload/template rendering mismatch

Verify payload includes `templateChannel`, `templateText`, `rowId`, and `rowOrder` for each image.

### Auth failures

Check `JWT_SECRET` and expiry settings for creator/reviewer tokens.

### API route errors

Confirm requests are targeting `/api/*` paths and server is running on expected host/port.

