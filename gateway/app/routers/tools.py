"""GET /v1/tools.json — MCP/function-calling tool manifest (L3)."""
from fastapi import APIRouter

router = APIRouter()


@router.get("/tools.json", tags=["Integration"])
async def get_tools_json():
    """MCP/function-calling tool manifest derived from the OpenAPI spec."""
    from app.main import app as _app
    spec = _app.openapi()
    tools = []
    for path, methods in spec.get("paths", {}).items():
        for method, op in methods.items():
            if method in ("get", "post") and "operationId" in op:
                tools.append({
                    "name": op["operationId"],
                    "description": op.get("summary", ""),
                    "method": method.upper(),
                    "path": path,
                    "parameters": op.get("requestBody", {}),
                })
    return {"tools": tools, "aimp_version": "1.0"}
