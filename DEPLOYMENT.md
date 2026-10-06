# Deployment Guide (100% Free Tier)

Deploy this app for free using **Render** (FastAPI backend), **Neon** (PostgreSQL), **Cloudinary** (image storage), and **Vercel** (React frontend). Image storage uses **Cloudinary**, since Render's free-tier filesystem is ephemeral — local uploads would be wiped on every redeploy.

| Component | Service | Free tier |
|-----------|---------|-----------|
| Backend (FastAPI) | Render web service | 750 hrs/mo, sleeps on inactivity, ~50s cold start |
| Database | Neon Postgres | 0.5 GB, always-on |
| Frontend (React) | Vercel | Hobby, unlimited static sites |
| Image storage | Cloudinary | Free credit pool (25 credits/mo — monitor usage) |

---

## 0. Prerequisites

1. Push this repo to GitHub (already done — `sahilDas04/image-processing`).
2. Accounts: [render.com](https://render.com), [neon.tech](https://neon.tech), [vercel.com](https://vercel.com), [cloudinary.com](https://cloudinary.com) (free tier).
3. Google OAuth credentials (client ID + secret) with an **Authorized redirect URI** of your Vercel domain.

> **Gotcha:** Google allows only exact redirect URI matches. Dev (`http://localhost:5173`) and prod (`https://your-app.vercel.app`) need *separate* entries (or use two OAuth clients).

---

## 1. Neon — create the database (10 min)

1. Sign in to [neon.tech](https://neon.tech) → **Create a project** (region near your users) → it shows a connection string.
2. Copy the **pooled or unpooled** connection string:
   ```
   postgresql://neondb_owner:xxxx@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```
   Paste it into Render as `DATABASE_URL` **exactly as Neon gives it** — including
   `postgresql://`, `sslmode=require`, and `channel_binding=require`.

   The app normalizes it at startup (`server/app/core/config.py`): it rewrites the
   scheme to `postgresql+asyncpg` (the only Postgres driver installed — there is no
   psycopg2), maps `sslmode` → `ssl`, and drops `channel_binding`. SQLAlchemy's
   asyncpg dialect forwards query params to `asyncpg.connect()` verbatim, and
   asyncpg rejects both `sslmode` and `channel_binding`, so an un-normalized string
   raises `TypeError` on the first query.

   > Prefer the **direct** (non-`-pooler`) endpoint on the free tier. asyncpg uses
   > prepared statements by default, which PgBouncer transaction mode can reject; the
   > direct endpoint avoids the issue entirely and a single free instance never
   > approaches Neon's connection limit. If you must use the pooler, append
   > `&statement_cache_size=0`.
3. Save it for step 2. No other action needed — schema is auto-migrated on startup (`alembic upgrade head` in the Dockerfile).

## 2. Cloudinary — set up media storage (5 min)

1. Sign up at [cloudinary.com](https://cloudinary.com) and open the **Console**.
2. Copy from the dashboard home page (or **Settings → API Keys**):
   - **Cloud name** → `CLOUDINARY_CLOUD_NAME`
   - **API key** → `CLOUDINARY_API_KEY`
   - **API secret** → `CLOUDINARY_API_SECRET`
3. Set `CLOUDINARY_DELIVERY_TYPE` to its default, `private`. Assets are stored
   byte-for-byte under `CLOUDINARY_FOLDER` and streamed back through the
   backend, so the per-user ownership checks on `/history/*/download` stay
   meaningful. Setting it to `upload` makes every asset world-readable by URL.

> The API secret is a backend secret. It must only ever be set on Render — a
> `VITE_*` variable is inlined into the browser bundle and is public.

## 3. Render — deploy the backend (15 min)

1. [render.com](https://render.com) → **New → Web Service** → connect the GitHub repo.
2. Fill the form:
   - **Name:** `image-processing-api`
   - **Runtime:** Docker
   - **Root Directory:** `server` (the `Dockerfile` lives there)
   - **Plan:** Free
   - **Health Check Path:** `/health`
3. **Environment variables:**
   - `DATABASE_URL` = the Neon string from step 1
   - `SECRET_KEY` = `python -c "import secrets; print(secrets.token_urlsafe(48))"`
   - `ALLOWED_ORIGINS` = `https://your-app.vercel.app` (Vercel URL from step 4).
     Comma-separate for multiple origins. **Never `*`** — the app refuses to
     boot on a wildcard CORS policy.
   - `FRONTEND_URL` = the same Vercel URL. This is what the OAuth code exchange
     validates `redirect_uri` against, so login works without a code change.
     Keep the dev origins in `ALLOWED_ORIGINS` if you still develop locally.
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` = from the OAuth console
   - `STORAGE_PROVIDER` = `cloudinary`
   - `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` = from step 2
   - `MAX_UPLOAD_SIZE_MB` = `25` (see caveats)
   - `DEBUG_OPENAPI` = `false` (set `true` temporarily if you want `/docs`)
4. **Deploy.** First build pushes a ~300 MB image, then runs `alembic upgrade head` (creates tables) and starts uvicorn on `$PORT`.
5. After it's live, note your backend URL: `https://image-processing-api.onrender.com`.

> `render.yaml` in the repo root mirrors this (minus secrets) if you prefer **New → Blueprint**.

## 4. Vercel — deploy the frontend (10 min)

1. [vercel.com](https://vercel.com) → **Add New → Project** → import the GitHub repo.
2. In **Configure Project**:
   - **Root Directory:** `client`
   - **Framework Preset:** Vite
   - **Build Command:** `pnpm build` (leave as detected if present)
   - **Output Directory:** `dist`
- **Environment Variables:**
      - `VITE_API_URL` = `https://image-processing-api.onrender.com` (Render URL, no trailing slash)
      - `VITE_GOOGLE_CLIENT_ID` = your OAuth client ID
      - `VITE_GOOGLE_REDIRECT_URI` = `https://your-app.vercel.app`
      - `VITE_MAX_UPLOAD_SIZE_MB` = `25` (must match the backend's `MAX_UPLOAD_SIZE_MB`)

    These are **inlined at build time**, so they must be set before the build
    runs and changing one requires a redeploy. Anything missing silently falls
    back to a localhost default, which fails in a browser on an HTTPS origin.
3. **Deploy.** `client/vercel.json` provides the SPA rewrite so deep links like `/history` work.

## 5. Wire up Google OAuth (5 min)

In the Google Cloud Console → **APIs & Services → Credentials →** your OAuth client → **Authorized redirect URIs**:
- `https://your-app.vercel.app` ← for the deployed site
- Optionally keep `http://localhost:5173` for local dev.

## 6. Verify

- `https://your-app.vercel.app` → sign in with Google → upload an image → process it → check `/history` (preview + download + delete).
- `https://image-processing-api.onrender.com/health` → `{"status":"ok"}`.
- `https://image-processing-api.onrender.com/docs` → only responds when `DEBUG_OPENAPI=true`. If you need it temporarily, set the var, redeploy, check, then set it back.

---

## Free-tier caveats

- **Render free** sleeps ~15 min after no traffic; first request feels ~30-50s slow (cold start). A Vercel cron-free "keep-alive ping" is a common workaround but not required. The login button probes `/health` first, so the first sign-in after a cold start will look slow but is not broken.
- **Preview image caching:** preview objects are `blob:` URLs fetched per variant on the History page (no extra infra needed).
- **Local storage is NOT durable** on Render free — always run with `STORAGE_PROVIDER=cloudinary`. If you skip it, run with local storage and expect uploads to disappear on redeploys.
- **Cloudinary free tier is credit-based** (25 credits/mo). Processing many variants burns credits fast, and originals + variants both count toward storage. Keep `MAX_UPLOAD_SIZE_MB` low and delete finished jobs.
- **Chunked upload endpoints** stage chunks on local disk (`CHUNK_UPLOAD_DIR`), which is ephemeral on Render free. Object storage does not change this; only a paid persistent disk does. The frontend does not currently use these endpoints.
- Upgrading later: Render free → Starter (~$7/mo) keeps the service warm and adds a persistent disk; Neon free → Launch adds more storage.