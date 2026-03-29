# GitOdyssey Desktop

GitOdyssey is now a desktop-first, fully local codebase analysis app. The React UI runs inside Electron, the backend runs as a local FastAPI sidecar, and repository analysis stays on your machine.

## What Changed

- Browser deployment, hosted auth, and cloud infrastructure settings have been removed.
- GitHub OAuth, GitHub App setup, cookies, and session secrets are no longer part of the runtime model.
- Desktop users configure AI providers during first-run setup, and provider secrets are stored locally in the macOS Keychain.
- The desktop shell owns renderer loading, backend startup, health checks, and local configuration.
- Repositories are opened directly from local disk with a Git Project picker and recent-project shortcuts.

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

On first launch, GitOdyssey will prompt for:

- a text-generation provider and model
- an embeddings provider and model, or an explicit text-only mode

Provider secrets are stored in the macOS Keychain. The Electron shell passes the structured AI runtime config and resolved secrets to the local FastAPI sidecar at runtime.

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

## Desktop Runtime Layout

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

## Current Development Notes

- The repo is desktop-only now; there is no supported browser deployment path.
- The root Compose file is only for local Postgres during development.
- `desktop:build` packages the Electron shell and renderer. Bundling the FastAPI sidecar and PostgreSQL distribution into a clean-machine macOS build is still the remaining packaging milestone.

## Contributors

- Dylan Pina
- William Sullivan
- Pranav Senthilvel
