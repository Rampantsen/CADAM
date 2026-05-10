from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_db
from app.models import User
from app.schemas import ProfileRead, ProfileUpdate


router = APIRouter(prefix="/profiles", tags=["profiles"])


@router.get("/me", response_model=ProfileRead)
def get_profile(current_user: User = Depends(get_current_user)) -> object:
    return current_user.profile


@router.patch("/me", response_model=ProfileRead)
def update_profile(
    payload: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> object:
    profile = current_user.profile
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(profile, key, value)
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


alias_router = APIRouter(tags=["profiles"])


@alias_router.get("/profile", response_model=ProfileRead)
def get_profile_alias(current_user: User = Depends(get_current_user)) -> object:
    return current_user.profile


@alias_router.patch("/profile", response_model=ProfileRead)
def update_profile_alias(
    payload: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> object:
    return update_profile(payload, db, current_user)
