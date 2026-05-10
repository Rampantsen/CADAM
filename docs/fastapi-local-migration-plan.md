# CADAM FastAPI Local Migration Plan

This plan migrates CADAM from Supabase Edge Functions plus hosted storage assumptions toward a local FastAPI backend while keeping the current React/Vite frontend and CAD generation behavior intact.

## Goals

- Run CADAM locally with a first-party FastAPI service for chat, file upload, artifact persistence, and CAD generation orchestration.
- Preserve the existing logged-in user experience during migration; do not collapse the app into anonymous-only mode unless that becomes an explicit product decision.
- Replace Supabase Storage and Edge Function runtime dependencies with local filesystem storage and a local database.
- Keep OpenSCAD compilation in the browser worker unless a later stage intentionally adds server-side compilation.
- Keep migration incremental: frontend can switch endpoint-by-endpoint instead of requiring a full rewrite.

## Non-Goals

- No UI redesign.
- Documentation comes first, followed by scoped code-generation agents for
  backend, frontend adapter, startup tooling, and validation.
- No removal of the existing Supabase implementation until local parity is tested.
- No production deployment plan beyond local-first architecture choices.

## Multi-Agent Implementation Split

1. Backend API agent
   - Create the FastAPI app, routers, request/response schemas, streaming responses, and error format.
   - Own endpoint parity for `parametric-chat`, `creative-chat`, mesh upload, image upload, conversations, messages, and billing status.

2. Data/storage agent
   - Define SQLite schema, migrations, local file layout, and repository utilities.
   - Own migration scripts from current Supabase tables/storage exports into local folders and SQLite rows.

3. Auth/session agent
   - Implement local auth that preserves the current login surface.
   - Own password/session handling, development seed user, token verification dependency, and frontend auth compatibility notes.

4. Frontend integration agent
   - Add a backend adapter layer in the frontend so Supabase Function calls can be replaced route by route.
   - Own streaming client compatibility, upload URL changes, and feature flags for Supabase-vs-FastAPI selection.

5. CAD/runtime agent
   - Port Edge Function shared logic for message-tree context, image/mesh formatting, billing hooks, model calls, and artifact streaming.
   - Own parity tests for OpenSCAD artifact shape and parameter extraction.

6. QA/docs agent
   - Build the local test matrix, smoke scripts, and migration checklist.
   - Keep docs synchronized with endpoint contracts and rollout status.

## Local Storage, DB, and Auth Decisions

### Storage

- Use local filesystem storage under a configurable root, defaulting to `backend/data`.
- Store user uploads by stable path:

```text
backend/data/{user_id}/{conversation_id}/images/{asset_filename}
backend/data/{user_id}/{conversation_id}/meshes/{asset_filename}
backend/data/{user_id}/{conversation_id}/previews/{asset_filename}
```

- Store metadata in the database, not in filename conventions.
- Serve files through authenticated FastAPI routes rather than direct static mounts for user-owned content.

### Database

- Use SQLite for local development and single-user/self-hosted installs.
- Use SQLAlchemy with SQLite table creation for the first local skeleton; add
  Alembic before schema changes become production-facing.
- Preserve core entities:
  - `users`
  - `sessions`
  - `conversations`
  - `messages`
  - `images`
  - `meshes`
  - `billing_events` or local credit ledger
- Keep message content JSON-compatible with the existing `Content` and `ParametricArtifact` contracts.
- Preserve tree-shaped message history with `parent_id` so branch replay remains equivalent to the current implementation.

### Auth

- Keep login required by default.
- Implement local username/password auth with secure password hashing and signed session tokens.
- Start without a silent auto-login; users register through the local auth API.
- Keep route-level ownership checks equivalent to Supabase RLS: every conversation, message, image, and mesh query must filter by authenticated `user_id`.
- Keep billing local and unlimited by default, while exposing a compatibility endpoint for the existing balance UI.

## API and Data Flow

### Endpoint Map

| Current responsibility | FastAPI route | Notes |
| --- | --- | --- |
| Auth login/session | `POST /api/v1/auth/login`, `GET /api/v1/auth/me` | Local session token replaces Supabase auth token. |
| Billing status | `GET /api/billing/status` | Return unlimited/local plan fields expected by UI. |
| Conversation list/detail | `GET/POST /api/conversations`, `GET /api/conversations/{id}` | Always user-scoped. |
| Message insert | `POST /api/conversations/{id}/messages` | Creates user message before generation. |
| Parametric chat | `POST /api/chat/parametric` | Streams assistant artifact updates. |
| Creative chat | `POST /api/chat/creative` | Port after parametric parity. |
| Image upload | `POST /api/v1/conversations/{id}/files/images` | Writes file plus `images` row. |
| Mesh upload | `POST /api/v1/conversations/{id}/files/meshes` | Writes file plus `meshes` row and metadata. |
| File read | `GET /api/v1/conversations/{id}/files/{kind}/{asset_id}/download` | Authenticated file serving. |

### Parametric Chat Flow

```text
Frontend submits text/image/mesh
  -> FastAPI authenticates session token
  -> image/mesh metadata is registered if needed
  -> user message is inserted with parent_id
  -> assistant placeholder message is inserted
  -> backend loads current message branch
  -> backend resolves referenced images/meshes from local storage
  -> outer model call selects tool or parameter update
  -> strict code generation streams OpenSCAD
  -> assistant message content.artifact is updated incrementally
  -> SSE chunks are returned to frontend
  -> browser OpenSCAD worker compiles preview
```

### Response Compatibility

- Keep `content.artifact.title`, `version`, `code`, `parameters`, and `suggestions` names unchanged.
- Keep streamed partial artifact updates compatible with the current frontend state model.
- Use a single error shape:

```json
{
  "error": {
    "code": "generation_failed",
    "message": "Human-readable message",
    "details": {}
  }
}
```

## Staged Rollout

1. Stage 0: Inventory and contracts
   - Freeze current request/response shapes for Supabase functions.
   - Add sample fixtures for text-only, image-guided, and mesh-guided parametric generation.

2. Stage 1: FastAPI skeleton
   - Add app startup, config loading, health route, auth dependency, SQLite connection, and migrations.
   - No frontend switch yet.

3. Stage 2: Local auth, DB, and storage
   - Implement users, sessions, conversations, messages, images, and meshes.
   - Add seed user and local upload/read smoke tests.

4. Stage 3: Parametric chat parity
   - Port message branch loading, context formatting, model calls, streaming, parameter parsing, and artifact persistence.
   - Switch frontend parametric path behind a feature flag.

5. Stage 4: Remaining backend parity
   - Port creative chat, mesh helper routes, delete-user behavior, and billing compatibility.
   - Keep Supabase fallback until parity tests pass.

6. Stage 5: Local-first default
   - Make FastAPI the default local backend.
   - Keep Supabase migration/export docs for users with existing hosted data.

7. Stage 6: Cleanup decision
   - Remove or archive Supabase paths only after the user explicitly accepts the local backend as the canonical runtime.

## Test Plan

- Unit tests
  - Auth password/session creation and invalid-token rejection.
  - User-scoped repository queries.
  - Message tree branch extraction.
  - Image and mesh path resolution.
  - Parameter parsing from generated OpenSCAD.

- API tests
  - Login, `me`, logout.
  - Create conversation and message.
  - Upload image and mesh, then fetch through authenticated routes.
  - Parametric text-only generation with mocked model stream.
  - Parametric image and mesh generation with local fixture files.
  - Billing status compatibility response.

- Integration tests
  - Frontend sends a parametric prompt to FastAPI and receives streamed artifact updates.
  - Browser OpenSCAD worker compiles final artifact after stream completion.
  - Existing Supabase path still works while feature flag is off.

- Migration tests
  - Import sample Supabase table export into SQLite.
  - Import sample storage export into local file layout.
  - Verify all imported messages still resolve referenced images and meshes.

- Manual smoke
  - Start local DB plus FastAPI plus Vite.
  - Login with seed user.
  - Generate a text CAD artifact.
  - Upload an image and generate a CAD artifact.
  - Upload an STL and generate a modification using `import("filename.stl")`.
  - Refresh browser and confirm conversations, messages, uploads, and artifacts persist.

## Decisions Locked For Initial Implementation

- FastAPI lives under `backend/`.
- The frontend gets a CADAM-specific local API helper instead of mimicking the
  Supabase SDK.
- The first auth implementation uses bearer JWT tokens stored by the frontend.
  HTTP-only cookies can be revisited before wider deployment.
- Backend configuration uses `CADAM_*` settings for local runtime and keeps
  existing provider key names (`OPENROUTER_API_KEY`, `OPENAI_API_KEY`,
  `ANTHROPIC_API_KEY`, `FAL_KEY`) for model/provider integrations.
