# Deployment Guide

## Production Architecture

- Application runs as a Hostinger Node.js Web App.
- `app.js` is the Hostinger entry file.
- `server.js` serves the Express API and the React static build.
- Frontend static build output is `client/dist`.
- Runtime data and media use Hostinger-compatible MySQL.

## Hostinger Git Settings

Use these values in Hostinger:

- Framework: `Other` first, or `Express` if Hostinger accepts it
- Root directory: `.`
- Entry file: `app.js`
- Install command: `npm install`
- Build command: `npm run build`
- Start command: `npm start`
- Output/build directory: `client/dist`

The repository root must contain:

- `package.json`
- `package-lock.json`
- `app.js`
- `server.js`
- `index.js`

There should be no nested `client/package.json` or `api/package.json` for Hostinger Git deployment.

## Required Runtime Configuration

Set these environment variables in Hostinger:

- `DATABASE_URL`
  - or `HOSTINGER_DB_HOST`
  - `HOSTINGER_DB_PORT`
  - `HOSTINGER_DB_USER`
  - `HOSTINGER_DB_PASSWORD`
  - `HOSTINGER_DB_NAME`
- `JWT_SECRET`

Optional:

- `JWT_CREATOR_EXPIRY`
- `JWT_REVIEWER_EXPIRY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_BASE`

## Validation

After deployment:

- Visit `/api/health`
- Confirm it returns HTTP `200`
- Open the root app URL
- Register/login as a creator
- Create a session and upload a small test image
