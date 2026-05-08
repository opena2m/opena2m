"""Budget service — ceiling enforcement, reservation, consumption."""
from __future__ import annotations
import asyncio
import logging
from datetime import datetime, timedelta, timezone
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
        Uses SELECT FOR UPDATE to prevent concurrent over-reservation (H3).
        """
        if principal_id is None:
            return True, None

        budgets = (
            await db.execute(
                select(Budget)
                .where(Budget.principal_id == principal_id, Budget.currency == currency)
                .with_for_update()
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
                prev_pct = budget.consumed / budget.ceiling if budget.ceiling else 0
                budget.consumed += amount
                new_pct = budget.consumed / budget.ceiling if budget.ceiling else 0
                # Budget warning webhook (H6)
                if new_pct >= budget.warn_threshold and prev_pct < budget.warn_threshold:
                    logger.warning(
                        "Budget '%s' at %.0f%% of ceiling.",
                        budget.name,
                        100 * new_pct,
                    )
                    asyncio.create_task(
                        BudgetService._enqueue_budget_event(db, budget, "budget_warning", new_pct)
                    )
                # Budget exhausted webhook (H6)
                if budget.consumed >= budget.ceiling:
                    asyncio.create_task(
                        BudgetService._enqueue_budget_event(db, budget, "budget_exhausted", new_pct)
                    )
            await db.flush()

        return True, None

    @staticmethod
    async def _enqueue_budget_event(db: AsyncSession, budget: Budget, event: str, pct: float) -> None:
        """Enqueue a budget_warning or budget_exhausted webhook event."""
        try:
            from app.services.webhook_dispatcher import WebhookDispatcher
            dispatcher = WebhookDispatcher()
            payload = {
                "event": event,
                "budget_id": budget.budget_id,
                "budget_name": budget.name,
                "principal_id": budget.principal_id,
                "consumed_pct": round(pct, 4),
                "ceiling": budget.ceiling,
                "consumed": budget.consumed,
                "remaining": max(0.0, budget.ceiling - budget.consumed),
                "currency": budget.currency,
            }
            await dispatcher.enqueue(db, None, event, payload)
        except Exception as exc:
            logger.warning("Failed to enqueue budget event %s: %s", event, exc)

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
                select(Budget)
                .where(Budget.principal_id == principal_id, Budget.currency == currency)
                .with_for_update()
            )
        ).scalars().all()
        for budget in budgets:
            budget.consumed = max(0.0, budget.consumed - amount)
        await db.flush()

    @staticmethod
    async def settle(
        db: AsyncSession,
        principal_id: Optional[str],
        amount: float,
        currency: str,
    ) -> None:
        """Settle a completed job's cost (mark actual spend as permanent). H4/M8.
        For now the amount was already consumed during reservation, so this is a
        no-op in terms of the balance — but we log it for the audit trail.
        """
        if principal_id is None:
            return
        logger.info("Budget settled: %.2f %s for principal %s", amount, currency, principal_id)

    @staticmethod
    async def reset_expired_windows(db: AsyncSession) -> None:
        """Reset budget windows that have elapsed. M6."""
        now = datetime.now(timezone.utc)
        budgets = (await db.execute(select(Budget).where(Budget.period.isnot(None)))).scalars().all()
        for budget in budgets:
            if budget.period_start is None:
                continue
            window_duration: Optional[timedelta] = None
            if budget.period == "daily":
                window_duration = timedelta(days=1)
            elif budget.period == "monthly":
                window_duration = timedelta(days=30)
            if window_duration and (budget.period_start + window_duration) < now:
                logger.info("Resetting budget '%s' (window expired)", budget.name)
                budget.consumed = 0.0
                budget.period_start = now
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
