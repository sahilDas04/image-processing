FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS build

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

# Install dependencies first for better layer caching.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

# Headers/libs required by Pillow and pypdfium2 at runtime.
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    libjpeg62-turbo \
    libopenjp2-7 \
    libtiff6 \
    libwebp7 \
    zlib1g \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app /app
WORKDIR /app

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

COPY . .

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]