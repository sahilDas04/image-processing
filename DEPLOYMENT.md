# Deployment Guide (100% Free Tier)

Deploy this app for free using **Render** (FastAPI backend), **Neon** (PostgreSQL), and **Vercel** (React frontend). Image storage uses **Cloudflare R2** free tier (10 GB), since Render's free-tier filesystem is ephemeral — local uploads would be wiped on every redeploy.

| Component | Service | Free tier |
|-----------|---------|-----------|
| Backend (FastAPI) | Render web service | 750 hrs/mo, sleeps on inactivity, ~50s cold start |
| Database | Neon Postgres | 0.5 GB, always-on |
| Frontend (React) | Vercel | Hobby, unlimited static sites |
| Image storage | Cloudflare R2 | 10 GB, S3-compatible, no egress fees |

---

## 0. Prerequisites

1. Push this repo to GitHub (already done — `sahilDas04/image-processing`).
2. Accounts: [render.com](https://render.com), [neon.tech](https://neon.tech), [vercel.com](https://vercel.com), [cloudflare.com](https://dash.cloudflare.com/sign-up) (R2 = free).
3. Google OAuth credentials (client ID + secret) with an **Authorized redirect URI** of your Vercel domain.

> **Gotcha:** Google allows only exact redirect URI matches. Dev (`http://localhost:5173`) and prod (`https://your-app.vercel.app`) need *separate* entries (or use two OAuth clients).

---

## 1. Neon — create the database (10 min)

1. Sign in to [neon.tech](https://neon.tech) → **Create a project** (region near your users) → it shows a connection string.
2. Copy the **pooled or unpooled** connection string:
   ```
   postgresql://neondb_owner:xxxx@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
   We'll paste the whole thing into Render as `DATABASE_URL` (the app now supports a full `DATABASE_URL` override — `server/app/core/config.py`).
3. Save it for step 2. No other action needed — schema is auto-migrated on startup (`alembic upgrade head` in the Dockerfile).

## 2. Cloudflare R2 — create the image bucket (10 min)

1. [dash.cloudflare.com](https://dash.cloudflare.com/sign-up) → **R2 Object Storage** → **Create bucket** (`image-processing`).
2. R2 **Overview** → **Manage R2 API Tokens** → **Create API Token** with *Object Read & Write* on that bucket. Copy:
   - `Access Key ID` → `S3_ACCESS_KEY`
   - `Secret Access Key` → `S3_SECRET_KEY`
   - Your account ID (top-right) → build `S3_ENDPOINT_URL = https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
3. Keep the `S3_REGION` set to `auto` (R2 ignores it).

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
   - `ALLOWED_ORIGINS` = `https://your-app.vercel.app` (Vercel URL from step 4)
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` = from the OAuth console
   - `STORAGE_PROVIDER` = `s3`
   - `S3_BUCKET` = `image-processing`
   - `S3_ENDPOINT_URL` = `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
   - `S3_ACCESS_KEY` / `S3_SECRET_KEY` = from step 2
   - `S3_REGION` = `auto`
   - `DEBUG_OPENAPI` = `false`
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
3. **Deploy.** `client/vercel.json` provides the SPA rewrite so deep links like `/history` work.

## 5. Wire up Google OAuth (5 min)

In the Google Cloud Console → **APIs & Services → Credentials →** your OAuth client → **Authorized redirect URIs**:
- `https://your-app.vercel.app` ← for the deployed site
- Optionally keep `http://localhost:5173` for local dev.

## 6. Verify

- `https://your-app.vercel.app` → sign in with Google → upload an image → process it → check `/history` (preview + download + delete).
- `https://image-processing-api.onrender.com/health` → `{"status":"ok"}`.

---

## Free-tier caveats

- **Render free** sleeps ~15 min after no traffic; first request feels ~30-50s slow (cold start). A Vercel cron-free "keep-alive ping" is a common workaround but not required.
- **Preview image caching:** preview objects are `blob:` URLs fetched per variant on the History page (no extra infra needed).
- **Local storage is NOT durable** on Render free — always run with `STORAGE_PROVIDER=s3`. If you skip R2, run with local storage and expect uploads to disappear on redeploys.
- Upgrading later: Render free → Starter (~$7/mo) keeps the service warm and adds a persistent disk; Neon free → Launch adds more storage; R2 free → paid only when you exceed 10 GB.