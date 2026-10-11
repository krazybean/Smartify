# Smartify

Smartify is a local-first music intelligence app that connects to Spotify, syncs playlists and tracks, stores data in SQLite, and lets you query tracks locally.

## Stack

- Backend: Node.js + TypeScript + Fastify
- Frontend: Next.js (App Router)
- Database: SQLite (`better-sqlite3`)
- Auth: Spotify OAuth

## Project Structure

```
smartify/
├── apps/
│   ├── web/
│   └── api/
├── packages/
│   ├── db/
│   └── spotify/
├── data/
│   └── dev.db
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Create your env file:

```bash
cp .env.example .env
```

3. Start API + web:

```bash
npm run dev
```

- Web app: `http://localhost:3000`
- API server: `http://localhost:3001`

## Spotify App Setup

1. Go to the Spotify Developer Dashboard and create an app.
2. Add `http://localhost:3001/auth/callback` as a Redirect URI.
3. Put these values in `.env`:
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
   - `SPOTIFY_REDIRECT_URI=http://localhost:3001/auth/callback`

## MVP Flow

1. Open the web app and click **Login with Spotify**.
2. Authorize Smartify in Spotify.
3. Go to `/dashboard` and click **Sync Library**.
4. Tracks are saved to SQLite and loaded from local DB via `/tracks`.
