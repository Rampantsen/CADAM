from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.routes.conversations import get_owned_conversation
from app.deps import get_current_user, get_db
from app.models import Message, User
from app.schemas import MessageCreate, MessageRead, MessageUpdate


router = APIRouter(tags=["messages"])


@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageRead])
def list_messages(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Message]:
    get_owned_conversation(conversation_id, db, current_user)
    return list(
        db.scalars(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at)
        )
    )


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=MessageRead,
    status_code=status.HTTP_201_CREATED,
)
def create_message(
    conversation_id: str,
    payload: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Message:
    conversation = get_owned_conversation(conversation_id, db, current_user)
    data = payload.model_dump(exclude={"id"})
    message = Message(conversation_id=conversation_id, **data)
    if payload.id:
        message.id = payload.id
    db.add(message)
    conversation.current_message_leaf_id = message.id
    db.commit()
    db.refresh(message)
    return message


@router.patch("/messages/{message_id}", response_model=MessageRead)
def update_message(
    message_id: str,
    payload: MessageUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Message:
    message = db.get(Message, message_id)
    if message is None:
        raise HTTPException(status_code=404, detail="Message not found")
    get_owned_conversation(message.conversation_id, db, current_user)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(message, key, value)
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


@router.patch(
    "/conversations/{conversation_id}/messages/{message_id}",
    response_model=MessageRead,
)
def update_conversation_message(
    conversation_id: str,
    message_id: str,
    payload: MessageUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Message:
    get_owned_conversation(conversation_id, db, current_user)
    message = db.get(Message, message_id)
    if message is None or message.conversation_id != conversation_id:
        raise HTTPException(status_code=404, detail="Message not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(message, key, value)
    db.add(message)
    db.commit()
    db.refresh(message)
    return message
