# GitOdyssey

GitOdyssey is a code intelligence platform for Git repositories. It combines semantic AI search, code review, chat, and commit summaries in an AI-driven workflow that runs on your own machine.

## Features

- Semantic AI search across commit history, file changes, and diff hunks using embeddings and pgvector
- Code review with structured findings, severity levels, and file or line anchors
- Security-focused review workflows via custom instructions for auth, validation, secrets handling, and risky behavior changes
- Local-first architecture with Electron, FastAPI, PostgreSQL + pgvector, and macOS Keychain-backed secret storage
- Provider flexibility with OpenAI and OpenAI-compatible text and embeddings endpoints

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
- Conda or another Python 3.13 environment manager

### 1. Install JavaScript dependencies

```bash
npm install --prefix frontend
npm install --prefix desktop
```

### 2. Create the Python environment

Use the provided Conda environment so the native Python dependencies stay on the supported Python 3.13 toolchain:

```bash
conda env create -f backend/environment.yml
conda activate git-odyssey
```

### 3. Start the local database

Development currently uses a local PostgreSQL + pgvector container:

```bash
docker compose up -d db
```

### 4. Launch the desktop app

```bash
npm start
# or
npm run desktop:dev
```

## AI Configuration

On first launch, GitOdyssey prompts for:

- a text-generation provider and model
- an embeddings provider and model, or an explicit text-only mode

Provider secrets are stored in the macOS Keychain. The Electron shell passes the structured AI runtime configuration and resolved secrets to the local FastAPI sidecar at runtime.

GitOdyssey expects an OpenAI-style `/v1/responses` endpoint for chat, summaries, and review generation, plus `/v1/embeddings` for semantic AI search when embeddings are enabled.

## Optional Backend Overrides

You usually do not need a `backend/src/.env` file in desktop development. If you want to run the backend directly or override local defaults, copy the example file and adjust it:

```bash
cp backend/src/.env.example backend/src/.env
```

The desktop-oriented example supports:

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/gitodyssey
DATABASE_SSLMODE=disable
AI_RUNTIME_CONFIG_JSON={"schema_version":1,"profiles":[{"id":"openai-default","provider_type":"openai","label":"OpenAI","base_url":"https://api.openai.com","auth_mode":"bearer","api_key_secret_ref":"provider:openai-default:api-key","supports_text_generation":true,"supports_embeddings":true}],"capabilities":{"text_generation":{"provider_profile_id":"openai-default","model_id":"gpt-5.4-mini","temperature":0.2},"embeddings":{"provider_profile_id":"openai-default","model_id":"text-embedding-3-small"}}}
AI_SECRET_VALUES_JSON={"provider:openai-default:api-key":"your-openai-api-key"}
```

## Useful Commands

```bash
npm start
npm run desktop:dev
npm run desktop:build
npm run desktop:smoke
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
- Non-secret desktop config: `~/Library/Application Support/git-odyssey-desktop/desktop-config.json`
- Recent Git projects: stored in `desktop-config.json` and pruned automatically if the path is missing or no longer a Git repo
- Desktop logs: `~/Library/Application Support/git-odyssey-desktop/logs/`
- Backend log: `~/Library/Application Support/git-odyssey-desktop/logs/backend.log`

## Project Status

- The repo is desktop-only; there is no supported browser deployment path
- The root Compose file is only for local Postgres during development
- `desktop:build` packages the Electron shell and renderer; bundling the FastAPI sidecar and PostgreSQL distribution into a clean-machine macOS build is still the remaining packaging milestone

## Contributors

- Dylan Pina
- William Sullivan
- Pranav Senthilvel