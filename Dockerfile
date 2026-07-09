# Sidefoot live pipeline — container image for the long-running worker.
#
# The worker holds the TxLINE odds/scores SSE streams open, proves goals on-chain
# (validate_stat), detects lagging markets, and alerts via Herald. It has no HTTP
# port. Runs the same on any container host (Docker, Render, Fly, Railway) — and
# on Linux networking the intermittent Windows "fetch failed" reconnects vanish.
#
#   docker build -t sidefoot-pipeline .
#   docker run --rm --env-file .env -v "$PWD/data:/app/data" sidefoot-pipeline

FROM node:20-bookworm-slim

# git + CA certs are needed to fetch the `github:` txline-anchor dependency and
# build its dist/ during install.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm

WORKDIR /app

# Install deps first for layer caching. Copy the workspace manifests (the root
# worker + the dashboard package.json, which the lockfile references) but scope
# the install to just the `sidefoot` worker so the Next.js dashboard deps are
# never pulled into this image.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY dashboard/package.json ./dashboard/package.json
RUN pnpm install --frozen-lockfile --filter sidefoot

# The worker runs TypeScript directly via tsx — no build step, just the source.
COPY tsconfig.json ./
COPY src ./src

# Observability log lands here; mount a volume to persist it across restarts.
VOLUME ["/app/data"]

# Secrets/config are provided at run time (docker run --env-file .env …), so the
# dotenv call in src/env.ts simply finds nothing and falls back to process.env.
CMD ["pnpm", "start"]
