from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=6)
    full_name: str | None = None


class UserLogin(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    username: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    full_name: str
    avatar_path: str | None
    notifications_enabled: bool
    created_at: datetime
    updated_at: datetime


class ProfileUpdate(BaseModel):
    full_name: str | None = None
    avatar_path: str | None = None
    notifications_enabled: bool | None = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead
    profile: ProfileRead


class ConversationCreate(BaseModel):
    id: str | None = None
    title: str = "New Conversation"
    type: Literal["parametric", "creative"] = "parametric"
    privacy: Literal["private", "public"] = "private"
    settings: dict[str, Any] | None = None


class ConversationUpdate(BaseModel):
    title: str | None = None
    type: Literal["parametric", "creative"] | None = None
    privacy: Literal["private", "public"] | None = None
    settings: dict[str, Any] | None = None
    current_message_leaf_id: str | None = None


class ConversationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    title: str
    type: str
    privacy: str
    settings: dict[str, Any] | None
    current_message_leaf_id: str | None
    created_at: datetime
    updated_at: datetime


class MessageCreate(BaseModel):
    id: str | None = None
    role: Literal["user", "assistant"]
    content: dict[str, Any] = Field(default_factory=dict)
    parent_message_id: str | None = None
    rating: int = 0


class MessageUpdate(BaseModel):
    content: dict[str, Any] | None = None
    rating: int | None = None


class MessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    conversation_id: str
    parent_message_id: str | None
    role: str
    content: dict[str, Any]
    rating: int
    created_at: datetime


class AssetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    conversation_id: str
    prompt: dict[str, Any] | None
    status: str
    path: str | None
    filename: str | None
    content_type: str | None
    size_bytes: int | None
    created_at: datetime


class ImageRead(AssetRead):
    image_generation_call_id: str | None = None


class MeshRead(AssetRead):
    file_type: str
    images: list[str] | None = None


class PreviewRead(AssetRead):
    mesh_id: str | None
    updated_at: datetime


class FileCollectionRead(BaseModel):
    images: list[ImageRead]
    meshes: list[MeshRead]
    previews: list[PreviewRead]


class BillingUser(BaseModel):
    hasTrialed: bool = False


class BillingSubscription(BaseModel):
    level: str = "pro"
    status: str | None = "active"
    currentPeriodEnd: str | None = None


class BillingTokens(BaseModel):
    free: int = 0
    subscription: int = 1_000_000_000
    purchased: int = 1_000_000_000
    total: int = 2_000_000_000


class BillingStatus(BaseModel):
    user: BillingUser = Field(default_factory=BillingUser)
    subscription: BillingSubscription | None = Field(default_factory=BillingSubscription)
    tokens: BillingTokens = Field(default_factory=BillingTokens)
    billingMode: str = "local-unlimited"


class ParametricChatRequest(BaseModel):
    conversationId: str
    messageId: str
    model: str = "fast"
    newMessageId: str | None = None


class TitleGenerateRequest(BaseModel):
    conversationId: str
    content: dict[str, Any] = Field(default_factory=dict)


class TitleGenerateResponse(BaseModel):
    title: str
