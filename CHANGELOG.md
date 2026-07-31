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

#### Changed
- Image validation (MIME, magic bytes, size) extracted to `app/services/image_validation.py`; used by both `/process` and `/upload`

#### Fixed
- `app/db/models/image.py` — `DateTime` used without being imported (broke app import)
- `Image.jobs` relationship missing the matching side of `Job.image` (`back_populates`) — broke SQLAlchemy mapper initialization

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
