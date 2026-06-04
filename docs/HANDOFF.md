# CreativeSwipe Developer Overview

CreativeSwipe is a collaborative creative review platform for teams that need to share media, collect structured feedback, and track review progress across clients and projects.

The application is organized as a single Node.js server that serves both the React frontend and the API. The frontend is built with React and Vite, and the backend uses Express together with shared services for data, storage, token handling, and export generation.

## How the app works

Creators authenticate, create a review session, upload assets, and define the client or project context. Reviewers join a session through a shared link, view the media in a swipe or tap flow, leave comments and annotations, and submit decisions back to the session.

Session data is grouped so the dashboard can show reviewer progress, history, and completion status across the same client or project. Exports are available for session results when needed.

## Main layers

- `client/` contains the React pages and reusable UI components.
- `api/` contains the backend function-style workspace plus shared services for persistence, storage, tokens, and exports.
- `server.js` is the unified runtime entrypoint for production-style local runs.
- `docs/` contains project reference material and deployment notes.

## Runtime model

When MySQL settings are configured, the app uses Hostinger-compatible MySQL tables for both app data and uploaded media. When those settings are absent, it can fall back to local in-memory behavior for development and UI validation.

Authentication is JWT-based, with separate token flows for creators, reviewer sessions, and reviewer accounts.

## Key product behavior

- Creator registration and login.
- Session creation with client, project, and reviewer context.
- Multi-image uploads with template metadata.
- Reviewer join, swipe review, comments, and annotations.
- Reviewer history and progress tracking.
- Session export for downstream reporting.

## Request surface

The API is rooted under `/api` and includes routes for creator auth, reviewer auth, session lifecycle, image management, submissions, previews, and exports.

The app also exposes `/api/health` for simple liveness checks.
