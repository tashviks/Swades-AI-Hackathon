#!/usr/bin/env bash
set -e

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
RESET="\033[0m"

info()    { echo -e "${BOLD}[setup]${RESET} $*"; }
success() { echo -e "${GREEN}[✓]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[!]${RESET} $*"; }
error()   { echo -e "${RED}[✗]${RESET} $*"; exit 1; }

# ─── 1. Check required tools ────────────────────────────────────────────────

info "Checking required tools..."

command -v node  >/dev/null 2>&1 || error "Node.js is not installed. Install from https://nodejs.org"
command -v npm   >/dev/null 2>&1 || error "npm is not installed."
command -v docker >/dev/null 2>&1 || error "Docker is not installed. Install from https://docs.docker.com/get-docker/"

# Detect Colima socket if default docker socket is missing
if [ ! -S /var/run/docker.sock ] && [ -S "$HOME/.colima/default/docker.sock" ]; then
  export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"
  info "Using Colima Docker socket."
fi

# Check docker is actually running
docker info >/dev/null 2>&1 || error "Docker daemon is not running. Start Docker (or Colima) and re-run this script."

success "Node $(node -v), npm $(npm -v), Docker found."

# ─── 2. Install Bun ─────────────────────────────────────────────────────────

if ! command -v bun >/dev/null 2>&1 && [ ! -f "$HOME/.bun/bin/bun" ]; then
  info "Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
  success "Bun installed."
else
  export PATH="$HOME/.bun/bin:$PATH"
  success "Bun found."
fi

# ─── 3. Copy env files ──────────────────────────────────────────────────────

info "Setting up environment files..."

if [ ! -f apps/server/.env ]; then
  cp apps/server/.env.example apps/server/.env
  warn "Created apps/server/.env from example. Set your ASSEMBLY_AI_API_KEY in it."
else
  success "apps/server/.env already exists."
fi

if [ ! -f apps/web/.env.local ]; then
  cp apps/web/.env.local.example apps/web/.env.local
  success "Created apps/web/.env.local."
else
  success "apps/web/.env.local already exists."
fi

# ─── 4. Install npm dependencies ────────────────────────────────────────────

info "Installing npm dependencies..."
npm install --legacy-peer-deps
success "Dependencies installed."

# ─── 5. Start Docker services ───────────────────────────────────────────────

info "Starting Postgres and MinIO via Docker Compose..."
docker-compose -f packages/db/docker-compose.yml up -d
success "Containers started."

# Wait for Postgres to be healthy
info "Waiting for Postgres to be ready..."
for i in $(seq 1 30); do
  if docker-compose -f packages/db/docker-compose.yml exec -T postgres pg_isready -U postgres >/dev/null 2>&1; then
    success "Postgres is ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    error "Postgres did not become ready in time."
  fi
  sleep 1
done

# ─── 6. Create MinIO bucket ─────────────────────────────────────────────────

info "Creating MinIO bucket 'chunks'..."
# Wait a moment for MinIO to start
sleep 3
docker-compose -f packages/db/docker-compose.yml exec -T minio \
  mc alias set local http://localhost:9000 minioadmin minioadmin >/dev/null 2>&1 || true
docker-compose -f packages/db/docker-compose.yml exec -T minio \
  mc mb --ignore-existing local/chunks >/dev/null 2>&1 || true
success "MinIO bucket ready."

# ─── 7. Push DB schema ──────────────────────────────────────────────────────

info "Pushing database schema..."
# Use psql inside the container to avoid host connectivity issues
CONTAINER=$(docker-compose -f packages/db/docker-compose.yml ps -q postgres)
docker exec "$CONTAINER" psql -U postgres -d my-better-t-app -c "
  CREATE TABLE IF NOT EXISTS chunks (
    id uuid PRIMARY KEY,
    session_id text NOT NULL,
    bucket_key text NOT NULL,
    acked_at timestamp NOT NULL DEFAULT now(),
    reconciled boolean NOT NULL DEFAULT false,
    user_name text NOT NULL DEFAULT 'Unknown',
    transcript text
  );
" >/dev/null 2>&1
success "Database schema applied."

# ─── 8. Done ────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}${BOLD}Setup complete!${RESET}"
echo ""
echo "  Before starting, make sure to set your AssemblyAI API key:"
echo -e "  ${BOLD}apps/server/.env${RESET}  →  ASSEMBLY_AI_API_KEY=<your_key>"
echo ""
echo "  Get a free key at: https://www.assemblyai.com/dashboard"
echo ""
echo "  Then start the project:"
echo -e "  ${BOLD}npm run dev${RESET}"
echo ""
echo "  Web app  →  http://localhost:3001"
echo "  API      →  http://localhost:3000"
echo "  MinIO    →  http://localhost:9001  (minioadmin / minioadmin)"
echo ""
