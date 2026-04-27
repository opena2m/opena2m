"""GET /v1/users — list human operators and service principals for Settings → Users tab."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import Principal, get_current_principal
from app.core.database import get_db
from app.models.orm import Principal as PrincipalModel

router = APIRouter()


@router.get("/users")
async def list_users(
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    """Returns all principals for the Settings → Users tab."""
    principal.require("aimp:jobs:read")  # any authenticated user can see the list
    principals = (await db.execute(
        select(PrincipalModel).where(PrincipalModel.disabled_at.is_(None))
    )).scalars().all()
    return [
        {
            "principal_id": p.principal_id,
            "kind": p.kind,
            "display_name": p.display_name,
            "external_id": p.external_id,
            "role": "Admin" if p.kind == "system" else ("Reviewer" if p.kind == "human" else "Agent"),
            "last_active": p.created_at.isoformat() if p.created_at else None,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in principals
    ]


@router.post("/users")
async def create_principal(
    body: dict,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    """Create a new service principal or invite a human user."""
    principal.require("aimp:jobs:write")
    import uuid
    from app.models.orm import Principal as PrincipalModel
    from datetime import datetime, timezone
    new_id = f"P{str(uuid.uuid4())[:8].upper()}"
    p = PrincipalModel(
        principal_id=new_id,
        kind=body.get("kind", "agent"),
        display_name=body.get("display_name", new_id),
        external_id=body.get("external_id"),
        created_at=datetime.now(timezone.utc),
    )
    db.add(p)
    await db.commit()
    return {
        "principal_id": p.principal_id, "kind": p.kind,
        "display_name": p.display_name, "external_id": p.external_id,
        "created_at": p.created_at.isoformat(),
    }
