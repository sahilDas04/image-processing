# Image Processing Web App — Architecture & PRD

> **Status:** MVP Complete · Phase 2 planned  
> **Last Updated:** 2026-07-30

---

## 1. Product Overview

A web application that lets users upload an image, apply one or more processing operations (grayscale, blur, sharpen, enhance, rotate, resize, compress), preview the result side-by-side with the original, and download the output.

### Goals

1. **Single-image processing** — upload, transform, preview, download.
2. **Pluggable processor architecture** — easy to add new image operations.
3. **Production-ready foundation** — auth, database, background jobs, monitoring.
4. **Self-service image management** — library, history, batch operations.

### Non-Goals (Phase 1)

- Multi-user auth (Phase 2)
- Background processing / job queue (Phase 2)
- Image library / history (Phase 2)
- Batch processing (Phase 3)

---

## 2. Current Architecture (MVP)

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (User)                        │
│  React 19 + Vite + TailwindCSS 4 + shadcn/ui + TS 6     │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  App.tsx — Single-page upload → process → preview   │ │
│  │  State: useState (file, operation, resultUrl, …)    │ │
│  │  HTTP: fetch() multipart POST → /api/v1/images/process│ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────┘
                           │ POST multipart/form-data
                           ▼
┌─────────────────────────────────────────────────────────┐
│              FastAPI Backend (port 8000)                 │
│                                                         │
│  ┌──────────┐  ┌────────────┐  ┌────────────────────┐  │
│  │ main.py  │  │  CORS +    │  │ Exception handlers │  │
│  │ app wire │  │  Security  │  │ (AppError, 422,500)│  │
│  │          │  │  Headers   │  └────────────────────┘  │
│  └──────────┘  └────────────┘                           │
│       │                                                 │
│       ▼                                                 │
│  ┌──────────────────────────────────────────────────┐   │
│  │              API Router (/api/v1)                │   │
│  │  ┌──────────────────────────────────────────────┐│   │
│  │  │  POST /images/process                        ││   │
│  │  │  GET  /health                                ││   │
│  │  │  GET  /                                      ││   │
│  │  └──────────────────────────────────────────────┘│   │
│  └──────────────────────────────────────────────────┘   │
│       │                                                 │
│       ▼                                                 │
│  ┌──────────────────────────────────────────────────┐   │
│  │          ImageProcessingService                  │   │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────────┐ │   │
│  │  │Validate  │  │  EXIF    │  │  Encode output │ │   │
│  │  │ MIME +   │→ │transpose │→ │  (PNG/JPEG/    │ │   │
│  │  │Signature │  │          │  │   WebP)        │ │   │
│  │  └──────────┘  └──────────┘  └────────────────┘ │   │
│  └──────────────────────┬───────────────────────────┘   │
│                         │                               │
│                         ▼                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │        ProcessorRegistry + ImageProcessors        │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │   │
│  │  │Grayscale │ │  Blur    │ │    Sharpen       │  │   │
│  │  ├──────────┤ ├──────────┤ ├──────────────────┤  │   │
│  │  │ Enhance  │ │  Rotate  │ │    Resize        │  │   │
│  │  ├──────────┤ ├──────────┤ ├──────────────────┤  │   │
│  │  │ReduceSize│ │ Compress │ │    Convert       │  │   │
│  │  └──────────┘ └──────────┘ └──────────────────┘  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Pillow (PIL) — all image processing operations  │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Current Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| **Frontend** | React 19 + TypeScript 6 | `client/` |
| **Build** | Vite 8 | TailwindCSS 4, shadcn/ui |
| **Backend** | FastAPI (Python 3.12) | `server/` |
| **Image Library** | Pillow 12 | All processing ops |
| **Validation** | Pydantic v2 + Pydantic-Settings | Schemas + config |
| **Packaging** | uv | `pyproject.toml` + `uv.lock` |

### Data Flow (Process Image)

```
User uploads file
    │
    ▼
1. FormData = file + operation + params → POST /api/v1/images/process
    │
    ▼
2. FastAPI parses UploadFile + Form fields → ImageProcessOptions
    │
    ▼
3. ImageProcessingService._read_image_file()
    ├── Check MIME type ∈ {image/jpeg, image/png, image/webp}
    ├── Check file size ≤ max_upload_size_mb (default 10 MB)
    ├── Validate magic bytes (file signature)
    ├── PIL.Image.open() → decode
    └── ImageOps.exif_transpose() → normalize orientation
    │
    ▼
4. processor_registry.get(operation) → matching ImageProcessor
    │
    ▼
5. ImageProcessor.process(image, options) → transformed PIL Image
    │
    ▼
6. _encode_processed_image()
    ├── compress/reduce_size → JPEG
    ├── convert → selected output_format
    └── default → PNG
    │
    ▼
7. Response(content=bytes, media_type=..., Content-Disposition=inline)
    │
    ▼
8. Browser creates blob URL → side-by-side preview
```

---

## 3. Planned Architecture (Phase 2 — Full Product)

```
┌────────────────────────────────────────────────────────────────────┐
│                          Browser                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │  Upload  │  │  Image   │  │  Job     │  │  Admin Dashboard  │  │
│  │  Page    │  │  Library │  │  History │  │  (future)         │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───────────────────┘  │
│       │              │             │                               │
│  ┌────▼──────────────▼─────────────▼────────────────────────────┐  │
│  │              React Router 7 + TanStack Query                 │  │
│  │  Axios client with JWT interceptor + React Hook Form + Zod   │  │
│  └─────────────────────────┬────────────────────────────────────┘  │
└─────────────────────────────┬──────────────────────────────────────┘
                              │ HTTPS
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│                     Nginx Reverse Proxy                             │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────┐  │
│  │  SSL/TLS     │  │  Rate Limit  │  │  Static File Serving    │  │
│  └──────────────┘  └──────────────┘  └─────────────────────────┘  │
└─────────────────────────────┬──────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│                     FastAPI Backend                                 │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Middleware: CORS · Security Headers · Request Timing · JWT  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  /api/v1                                                     │  │
│  │  ├── POST /auth/google          — Google OAuth login         │  │
│  │  ├── POST /auth/logout          — Session invalidation        │  │
│  │  ├── POST /upload               — Upload image file           │  │
│  │  ├── GET  /images               — List user's images          │  │
│  │  ├── GET  /images/{id}          — Get image metadata          │  │
│  │  ├── DELETE /images/{id}        — Soft-delete image           │  │
│  │  ├── POST /images/{id}/process  — Process an image            │  │
│  │  ├── GET  /jobs                 — List processing jobs        │  │
│  │  ├── GET  /jobs/{id}            — Job status                  │  │
│  │  └── ...                         — Admin endpoints            │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Services                    │  Repositories                  │  │
│  │  ├── AuthService             │  ├── UserRepository            │  │
│  │  ├── ImageService            │  ├── ImageRepository           │  │
│  │  ├── ProcessingService       │  ├── JobRepository             │  │
│  │  ├── JobService              │  ├── VariantRepository         │  │
│  │  ├── StorageService          │  └── AuditRepository           │  │
│  │  └── AuditService            │                               │  │
│  └──────────────────────────────┴───────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Models (SQLAlchemy)                                         │  │
│  │  ├── User        — id, google_sub, email, name, created_at   │  │
│  │  ├── Image       — id, user_id, filename, size, ...          │  │
│  │  ├── Job         — id, image_id, status, result, ...         │  │
│  │  ├── Variant     — id, image_id, operation, output_path, ... │  │
│  │  └── AuditLog    — id, user_id, action, timestamp, ...       │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────┬──────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                  ▼
┌──────────────────┐ ┌──────────────┐ ┌──────────────────┐
│   PostgreSQL     │ │    Redis     │ │  Object Storage  │
│  (Primary DB)    │ │  (Cache +    │ │  (Local/S3/R2/   │
│                  │ │   Celery     │ │   MinIO)         │
│  · Users         │ │   Broker)    │ │                  │
│  · Images        │ │              │ │  · Image files   │
│  · Jobs          │ │              │ │  · Processed     │
│  · Variants      │ │              │ │    variants      │
│  · Audit logs    │ │              │ │  · Thumbnails    │
└──────────────────┘ └──────────────┘ └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  Celery Worker   │
                    │  (Background)    │
                    │                  │
                    │  · Process jobs  │
                    │  · Send emails   │
                    │  · Cleanup       │
                    └──────────────────┘
```

### Planned Stack Additions

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Auth** | Google OAuth (authlib) + JWT | User login |
| **Database** | PostgreSQL + SQLAlchemy 2.0 + Alembic | Persistence |
| **Cache/Queue** | Redis + Celery | Background jobs |
| **Storage** | Local + S3/R2/MinIO abstraction | Image file storage |
| **Proxy** | Nginx | Reverse proxy, SSL, rate limiting |
| **Frontend** | React Router 7 + TanStack Query + React Hook Form + Zod + Axios | SPA routing, data fetching, forms |
| **Testing** | pytest + pytest-asyncio + Playwright | API + E2E tests |
| **Monitoring** | Prometheus + Sentry | Metrics + error tracking |

---

## 4. Database Schema (Planned)

```sql
-- Users authenticated via Google OAuth
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_sub    VARCHAR(255) UNIQUE NOT NULL,
    email         VARCHAR(255) UNIQUE NOT NULL,
    name          VARCHAR(255),
    avatar_url    TEXT,
    is_admin      BOOLEAN DEFAULT FALSE,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ        -- soft delete
);

-- Uploaded images
CREATE TABLE images (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id),
    filename      VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type     VARCHAR(50) NOT NULL,
    size_bytes    INTEGER NOT NULL,
    width         INTEGER,
    height        INTEGER,
    storage_key   TEXT NOT NULL,       -- path in storage provider
    checksum      VARCHAR(64),         -- SHA-256 for dedup
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ
);

-- Processing job records
CREATE TABLE jobs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id),
    image_id      UUID NOT NULL REFERENCES images(id),
    operation     VARCHAR(50) NOT NULL,
    params        JSONB,
    status        VARCHAR(20) DEFAULT 'pending',  -- pending/running/done/failed
    error_message TEXT,
    started_at    TIMESTAMPTZ,
    completed_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Processed image variants
CREATE TABLE variants (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id        UUID NOT NULL REFERENCES jobs(id),
    image_id      UUID NOT NULL REFERENCES images(id),
    operation     VARCHAR(50) NOT NULL,
    params        JSONB,
    storage_key   TEXT NOT NULL,
    mime_type     VARCHAR(50) NOT NULL,
    size_bytes    INTEGER NOT NULL,
    width         INTEGER,
    height        INTEGER,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Audit log
CREATE TABLE audit_logs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID REFERENCES users(id),
    action        VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id   UUID,
    details       JSONB,
    ip_address    INET,
    user_agent    TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 5. API Contract (Planned Full Set)

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/google` | Google OAuth callback → JWT |
| POST | `/api/v1/auth/logout` | Invalidate session |
| GET | `/api/v1/auth/me` | Current user profile |

### Images
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/upload` | Upload image file(s) |
| GET | `/api/v1/images` | List user's images (paginated, filterable) |
| GET | `/api/v1/images/{id}` | Get image metadata |
| DELETE | `/api/v1/images/{id}` | Soft-delete image |
| PATCH | `/api/v1/images/{id}` | Update image metadata |
| POST | `/api/v1/images/{id}/process` | Process a stored image |

### Processing Jobs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/jobs` | List jobs (filterable by status) |
| GET | `/api/v1/jobs/{id}` | Job status + result |
| POST | `/api/v1/jobs/{id}/retry` | Retry a failed job |
| POST | `/api/v1/jobs/{id}/cancel` | Cancel a pending job |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/admin/users` | List users |
| GET | `/api/v1/admin/queue` | Queue depth / stats |
| GET | `/api/v1/admin/storage` | Storage usage |
| GET | `/api/v1/admin/health` | Full system health |

---

## 6. Processor Architecture (Extensibility)

```
ImageProcessor (ABC)
├── operation: ImageOperation    ← enum identifying this processor
└── process(image, options) → Image.Image
                                   ↓
                           ProcessorRegistry
                           ├── get(operation) → ImageProcessor
                           └── register(processor)
```

**To add a new operation:**
1. Add enum value in `ImageOperation` (`app/schemas/images.py`)
2. Add form field in route (`app/api/routes/images.py`)
3. Create processor class in `app/services/processors/`
4. Register in `processor_registry` (`registry.py`)

**Current Processors:**
| Processor | Operation | Description |
|-----------|-----------|-------------|
| `GrayscaleProcessor` | `grayscale` | Convert to grayscale |
| `BlurProcessor` | `blur` | Gaussian blur (radius 4) |
| `SharpenProcessor` | `sharpen` | Sharpening filter |
| `QualityEnhancementProcessor` | `enhance` | Auto-contrast + contrast/sharpness/color boost |
| `RotateProcessor` | `rotate` | Rotate by angle (-360 to 360) |
| `ResizeProcessor` | `resize` | Resize to (width × height) using LANCZOS |
| `SizeReductionProcessor` | `reduce_size` | Thumbnail to max_dimension + JPEG compression |
| `CompressProcessor` | `compress` | Strip alpha, output JPEG |
| `ConvertProcessor` | `convert` | Convert between JPEG/PNG/WebP |

---

## 7. Security Architecture (Planned)

### Current
- ✅ File MIME type validation (content-type check)
- ✅ File signature / magic bytes validation (JPEG, PNG, WebP)
- ✅ File size limit (configurable)
- ✅ CORS whitelist for local origins
- ✅ Security headers: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy
- ✅ Consistent JSON error format (no stack leaks)

### Phase 2 Additions
- ❌ JWT-based authentication (access + refresh tokens)
- ❌ Google OAuth 2.0 validation (server-side token verification)
- ❌ Rate limiting (per-user and per-IP)
- ❌ Virus scanning (ClamAV API or similar)
- ❌ HTTPS termination (Nginx)
- ❌ Secrets management (env-based, secret rotation ready)
- ❌ SQL injection prevention (SQLAlchemy ORM — parameterized by design)
- ❌ Per-user resource isolation (all queries scoped to user_id)

### Data Privacy
- Images are user-scoped; users see only their own images
- Processing results are stored alongside originals
- Audit log tracks all mutations
- Soft delete with configurable retention period

---

## 8. Phased Implementation Roadmap

### Phase 1: MVP ✅ (Current State)
- [x] FastAPI backend with health check
- [x] Single POST /api/v1/images/process endpoint
- [x] 7 image processing operations
- [x] Pluggable processor registry
- [x] File validation (MIME + magic bytes)
- [x] Consistent error responses
- [x] Security headers middleware
- [x] Basic structured logging
- [x] React frontend with upload, controls, preview
- [x] Original vs processed file size display
- [x] shadcn/ui component library integration

### Phase 2: Production Foundation (Next)
- [ ] Google OAuth authentication + JWT
- [ ] PostgreSQL database + SQLAlchemy models + Alembic migrations
- [ ] Repository layer (data access abstraction)
- [ ] Storage abstraction (local / S3 / R2 / MinIO)
- [ ] Image management API (CRUD + listing)
- [ ] Processing jobs system (records, status, history)
- [ ] Celery background worker for async processing
- [ ] Redis for caching + job broker
- [ ] Docker Compose (app + DB + Redis + worker + Nginx)
- [ ] Frontend routing (React Router)
- [ ] TanStack Query for data fetching
- [ ] React Hook Form + Zod for forms
- [ ] Axios HTTP client with JWT interceptor
- [ ] Drag-and-drop upload UI
- [ ] Download button for processed images
- [ ] Notifications (toast + email)

### Phase 3: Power Features
- [ ] Batch image processing
- [ ] Image library with search, filter, sort
- [ ] Thumbnail generation
- [ ] Watermark processor
- [ ] Crop processor
- [ ] Metadata extraction (EXIF, etc.)
- [ ] Batch download (zip)
- [ ] Upload progress indicators
- [ ] Cancel upload / cancel job
- [ ] Duplicate detection (SHA-256)

### Phase 4: Production Hardening
- [ ] Rate limiting (per-user + per-IP)
- [ ] Virus scanning
- [ ] Request timing / audit logging
- [ ] Prometheus metrics
- [ ] Sentry error tracking
- [ ] Pytest test suite (unit + integration)
- [ ] Frontend component tests (Vitest + Testing Library)
- [ ] E2E tests (Playwright)
- [ ] Admin dashboard (users, queue, storage, system health)
- [ ] Security hardening (HTTPS, secrets management)
- [ ] Monitoring dashboards

---

## 9. Directory Structure (Final Target)

```
image-processing/
├── ARCHITECTURE_PRD.md
├── CHANGELOG.md
├── PROGRESS.md
├── README.md
├── docker-compose.yml          # All services
├── docker-compose.dev.yml      # Dev overrides
├── .env.example
├── server/
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── alembic.ini
│   ├── alembic/
│   │   └── versions/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   │   ├── router.py
│   │   │   ├── deps.py              ← Dependency injection
│   │   │   └── routes/
│   │   │       ├── __init__.py
│   │   │       ├── auth.py
│   │   │       ├── images.py
│   │   │       ├── jobs.py
│   │   │       └── admin.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   ├── exceptions.py
│   │   │   ├── logging.py
│   │   │   └── security.py          ← JWT, password utils
│   │   ├── db/
│   │   │   ├── base.py              ← Declarative base
│   │   │   ├── session.py           ← Engine + session factory
│   │   │   └── models/
│   │   │       ├── user.py
│   │   │       ├── image.py
│   │   │       ├── job.py
│   │   │       ├── variant.py
│   │   │       └── audit_log.py
│   │   ├── middleware/
│   │   │   ├── security_headers.py
│   │   │   └── timing.py
│   │   ├── repositories/
│   │   │   ├── base.py
│   │   │   ├── user_repo.py
│   │   │   ├── image_repo.py
│   │   │   ├── job_repo.py
│   │   │   └── audit_repo.py
│   │   ├── schemas/
│   │   │   ├── auth.py
│   │   │   ├── images.py
│   │   │   └── jobs.py
│   │   ├── services/
│   │   │   ├── auth_service.py
│   │   │   ├── image_processing.py
│   │   │   ├── image_service.py
│   │   │   ├── job_service.py
│   │   │   ├── storage_service.py
│   │   │   ├── audit_service.py
│   │   │   └── processors/
│   │   │       ├── base.py
│   │   │       ├── registry.py
│   │   │       ├── basic.py
│   │   │       └── ...
│   │   ├── storage/
│   │   │   ├── base.py              ← StorageProvider ABC
│   │   │   ├── local.py
│   │   │   └── s3.py
│   │   └── utils/
│   │       └── ...
│   ├── tests/
│   │   ├── conftest.py
│   │   ├── test_api/
│   │   ├── test_services/
│   │   └── test_processors/
│   └── worker/
│       ├── celery_app.py
│       └── tasks.py
├── client/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── index.css
│       ├── lib/
│       │   ├── utils.ts
│       │   └── api.ts            ← Axios instance + JWT interceptor
│       ├── hooks/
│       │   ├── useAuth.ts
│       │   └── useImages.ts
│       ├── components/
│       │   ├── ui/               ← shadcn components
│       │   ├── layout/
│       │   ├── upload/
│       │   ├── viewer/
│       │   └── jobs/
│       ├── pages/
│       │   ├── Home.tsx
│       │   ├── Login.tsx
│       │   ├── Library.tsx
│       │   ├── JobHistory.tsx
│       │   └── Admin.tsx
│       ├── stores/
│       │   └── auth.ts
│       └── types/
│           └── index.ts
├── nginx/
│   ├── Dockerfile
│   └── nginx.conf
└── scripts/
    ├── seed.py
    └── migrate.sh
```

---

## 10. Key Design Decisions

### Why FastAPI over Django/Flask
- Async-native for IO-bound image processing
- Built-in Pydantic validation (request/response schemas)
- Automatic OpenAPI docs
- Lightweight — right-sized for an image processing API

### Why Pillow over OpenCV/ImageMagick
- Pure Python — no system dependencies for basic ops
- Sufficient for the current feature set (web image processing)
- Well-documented, stable API
- Can swap for OpenCV later if performance demands

### Why SQLAlchemy over raw SQL
- Migration management (Alembic)
- Relationship loading for users/images/jobs/variants
- Database-agnostic (local dev with PostgreSQL, swap if needed)

### Why Repository Pattern
- Isolates data access from business logic
- Makes unit testing trivial (mock repositories)
- Consistent interface regardless of storage backend

### Why Storage Abstraction
- Development: local filesystem (zero setup)
- Production: S3-compatible (R2, MinIO, AWS S3)
- Future: CDN integration
- No code changes — swap provider via config

---

## 11. Monitoring & Observability Plan

| Concern | Tool | What |
|---------|------|------|
| **Request metrics** | Prometheus | Request count, latency (p50/p95/p99), error rate |
| **Error tracking** | Sentry | Unhandled exceptions, grouped by stack trace |
| **Worker monitoring** | Celery Flower | Queue depth, worker count, task success/fail |
| **Application logs** | Structured JSON | `logging` → stdout → log aggregator |
| **Health checks** | `/health` + `/admin/health` | DB connectivity, Redis, storage, worker |
| **Database** | pg_stat_statements | Slow queries, connection pool |
| **System** | Docker healthchecks | Container restarts, resource usage |

---

*This document is a living reference. Update it as architectural decisions are made or revised.*
