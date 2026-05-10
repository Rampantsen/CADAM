# CADAM FastAPI Backend

Local-first backend skeleton for CADAM. It replaces the Supabase runtime in
stages, starting with local auth, SQLite persistence, local file storage, and a
parametric chat streaming placeholder.

## Run

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.template .env
.venv/bin/uvicorn app.main:app --reload
```

Or from the repository root:

```bash
npm run dev:local
```

## Current Capabilities

- `GET /health`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `GET/PATCH /api/v1/profile`
- `GET/POST/PATCH/DELETE /api/v1/conversations`
- `GET/POST/PATCH /api/v1/conversations/{conversation_id}/messages`
- `POST /api/v1/conversations/{conversation_id}/files/images`
- `POST /api/v1/conversations/{conversation_id}/files/meshes`
- `POST /api/v1/conversations/{conversation_id}/files/previews`
- `GET /api/v1/conversations/{conversation_id}/files/{kind}/{asset_id}/download`
- `GET /api/v1/billing/status`
- `POST /api/v1/chat/parametric`

Registration and login use a local `username` plus `password`; no email address
or external auth provider is required for the FastAPI mode.

`/api/v1/chat/parametric` currently returns a placeholder OpenSCAD artifact as
newline-delimited JSON. Replace `app/services/chat.py` with the real model
orchestration when porting the Supabase `parametric-chat` logic.

## Runtime Data

Ignored local runtime files:

- `backend/.env`
- `backend/.venv/`
- `backend/cadam.sqlite3`
- `backend/data/`
