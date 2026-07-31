# Image Processing Web App

React frontend + FastAPI backend for uploading images, applying processing operations, and previewing results.

> **Status:** MVP Complete → Phase 2 (Production Foundation) planned  
> 📘 [Architecture & PRD](ARCHITECTURE_PRD.md) · 📊 [Progress Tracker](PROGRESS.md) · 📋 [Changelog](CHANGELOG.md)

## Architecture

```text
image-processing/
  client/                 React + Vite UI
    src/App.tsx           Upload, controls, preview, processed result
  server/                 FastAPI API
    main.py               App wiring, CORS, middleware, exception handlers
    app/api/router.py     Versioned API router
    app/api/routes/       HTTP routes
    app/core/             Settings and app configuration
    app/middleware/       Request/response middleware
    app/schemas/          Request validation models
    app/services/         Business logic and processor orchestration
    app/services/processors/
                           Pluggable image processor implementations
```

The backend keeps concerns separated:

- `api` receives files and form fields.
- `schemas` validates operation inputs.
- `services` reads, validates, transforms, and encodes images.
- `services/processors` contains one processor per operation behind a common interface.
- `core` stores configuration such as CORS origins and upload limits.

New image operations should be added by creating a processor class and registering it in `app/services/processors/registry.py`.

## Run Locally

Start the backend:

```powershell
cd server
uv run fastapi dev main.py
```

Start the frontend in another terminal:

```powershell
cd client
pnpm dev
```

Open the Vite URL, usually `http://localhost:5173`.

## Current API

Health check:

```http
GET /health
```

Process image:

```http
POST /api/v1/images/process
Content-Type: multipart/form-data
```

Form fields:

- `file`: JPEG, PNG, or WebP image.
- `operation`: `grayscale`, `blur`, `sharpen`, `enhance`, `rotate`, `resize`, or `reduce_size`.
- `angle`: rotate angle, used by `rotate`.
- `width` and `height`: output size, required by `resize`.
- `strength`: enhancement strength from `1` to `3`, used by `enhance`.
- `quality`: JPEG quality from `10` to `95`, used by `reduce_size`.
- `max_dimension`: largest output width or height, used by `reduce_size`.

## Next Good Steps

- Add download button for processed output.
- Add more operations: crop, brightness, contrast, edge detection.
- Store processing history in a database if users need previous jobs.
- Move slow or large jobs to a background worker.
- Add authentication if images are private or user-specific.
