from pathlib import Path
from re import sub
from uuid import uuid4

from fastapi import UploadFile

from app.core.config import get_settings


ALLOWED_KINDS = {"images", "meshes", "previews"}


def sanitize_filename(filename: str) -> str:
    cleaned = sub(r"[^A-Za-z0-9._-]+", "_", filename).strip("._")
    return cleaned or "upload.bin"


def conversation_dir(user_id: str, conversation_id: str) -> Path:
    base = get_settings().data_root / user_id / conversation_id
    for child in ALLOWED_KINDS:
        (base / child).mkdir(parents=True, exist_ok=True)
    return base


async def save_upload(
    file: UploadFile, *, user_id: str, conversation_id: str, kind: str
) -> tuple[str, int]:
    if kind not in ALLOWED_KINDS:
        raise ValueError(f"Unsupported storage kind: {kind}")
    filename = f"{uuid4()}_{sanitize_filename(file.filename or 'upload.bin')}"
    target = conversation_dir(user_id, conversation_id) / kind / filename
    size = 0
    with target.open("wb") as handle:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            handle.write(chunk)
    return str(target.relative_to(get_settings().data_root)), size


def resolve_data_path(relative_path: str) -> Path:
    root = get_settings().data_root.resolve()
    resolved = (root / relative_path).resolve()
    if root not in resolved.parents and resolved != root:
        raise ValueError("Path escapes data root")
    return resolved
