from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.routes.conversations import get_owned_conversation
from app.deps import get_current_user, get_db
from app.models import ImageAsset, MeshAsset, PreviewAsset, User
from app.schemas import FileCollectionRead, ImageRead, MeshRead, PreviewRead
from app.services.storage import resolve_data_path, save_upload


router = APIRouter(prefix="/conversations/{conversation_id}/files", tags=["files"])


def detect_mesh_file_type(filename: str) -> str:
    suffix = filename.rsplit(".", 1)[-1].lower() if "." in filename else "glb"
    return suffix if suffix in {"glb", "stl", "obj", "fbx"} else "glb"


@router.get("", response_model=FileCollectionRead)
def list_files(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FileCollectionRead:
    get_owned_conversation(conversation_id, db, current_user)
    return FileCollectionRead(
        images=list(
            db.scalars(select(ImageAsset).where(ImageAsset.conversation_id == conversation_id))
        ),
        meshes=list(
            db.scalars(select(MeshAsset).where(MeshAsset.conversation_id == conversation_id))
        ),
        previews=list(
            db.scalars(select(PreviewAsset).where(PreviewAsset.conversation_id == conversation_id))
        ),
    )


@router.post("/images", response_model=ImageRead)
async def upload_image(
    conversation_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ImageAsset:
    get_owned_conversation(conversation_id, db, current_user)
    path, size = await save_upload(
        file, user_id=current_user.id, conversation_id=conversation_id, kind="images"
    )
    asset = ImageAsset(
        user_id=current_user.id,
        conversation_id=conversation_id,
        prompt={"text": "User uploaded image"},
        status="success",
        path=path,
        filename=file.filename,
        content_type=file.content_type,
        size_bytes=size,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset


@router.post("/meshes", response_model=MeshRead)
async def upload_mesh(
    conversation_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MeshAsset:
    get_owned_conversation(conversation_id, db, current_user)
    path, size = await save_upload(
        file, user_id=current_user.id, conversation_id=conversation_id, kind="meshes"
    )
    asset = MeshAsset(
        user_id=current_user.id,
        conversation_id=conversation_id,
        prompt={"text": "User uploaded mesh"},
        status="success",
        path=path,
        filename=file.filename,
        content_type=file.content_type,
        size_bytes=size,
        file_type=detect_mesh_file_type(file.filename or ""),
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset


@router.post("/previews", response_model=PreviewRead)
async def upload_preview(
    conversation_id: str,
    mesh_id: str | None = None,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PreviewAsset:
    get_owned_conversation(conversation_id, db, current_user)
    if mesh_id:
        mesh = db.get(MeshAsset, mesh_id)
        if mesh is None or mesh.conversation_id != conversation_id:
            raise HTTPException(status_code=404, detail="Mesh not found")
    path, size = await save_upload(
        file, user_id=current_user.id, conversation_id=conversation_id, kind="previews"
    )
    asset = PreviewAsset(
        user_id=current_user.id,
        conversation_id=conversation_id,
        mesh_id=mesh_id,
        prompt={"text": "User uploaded preview"},
        status="success",
        path=path,
        filename=file.filename,
        content_type=file.content_type,
        size_bytes=size,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset


@router.get("/{kind}/{asset_id}/download")
def download_file(
    conversation_id: str,
    kind: str,
    asset_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    get_owned_conversation(conversation_id, db, current_user)
    model_by_kind = {"images": ImageAsset, "meshes": MeshAsset, "previews": PreviewAsset}
    model = model_by_kind.get(kind)
    if model is None:
        raise HTTPException(status_code=404, detail="File kind not found")
    asset = db.get(model, asset_id)
    if asset is None or asset.conversation_id != conversation_id or not asset.path:
        raise HTTPException(status_code=404, detail="File not found")
    path = resolve_data_path(asset.path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File content not found")
    return FileResponse(path, media_type=asset.content_type, filename=asset.filename)
