# GitOdyssey

GitOdyssey is a code intelligence platform for Git repositories. It combines semantic AI search, code review, chat, and commit summaries in an AI-driven workflow that runs on your own machine.

## Features

- Semantic AI search across commit history, file changes, and diff hunks using embeddings and pgvector
- Code review with structured findings, severity levels, and file or line anchors
- Security-focused review workflows via custom instructions for auth, validation, secrets handling, and risky behavior changes
- Local-first architecture with Electron, FastAPI, PostgreSQL + pgvector, and macOS Keychain-backed secret storage
- Google AI setup through Google Cloud ADC, Model Garden target discovery, and Vertex AI-compatible endpoints

## Multi-Agent Review Architecture

GitOdyssey's review pipeline is built as an orchestrated local intelligence runtime:

- The Electron desktop shell opens local repositories, manages provider configuration, and starts the local backend
- The FastAPI sidecar ingests repository history, stores embeddings, retrieves context, and persists review sessions and results
- PostgreSQL + pgvector power semantic AI search over commit messages and diff content
- The Codex review runtime creates a disposable Git worktree, primes a base thread, launches a dedicated review thread or rollout when available, and converts the completed analysis into structured JSON findings

This architecture supports broad PR reviews, targeted security reviews, regression sweeps, and follow-up investigation without relying on a hosted code intelligence service.

## Core Workflows

1. Open a local Git repository directly from disk.
2. Ingest commits into the local PostgreSQL + pgvector store.
3. Run semantic AI search to find relevant changes across commits, file changes, and hunks.
4. Ask repository questions in chat or inspect AI-generated commit summaries.
5. Review one local branch against another and generate structured findings.
6. Add custom instructions when you want a security review or a focused pass on a subsystem.

## Local Development

### Prerequisites

- macOS
- Node.js 20+
- Docker Desktop
- `uv`
- Google Cloud CLI (`gcloud`) for Application Default Credentials

### 1. Install JavaScript dependencies

```bash
npm install --prefix frontend
npm install --prefix desktop
```

### 2. Sync the Python environment

Use `uv` to create and manage the backend environment:

```bash
uv sync --project backend
```

This creates `backend/.venv`, which the desktop shell will use automatically in development. If you want to work inside the environment directly, you can activate it with:

```bash
source backend/.venv/bin/activate
```

### 3. Start the local database

Development currently uses a local PostgreSQL + pgvector container:

```bash
docker compose up -d db
```

The local container now runs an init script that enables the `vector` extension on first database creation. If you already have an older `postgres_data` volume from before this setup, recreate it once so the init script can run:

```bash
docker compose down -v
docker compose up -d db
```

### 4. Launch the desktop app

```bash
npm start
# or
npm run desktop:dev
```

## AI Configuration

GitOdyssey uses Google Cloud Application Default Credentials (ADC) for local Google AI calls. Before configuring models in the app, sign in with ADC:

```bash
gcloud auth application-default login
```

In the app settings, enter:

- Google Cloud project ID
- Region, for example `us-central1`
- Model Garden or endpoint targets for chat and summaries, semantic search, and code review

Use **Browse Targets** to load available Google AI targets for the configured project and region. Select one target for each workflow, validate the selected targets, then save.

GitOdyssey does not store Google provider secrets. The Electron shell passes the structured AI runtime configuration to the local FastAPI sidecar, and the sidecar uses your local ADC identity when calling Google Cloud.

## Optional Backend Overrides

You usually do not need a `backend/src/.env` file in desktop development. If you want to run the backend directly or override local defaults, copy the example file and adjust it:

```bash
cp backend/src/.env.example backend/src/.env
```

The desktop-oriented example supports:

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/gitodyssey
DATABASE_SSLMODE=disable
AI_RUNTIME_CONFIG_JSON={"schema_version":2,"google_project_id":"your-google-cloud-project","google_location":"us-central1","capabilities":{"text_generation":null,"embeddings":null,"review":null}}
```

## Useful Commands

```bash
npm start
npm run desktop:dev
npm run desktop:build
npm run desktop:smoke
npm run backend:sync
npm run backend:test
npm run frontend:lint
docker compose down
docker compose down -v
```

## Runtime Layout

- Renderer: `frontend/` built with Vite and loaded inside Electron
- Desktop shell: `desktop/` with Electron main, preload IPC bridge, keychain access, and backend orchestration
- Backend: `backend/` FastAPI sidecar running in desktop-only mode with a single local pseudo-user
- Database: local PostgreSQL + pgvector for development via the root `docker-compose.yml`

## Local Data

- Secrets: macOS Keychain
- Non-secret desktop config: `~/.git-odyssey/desktop-config.json`
- Recent Git projects: stored in `desktop-config.json` and pruned automatically if the path is missing or no longer a Git repo
- Desktop logs: `~/.git-odyssey/logs/`
- Backend log: `~/.git-odyssey/logs/backend.log`

## Project Status

- The repo is desktop-only; there is no supported browser deployment path
- The root Compose file is only for local Postgres during development
- `desktop:build` packages the Electron shell and renderer; bundling the FastAPI sidecar and PostgreSQL distribution into a clean-machine macOS build is still the remaining packaging milestone

## Contributors

- Dylan Pina
- William Sullivan
- Pranav Senthilvel
