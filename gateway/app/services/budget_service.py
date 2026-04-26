"""Budget service — ceiling enforcement, reservation, consumption."""
from __future__ import annotations
import logging
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import Budget

logger = logging.getLogger("aimp.budget")


class BudgetService:

    @staticmethod
    async def check_and_reserve(
        db: AsyncSession,
        principal_id: Optional[str],
        amount: float,
        currency: str,
        dry_run: bool = False,
    ) -> tuple[bool, Optional[str]]:
        """
        Returns (ok, reason). If dry_run=True doesn't commit the reservation.
        """
        if principal_id is None:
            return True, None

        budgets = (
            await db.execute(
                select(Budget).where(Budget.principal_id == principal_id, Budget.currency == currency)
            )
        ).scalars().all()

        for budget in budgets:
            remaining = budget.ceiling - budget.consumed
            if amount > remaining:
                return False, (
                    f"Budget '{budget.name}' exceeded: "
                    f"requested {amount:.2f} {currency}, "
                    f"remaining {remaining:.2f} {currency}"
                )

        if not dry_run:
            for budget in budgets:
                budget.consumed += amount
                if budget.consumed / budget.ceiling >= budget.warn_threshold:
                    logger.warning(
                        "Budget '%s' at %.0f%% of ceiling.",
                        budget.name,
                        100 * budget.consumed / budget.ceiling,
                    )
            await db.flush()

        return True, None

    @staticmethod
    async def release(
        db: AsyncSession,
        principal_id: Optional[str],
        amount: float,
        currency: str,
    ) -> None:
        """Release reserved budget (e.g., on abort)."""
        if principal_id is None:
            return
        budgets = (
            await db.execute(
                select(Budget).where(Budget.principal_id == principal_id, Budget.currency == currency)
            )
        ).scalars().all()
        for budget in budgets:
            budget.consumed = max(0.0, budget.consumed - amount)
        await db.flush()

    @staticmethod
    async def list_budgets(db: AsyncSession, principal_id: Optional[str] = None):
        q = select(Budget)
        if principal_id:
            q = q.where(Budget.principal_id == principal_id)
        return (await db.execute(q)).scalars().all()

    @staticmethod
    async def create_budget(
        db: AsyncSession,
        name: str,
        principal_id: Optional[str],
        currency: str,
        ceiling: float,
        warn_threshold: float = 0.8,
        period: Optional[str] = None,
    ) -> Budget:
        budget = Budget(
            name=name,
            principal_id=principal_id,
            currency=currency,
            ceiling=ceiling,
            warn_threshold=warn_threshold,
            period=period,
        )
        db.add(budget)
        await db.flush()
        return budget
