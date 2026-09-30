# Changelog

All notable changes to the Image Processing Web App are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Types of changes:
- **Added** — new features
- **Changed** — changes in existing functionality
- **Fixed** — bug fixes
- **Deprecated** — soon-to-be removed features
- **Removed** — now removed features
- **Security** — vulnerability fixes

---

## [Unreleased]

### Phase 2: Production Foundation (In Progress)

#### Added
- **Deployment (free tier)** — `server/Dockerfile` (uv-based, `alembic upgrade head` on boot), `server/.dockerignore`, `render.yaml` (Render blueprint), `client/vercel.json` (SPA rewrite), `DEPLOYMENT.md` (Render + Neon + Vercel + Cloudflare R2 guide), `server/.env.example` production template
- **Production config** — `DATABASE_URL` override (full-URL wins over `postgres_*` fields); `POSTGRES_SSLMODE` for Neon/Render SSL connections; `ALLOWED_ORIGINS` accepts comma-separated *or* JSON array values; DB credentials URL-encoded in the generated asyncpg URL
- **Image Processing**
  - `from_pdf` operation — render a selected PDF page to PNG/JPEG/WebP (pypdfium2, page param)
  - `from_pdf` "all pages" — render every page and download as a ZIP
  - `to_pdf` operation — combine one or more images into a multi-page PDF (`POST /api/v1/images/to-pdf`)
  - Format-conversion UI — target-format dropdown for `convert` (JPEG ↔ PNG ↔ WebP) and `from_pdf`
- **Processing History Persistence**
  - `Job` / `Variant` records now created for every `/api/v1/images/process` and `/api/v1/images/to-pdf` result; outputs are stored through the configured `StorageProvider`
  - `GET /api/v1/history` — paginated processing history (newest first, eager-loaded variants)
  - `GET /api/v1/history/{id}` — single job with variants
  - `GET /api/v1/history/{id}/download` — re-download a stored result (optionally a specific variant)
  - `DELETE /api/v1/history/{id}` — permanent delete of a job, its variants (DB cascade), and its stored result bytes
  - `JobRepository` (list_for_user / get_for_user) + `JobOut`/`VariantOut` schemas
  - Frontend **History page** (`/history`) — operation cards, status badges, per-variant download buttons, pagination, empty state, react-query data fetching
  - Frontend **About page** (`/about`) — feature grid + "how it works" steps
  - Routes `/history` and `/about` registered as protected routes in `App.tsx` (Navbar links already existed)
  - History entries now show **image result previews** — `GET /api/v1/history/{id}/preview` serves a variant's bytes inline (`Content-Disposition: inline`, image mime types only); the History page renders a lazy-loaded object-URL thumbnail per variant
  - History page **delete** — per-entry Delete button (confirm dialog) calls `DELETE /api/v1/history/{id}`, optimistically removes the card, toast feedback
- **OAuth nonce binding (server-side CSRF protection)**
  - `GOOGLE_CLIENT_ID` login now sends a `nonce` through the authorization URL; `GoogleCodeExchangeRequest` accepts it and `verify_google_token` asserts it matches the ID token's `nonce` claim
  - Client `lib/oauth.ts` generates/stashes/sends the nonce; `AuthContext` removed the `code_verifier` console log

#### Changed
- **Frontend** — colorful gradient theme, modern rounded cards, updated operation picker, and a redesigned login page (brand panel + feature chips)
- **Storage**
  - `StorageProvider` ABC (save/load/delete/list/exists + optional signed URL)
  - `LocalStorageProvider` — filesystem backend, path-traversal safe (dev default)
  - `S3StorageProvider` — S3-compatible (AWS/R2/MinIO), presigned URLs, lazy boto3 import
  - Provider selection via `STORAGE_PROVIDER=local|s3` in `.env`
- **Image Upload**
  - `POST /api/v1/upload` — multi-file upload with per-file validation + storage + DB record
  - SHA-256 checksum duplicate detection (soft-deleted images ignored)
- **Image Management**
  - `ImageRepository` (get_for_user, get_by_checksum, paginated list_for_user with search)
  - `GET /api/v1/images` — paginated list with `search` filter
  - `GET /api/v1/images/{id}` — metadata
  - `GET /api/v1/images/{id}/download` — stream original bytes from storage
  - `PATCH /api/v1/images/{id}` — rename (`filename`/`original_name`)
  - `DELETE /api/v1/images/{id}` — soft-delete (`deleted_at`)
- Image validation (MIME, magic bytes, size) extracted to `app/services/image_validation.py`; used by both `/process` and `/upload`

#### Fixed
- **Image upload returned 422 Unprocessable Content** — `lib/upload.ts` `regularUpload` sent the file under the field name `file`, but `POST /api/v1/upload` declares `files: list[UploadFile]`; FastAPI rejected the missing field with a 422. The form now appends `files`, matching the backend schema.
- `app/db/models/image.py` — `DateTime` used without being imported (broke app import)
- `Image.jobs` relationship missing the matching side of `Job.image` (`back_populates`) — broke SQLAlchemy mapper initialization
- **Navbar account dropdown** — `.glass-strong`'s `@apply relative` (defined later in `@layer utilities`) was overriding Tailwind's `absolute` utility on the menu, so it rendered in normal flow (off-screen above the button) instead of below it. Split the glass styling into a new `.glass-menu` class that does not force `position`, used by both the desktop account menu and the mobile menu.
- **Navbar dropdown overflow** — account menu wrapper got `relative` so the absolute-positioned dropdown anchors correctly instead of overflowing the pill navbar
- **Page scrolling** — `.page-bg` now uses `min-h-svh` (was `min-h-screen`, which overflowed on browsers where `100vh` exceeds the visual viewport); scrollbar thumb switched to `bg-primary/40` for visibility
- **Login page layout** — redesigned left panel: brand header + "Welcome Back" heading on top; hero image removed for a cleaner look; feature chips retained
- **Blank page root cause** — `IconLayer` is not exported by `@tabler/icons-react`; `Login.tsx` crashed the React tree at runtime. Replaced with `IconStack2`

#### Security
- **JWT secret hardening** — `_Settings.secret_key` rejects known placeholders (`change-me-in-production`, `your_generated_secret_key`, …) and secrets shorter than 32 chars, auto-generating a random secret (with a `CRITICAL` log) instead; `server/.env` now carries a generated 64-char secret
- **CORS hardening** — `allow_credentials=False` (Bearer auth only); `assert_safe_cors_origins()` fails fast if `ALLOWED_ORIGINS` contains `*`; OpenAPI docs gated behind `DEBUG_OPENAPI`
- **Path traversal** — chunked-upload `_get_chunk_dir` validates `upload_id` against a strict hex-UUID regex and re-resolves/resolves-relative before use; `/upload/init` bounds `total_chunks` and requires positive `file_size`; `/upload/chunk` reads through the size-capped reader; `/upload/finalize` validates `upload_id`
- **Memory DoS** — `read_upload_limited()` streams reads in 1 MB chunks and aborts once the cap is exceeded (was: full buffering before size check); empty `/uploads` HTTP 413; `max_request_body_size` dead code removed from `main.py`
- **PDF page cap** — `PdfToImageProcessor.render_all` rejects PDFs over `MAX_PDF_PAGES=64` (HTTP 422) to bound rasterization work
- **Rate limiting** — dependency-free in-process sliding-window limiter (`app/core/rate_limit.py`, tokens per-IP per-minute) applied to `POST /auth/google` and `/auth/google/code`; `RATE_LIMIT_ENABLED` / `RATE_LIMIT_PER_MINUTE` config
- **Auth endpoint validation** — `get_current_user` parses `sub` as a UUID (crafted non-UUID tokens now 401 instead of reaching the DB); nonce verified server-side in the PKCE exchange; `client_id`-bound Google token verification
- **Header injection** — `app/core/filenames.py`: `sanitize_filename()` strips CR/LF/quotes/control chars; `build_content_disposition()` emits safe RFC 5987 values; used on `/images/{id}/download`, `/history/{id}/download`, `/images/process`, `/images/to-pdf`
- **Security headers** — added `Content-Security-Policy` (default-src 'none', strict frame/form), `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`; HSTS emitted on HTTPS requests; `X-Frame-Options`/`Referrer-Policy`/`X-Content-Type-Options` retained
- **Test suite** — new `pytest` suite (37 tests) under `server/tests/` covering: placeholder/short secret rejection, token signature binding, chunk-upload traversal rejection, bounded-read 413s, PDF page cap, rate-limiter windows + 429 dependency, header presence, filename sanitization, CORS wildcard guard

### Phase 2: Production Foundation (Planned)

#### Added (Planned)
- **Authentication**
  - Google OAuth login with authlib (backend token validation)
  - JWT access + refresh token auth flow
  - `@requires_auth` dependency for protected endpoints
  - User profile endpoint (`GET /api/v1/auth/me`)
  - Logout with token blacklisting
- **Database**
  - PostgreSQL integration via SQLAlchemy 2.0 + asyncpg
  - Alembic migration system with initial schema
  - Models: User, Image, Job, Variant, AuditLog
  - Repository layer (BaseRepository + User/Image/Job/Audit repos)
- **Storage**
  - StorageProvider abstraction (upload/download/delete/list)
  - Local filesystem provider (development)
  - S3-compatible provider (production — R2/MinIO/AWS S3)
- **Image Management**
  - Multi-image upload endpoint (`POST /api/v1/upload`)
  - Image CRUD: list, get, soft-delete, update
  - Image library grid view (frontend)
  - Search, filter, sort for image library
  - Thumbnail generation on upload
- **Processing Jobs**
  - Job records with status tracking (pending/running/done/failed)
  - Job history list with filtering
  - Job status polling (short polling + WebSocket)
  - Retry/cancel job capabilities
  - Celery background worker for async processing
- **Frontend Architecture**
  - React Router 7 with page routes (Home, Library, Jobs, Login, Admin)
  - TanStack Query for server state management and caching
  - React Hook Form + Zod for form validation
  - Axios HTTP client with JWT interceptor
  - Drag-and-drop upload zone with visual feedback
  - Download button for processed images
- **DevOps**
  - Dockerfile for backend (Python 3.12-slim)
  - Dockerfile for frontend (multi-stage Nginx serve)
  - Dockerfile for Celery worker
  - Docker Compose (app + PostgreSQL + Redis + worker + Nginx)
  - Nginx reverse proxy config (SSL, rate limiting, static files)

#### Changed (Planned)
- **REST API** — restructure from single `/process` to resource-based:
  - `/api/v1/upload` — upload images
  - `/api/v1/images` — manage images
  - `/api/v1/jobs` — manage jobs
  - `/api/v1/auth` — auth endpoints
- **ImageProcessingService** — split into smaller services:
  - `ImageService` — CRUD + metadata
  - `ProcessingService` — operation dispatch
  - `JobService` — job lifecycle
  - `AudioService` — audit trail
- **Error format** — extend with `request_id` and `path` fields
- **Logging** — upgrade to structured JSON logging
- **CORS** — support production origins from env config
- **Frontend App.tsx** — refactor from single-component to page-based architecture

#### Security (Planned)
- JWT authentication (access + refresh tokens with rotation)
- Rate limiting per-user and per-IP (SlowAPI)
- Virus scanning for uploaded files (ClamAV)
- Content Security Policy headers
- HSTS + Expect-CT headers
- HTTPS termination via Nginx
- Secrets management (strict env-based, `.env.example` only in repo)

---

## Phase 1: MVP — Current State

### [1.0.0] — 2026-07-30

#### Added

**Backend Foundation**
- FastAPI application with health check endpoint (`GET /health`, `GET /`)
- API versioning under `/api/v1` prefix
- Pydantic v2 settings management (`core/config.py`)
- Consistent JSON error response format via `AppError` exception
- Exception handlers: `AppError` → 4xx, validation errors → 422, unhandled → 500
- Structured logging via `logging.basicConfig()`

**Security Middleware**
- CORS middleware (allow `localhost:5173` + `127.0.0.1:5173`)
- Security headers: `X-Content-Type-Options: nosniff`
- Security headers: `X-Frame-Options: DENY`
- Security headers: `Referrer-Policy: strict-origin-when-cross-origin`
- Security headers: `Permissions-Policy: camera=(), microphone=(), geolocation=()`

**Image Processing Core**
- Pluggable processor architecture:
  - `ImageProcessor` abstract base class with `process()` interface
  - `ProcessorRegistry` for operation→processor mapping
  - Auto-discovery via dict registry
- Image validation pipeline:
  - MIME type check (JPEG, PNG, WebP only)
  - Upload size limit (configurable, default 10 MB)
  - File signature / magic bytes verification
  - WebP RIFF header validation
  - EXIF orientation auto-transpose
- Output encoding: PNG (default), JPEG (compressed), WebP (converted)

**Image Processors (7 + 2 utility)**
- `GrayscaleProcessor` — convert to grayscale
- `BlurProcessor` — Gaussian blur (radius 4)
- `SharpenProcessor` — sharpening filter
- `QualityEnhancementProcessor` — auto-contrast + contrast/sharpness/color enhancement
- `RotateProcessor` — arbitrary rotation with expand
- `ResizeProcessor` — LANCZOS downscale/upscale
- `SizeReductionProcessor` — thumbnail + JPEG compression
- `CompressProcessor` — strip alpha → JPEG (utility)
- `ConvertProcessor` — format conversion between JPEG/PNG/WebP (utility)

**API Routes**
- `POST /api/v1/images/process` — multipart form upload + processing
- Parameters: operation, width, height, angle, strength, quality, max_dimension, output_format

**Frontend Foundation**
- React 19 + TypeScript 6 + Vite 8 project scaffold
- TailwindCSS 4 integration with `@tailwindcss/vite`
- shadcn/ui component system with Base UI primitives
- Outfit Variable font + Tabler Icons
- Theme provider with dark/light/system mode (press `D` to toggle)
- CSS custom properties via `oklch()` color model

**Frontend UI — Upload**
- File picker with MIME-type filter (JPEG/PNG/WebP only)
- Display selected filename
- Clear file button
- 10 MB client-side guard (via `accept` attribute)

**Frontend UI — Operation Controls**
- Operation selection grid (7 operations)
- Dynamic parameter inputs:
  - Rotate angle number input (range -360 to 360)
  - Resize width + height (range 1–4000)
  - Enhance strength slider (1.0–3.0)
  - Reduce size: JPEG quality slider (10–95%) + max dimension input
- Process button with loading state
- Cancel/clear operation

**Frontend UI — Preview**
- Side-by-side layout: Original | Processed
- `URL.createObjectURL()` for client-side previews
- Proper URL cleanup via `URL.revokeObjectURL()` on unmount
- File size display for both original and processed
- Empty state text for each panel

**Build & Config**
- TypeScript strict mode with `noUnusedLocals`, `noUnusedParameters`
- ESLint with react-hooks and react-refresh plugins
- Prettier with TailwindCSS plugin
- Path alias `@/` → `./src/`
- Vite env var `VITE_API_URL` for API base URL

**Project Documentation**
- README with architecture overview, run instructions, API docs
- `.env` with Google OAuth + PostgreSQL placeholders
- Python dependencies declared in `pyproject.toml`:

### [1.0.1] — 2026-07-30

#### Fixed
- `README.md` — fixed markdown rendering issue with `next` keyword in title

---

## Planned Releases

### [2.0.0] — Phase 2 (TBD)

*Target: Production-ready web app with auth, persistence, background jobs, and containerized deployment.*

### [3.0.0] — Phase 3 (TBD)

*Target: Advanced processing (crop, watermark, batch, EXIF), image library management.*

### [4.0.0] — Phase 4 (TBD)

*Target: Production hardening — testing, monitoring, security, admin dashboard.*

---

## How to Version This Project

This project follows **SemVer 2.0.0**:

- **Major** — breaking API changes, DB schema migrations, complete feature phases
- **Minor** — new operations, new endpoints, non-breaking feature additions
- **Patch** — bug fixes, refactoring, dependency updates, documentation

When cutting a release:
1. Update version in `server/pyproject.toml` and `client/package.json`
2. Move items from "Unreleased" to a new version header
3. Tag the commit with `vMAJOR.MINOR.PATCH`
4. Update this file's "Current" section

---

*Legend: ✅ Complete · 🟡 Partial · ❌ Missing · 🚧 In Progress · 📅 Planned*
