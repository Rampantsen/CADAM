from fastapi import APIRouter, Depends

from app.deps import get_current_user
from app.models import User
from app.schemas import BillingStatus


router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/status", response_model=BillingStatus)
def billing_status(current_user: User = Depends(get_current_user)) -> BillingStatus:
    return BillingStatus()


@router.post("/checkout")
def billing_checkout(current_user: User = Depends(get_current_user)) -> dict[str, str]:
    return {"url": "http://localhost/local-unlimited-billing"}


@router.post("/portal")
def billing_portal(current_user: User = Depends(get_current_user)) -> dict[str, str]:
    return {"url": "http://localhost/local-unlimited-billing"}
