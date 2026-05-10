from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_db
from app.models import Conversation, User
from app.schemas import ConversationCreate, ConversationRead, ConversationUpdate
from app.services.storage import conversation_dir


router = APIRouter(prefix="/conversations", tags=["conversations"])


def get_owned_conversation(
    conversation_id: str, db: Session, current_user: User
) -> Conversation:
    conversation = db.get(Conversation, conversation_id)
    if conversation is None or conversation.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


@router.get("", response_model=list[ConversationRead])
def list_conversations(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
) -> list[Conversation]:
    return list(
        db.scalars(
            select(Conversation)
            .where(Conversation.user_id == current_user.id)
            .order_by(desc(Conversation.updated_at))
        )
    )


@router.post("", response_model=ConversationRead, status_code=status.HTTP_201_CREATED)
def create_conversation(
    payload: ConversationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Conversation:
    if payload.id:
        existing = db.get(Conversation, payload.id)
        if existing is not None:
            if existing.user_id != current_user.id:
                raise HTTPException(status_code=409, detail="Conversation id already exists")
            for key, value in payload.model_dump(exclude_unset=True, exclude_none=True).items():
                if key == "id":
                    continue
                setattr(existing, key, value)
            db.add(existing)
            db.commit()
            db.refresh(existing)
            return existing

    values = payload.model_dump(exclude_none=True)
    conversation = Conversation(user_id=current_user.id, **values)
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    conversation_dir(current_user.id, conversation.id)
    return conversation


@router.get("/{conversation_id}", response_model=ConversationRead)
def read_conversation(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Conversation:
    return get_owned_conversation(conversation_id, db, current_user)


@router.patch("/{conversation_id}", response_model=ConversationRead)
def update_conversation(
    conversation_id: str,
    payload: ConversationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Conversation:
    conversation = get_owned_conversation(conversation_id, db, current_user)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(conversation, key, value)
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    conversation = get_owned_conversation(conversation_id, db, current_user)
    db.delete(conversation)
    db.commit()
