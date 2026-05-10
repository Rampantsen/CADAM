import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.routes.conversations import get_owned_conversation
from app.deps import get_current_user, get_db
from app.models import Message, User
from app.schemas import ChatCancelRequest, MessageRead, ParametricChatRequest
from app.services.chat import cancel_parametric_request, stream_parametric_placeholder


router = APIRouter(tags=["chat"])


async def parametric_chat_stream(
    payload: ParametricChatRequest, db: Session, current_user: User
) -> StreamingResponse:
    conversation = get_owned_conversation(payload.conversationId, db, current_user)

    async def line_iter():
        async for message in stream_parametric_placeholder(db, conversation, payload):
            data = MessageRead.model_validate(message).model_dump(mode="json")
            yield json.dumps(data, separators=(",", ":")) + "\n"

    return StreamingResponse(line_iter(), media_type="application/x-ndjson")


@router.post("/chat/parametric")
async def api_parametric_chat(
    payload: ParametricChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    return await parametric_chat_stream(payload, db, current_user)


@router.post("/chat/cancel", status_code=204)
def cancel_chat(
    payload: ChatCancelRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    message = db.get(Message, payload.messageId)
    if message is None:
        raise HTTPException(status_code=404, detail="Message not found")
    get_owned_conversation(message.conversation_id, db, current_user)
    cancel_parametric_request(payload.messageId)


@router.post("/functions/v1/parametric-chat", include_in_schema=False)
async def supabase_compatible_parametric_chat(
    payload: ParametricChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    return await parametric_chat_stream(payload, db, current_user)
