import os
import json
import traceback
from fastapi import FastAPI, Request, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
_ENV_PATH = os.path.join(_BACKEND_DIR, '.env')
if os.path.exists(_ENV_PATH):
    load_dotenv(_ENV_PATH)
else:
    load_dotenv()

from app.core.security import require_manager, verify_csrf_token, COOKIE_NAME, CSRF_COOKIE_NAME, CSRF_HEADER_NAME
from app.routers import auth, reference, timesheets, submissions, productivity, ai_usage, reports, import_timesheets

app = FastAPI(
    title="Team Productivity Hub API",
    description="Enterprise FastAPI Backend for Team Productivity & AI Adoption Tracking Hub",
    version="1.4.0"
)

def get_cors_origins():
    origins_str = os.getenv("CORS_ORIGINS", "")
    if origins_str.startswith("[") and origins_str.endswith("]"):
        try:
            return json.loads(origins_str)
        except Exception:
            pass
    if origins_str:
        return [o.strip() for o in origins_str.split(",") if o.strip()]
    return ["http://localhost:4200", "http://127.0.0.1:4200"]

cors_origins = get_cors_origins()

# Configure Enterprise CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"]
)

# CSRF Protection Middleware for State-Changing Cookie Requests
@app.middleware("http")
async def csrf_protect_middleware(request: Request, call_next):
    # Only protect state-changing HTTP methods
    if request.method in ("POST", "PUT", "DELETE", "PATCH"):
        path = request.url.path
        # Exclude public / authentication initialization endpoints
        if not (path.endswith("/api/auth/login") or path.endswith("/api/auth/logout") or path.endswith("/api/health")):
            # If request is using cookie session authentication
            if COOKIE_NAME in request.cookies:
                cookie_csrf = request.cookies.get(CSRF_COOKIE_NAME)
                header_csrf = request.headers.get(CSRF_HEADER_NAME)
                if not cookie_csrf or not header_csrf or not verify_csrf_token(header_csrf, cookie_csrf):
                    return JSONResponse(
                        status_code=403,
                        content={"detail": "CSRF validation failed: Missing or invalid CSRF token."}
                    )
    return await call_next(request)

# Include Routers
app.include_router(auth.router)
app.include_router(reference.router)
app.include_router(timesheets.router)
app.include_router(import_timesheets.router)
app.include_router(submissions.router)
app.include_router(productivity.router)
app.include_router(ai_usage.router)
app.include_router(reports.router)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    traceback.print_exc()
    origin = request.headers.get("origin", "*")
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "type": type(exc).__name__},
        headers={
            "Access-Control-Allow-Origin": origin if (origin in cors_origins or "*" in cors_origins) else "*",
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*"
        }
    )

@app.get("/api/health")
def health_check():
    from app.db.connection import test_sqlserver_connection
    from app.repositories.sqlserver_repository import db
    is_sql_connected = test_sqlserver_connection()
    return {
        "status": "healthy",
        "data_mode": os.getenv("DATA_MODE", "sqlserver"),
        "app_env": os.getenv("APP_ENV", "development"),
        "database": {
            "type": "Microsoft SQL Server" if is_sql_connected else "SQL Server (Offline)",
            "server": os.getenv("DB_SERVER", ""),
            "name": os.getenv("DB_NAME", ""),
            "connected": is_sql_connected,
            "active_repository": type(db).__name__,
            "total_entries": len(db.entries),
            "total_users": len(db.users)
        }
    }

@app.post("/api/demo/reset")
def reset_demo_data(user: dict = Depends(require_manager)):
    """Reloads live database state from SQL Server."""
    from app.repositories.sqlserver_repository import db
    db.load_data()
    return {"message": "Database synchronized successfully", "total_entries": len(db.entries)}
