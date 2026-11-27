# Roster

Roster is a teacher-managed quiz and classroom platform for creating assessments, managing student rosters, running live rooms, and reviewing submissions.

## Repository

GitHub: https://github.com/mhuraizasghar/roster.pages.grezorea.com

## Features

- Teacher account authentication
- Structured quiz library with folders and subjects
- Student email roster management
- Timed quizzes and assignment attempts
- Live classroom rooms with real-time participation
- Submission reports and CSV export
- Supabase-backed storage and authentication
- Cloudflare Pages and Vercel hosting support; Supabase provides authentication and shared data storage

## Run locally

Install dependencies and start the Vite development server:

```bash
npm install
npm run dev
```

To run the application server and frontend together:

```bash
npm run dev:all
```

The React application is served through Vite. Configure Supabase and server environment variables before running against hosted data.

### Google sign-in setup

The Google button uses a full Supabase OAuth redirect and lets the user choose a Google account. Configure the web OAuth client in Google Cloud, then add its client ID and client secret under **Supabase Authentication → Providers → Google**.

- Google **Authorized JavaScript origins**: `http://localhost:5173` and `https://roster.pages.grezorea.com`
- Google **Authorized redirect URI**: `https://zimpzoakuxacjwikfnyk.supabase.co/auth/v1/callback`
- Supabase **Redirect URLs**: `http://localhost:5173/auth/callback` and `https://roster.pages.grezorea.com/auth/callback`

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` for local use. The Supabase anon key is intended for browser clients; keep the Google client secret and `SESSION_SECRET` server-side. Restart Vite after changing `.env`.

## Build

```bash
npm run build
```

## Testing

```bash
npm test
```

Node test suites cover quizzes, stored attempts, and live room synchronization.

## Project structure

- `src/` - React application pages and components
- `server/` - Express API and server configuration
- `supabase/migrations/` - Supabase database migrations
- `public/` - static assets
- `tests/` - active application tests
- `functions/api/` - Supabase-backed authentication endpoints for Cloudflare Pages
Apply `supabase/migrations/001_eval_schema.sql` first, then `supabase/migrations/002_roster_live_rooms.sql` in the Supabase SQL Editor before using shared workspace data. The second migration adds live-room storage and its protected answer keys. Cloudflare Pages is a static host and does not require a database binding.

## Security

Roster is intended for roster-gated academic access. Production deployments should use authenticated backend authorization and properly configured database policies rather than relying on browser-side checks alone.
