"""
AIMP Adapter SDK — standalone package for third-party adapter authors.
Install: pip install aimp-adapter-sdk

Usage:
    from aimp_sdk import BaseAdapter

    class MyPrinterAdapter(BaseAdapter):
        domain_id = "manufacturing.print.custom.v1"
        version = "1.0.0"

        async def compute_quote(self, device_id, payload, asset=None, logistics=None):
            return {
                "cost": {"currency": "USD", "amount": 5.00,
                         "breakdown": {"material": 2.0, "machine_time": 1.0, "logistics": 2.0, "service_fee": 0.0}},
                "resource_consumption": {"machine_time_seconds": 60}
            }

        async def execute(self, job_id, device_id, audit_requirements=None):
            await self._set_state(job_id, "EXECUTING", "started")
            import asyncio
            await asyncio.sleep(5)
            await self._set_state(job_id, "COMPLETED", "done")

    def create_adapter():
        return MyPrinterAdapter()
"""
from .base import BaseAdapter

__all__ = ["BaseAdapter"]
__version__ = "0.1.0"
