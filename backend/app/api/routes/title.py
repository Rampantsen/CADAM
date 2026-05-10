from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.routes.conversations import get_owned_conversation
from app.deps import get_current_user, get_db
from app.models import User
from app.schemas import TitleGenerateRequest, TitleGenerateResponse


router = APIRouter(tags=["title"])


def title_from_content(content: dict) -> str:
    text = str(content.get("text") or "").strip()
    if not text:
        return "New Conversation"
    words = text.replace("\n", " ").split()
    title = " ".join(words[:5]).strip(" \"'")
    return title[:40] or "New Conversation"


def generate_title_response(
    payload: TitleGenerateRequest, db: Session, current_user: User
) -> TitleGenerateResponse:
    conversation = get_owned_conversation(payload.conversationId, db, current_user)
    title = title_from_content(payload.content)
    conversation.title = title
    db.add(conversation)
    db.commit()
    return TitleGenerateResponse(title=title)


@router.post("/title-generator", response_model=TitleGenerateResponse)
def api_title_generator(
    payload: TitleGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TitleGenerateResponse:
    return generate_title_response(payload, db, current_user)


@router.post("/functions/v1/title-generator", response_model=TitleGenerateResponse, include_in_schema=False)
def compatible_title_generator(
    payload: TitleGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TitleGenerateResponse:
    return generate_title_response(payload, db, current_user)
