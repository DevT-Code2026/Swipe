# CreativeSwipe

CreativeSwipe is a collaborative creative review platform for teams to share assets, collect reviewer feedback, and track project progress across clients.

## What this project includes

- Creator authentication and dashboard
- Session creation by client and project
- Multi-image upload with platform template context
- Shareable reviewer links with reviewer identity capture
- Reviewer swipe/tap review flow with comments
- Reviewer history and project progress tracking
- Export support for session results

## Tech stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Data: Hostinger/MySQL via `mysql2`
- Media: MySQL-backed blob table
- Auth: JWT
- Deployment: Hostinger Node.js Web App

## Hostinger structure

Hostinger should use the repository root as the application root:

- `package.json` - single Node package manifest
- `package-lock.json` - single dependency lockfile
- `app.js` - Hostinger entry file
- `server.js` - Express API and static app server
- `client/` - React source
- `api/src/services/` - shared backend services

## Hostinger settings

- Framework: `Other` or `Express`
- Root directory: `.`
- Entry file: `app.js`
- Install command: `npm install`
- Build command: `npm run build`
- Start command: `npm start`
- Output directory: `client/dist`

## Environment variables

Required for Hostinger/MySQL-backed mode:

- `DATABASE_URL`
  - or `HOSTINGER_DB_HOST`
  - `HOSTINGER_DB_PORT`
  - `HOSTINGER_DB_USER`
  - `HOSTINGER_DB_PASSWORD`
  - `HOSTINGER_DB_NAME`
- `JWT_SECRET`

If MySQL settings are not configured, local in-memory fallback is used.

## Local commands

- Install dependencies: `npm install`
- Run development frontend: `npm run dev:client`
- Build frontend: `npm run build`
- Start production server locally: `npm start`
- Health check: `GET /api/health`
