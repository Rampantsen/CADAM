from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth, billing, chat, conversations, files, messages, profiles, title
from app.core.config import get_settings
from app.db.session import init_db


settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    init_db()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(auth.router, prefix=settings.api_v1_prefix)
    app.include_router(profiles.router, prefix=settings.api_v1_prefix)
    app.include_router(profiles.alias_router, prefix=settings.api_v1_prefix)
    app.include_router(conversations.router, prefix=settings.api_v1_prefix)
    app.include_router(messages.router, prefix=settings.api_v1_prefix)
    app.include_router(files.router, prefix=settings.api_v1_prefix)
    app.include_router(billing.router, prefix=settings.api_v1_prefix)
    app.include_router(chat.router, prefix=settings.api_v1_prefix)
    app.include_router(title.router, prefix=settings.api_v1_prefix)
    app.include_router(chat.router)
    app.include_router(title.router)
    return app


app = create_app()
