import os
import secrets
import hmac
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Request, Response, HTTPException, status, Depends
from dotenv import load_dotenv

_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
_ENV_PATH = os.path.join(_BACKEND_DIR, '.env')
if os.path.exists(_ENV_PATH):
    load_dotenv(_ENV_PATH)
else:
    load_dotenv()

# Dynamic Security Configuration derived directly from environment variables (.env / cloud config)
def get_jwt_secret() -> str:
    return os.getenv("JWT_SECRET_KEY", "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7")

def get_jwt_algorithm() -> str:
    return os.getenv("ALGORITHM", "HS256")

def get_access_token_expire_minutes() -> int:
    try:
        return int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))
    except ValueError:
        return 480

COOKIE_NAME = os.getenv("COOKIE_NAME", "access_token")
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").strip().lower() in ("true", "1", "yes")
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax")
COOKIE_DOMAIN = os.getenv("COOKIE_DOMAIN") or None

CSRF_PROTECTION = os.getenv("CSRF_PROTECTION", "true").strip().lower() in ("true", "1", "yes")
CSRF_COOKIE_NAME = os.getenv("CSRF_COOKIE_NAME", "csrf_token")
CSRF_HEADER_NAME = os.getenv("CSRF_HEADER_NAME", "X-CSRF-Token")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def generate_csrf_token() -> str:
    """Generate a cryptographically secure random token for CSRF protection."""
    return secrets.token_urlsafe(32)

def verify_csrf_token(header_token: Optional[str], cookie_token: Optional[str]) -> bool:
    if not header_token or not cookie_token:
        return False
    return hmac.compare_digest(header_token, cookie_token)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=get_access_token_expire_minutes())
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, get_jwt_secret(), algorithm=get_jwt_algorithm())
    return encoded_jwt

def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[get_jwt_algorithm()])
        return payload
    except JWTError:
        return None

def set_auth_cookies(response: Response, access_token: str, csrf_token: Optional[str] = None) -> None:
    """Sets secure HttpOnly cookie for session token, and accessible cookie for CSRF token."""
    max_age = get_access_token_expire_minutes() * 60
    
    # 1. HttpOnly JWT Access Token Cookie (inaccessible to JavaScript)
    response.set_cookie(
        key=COOKIE_NAME,
        value=access_token,
        max_age=max_age,
        expires=max_age,
        path="/",
        domain=COOKIE_DOMAIN,
        secure=COOKIE_SECURE,
        httponly=True,
        samesite=COOKIE_SAMESITE
    )
    
    # 2. CSRF Token Cookie (readable by client JavaScript to set X-CSRF-Token header)
    if csrf_token:
        response.set_cookie(
            key=CSRF_COOKIE_NAME,
            value=csrf_token,
            max_age=max_age,
            expires=max_age,
            path="/",
            domain=COOKIE_DOMAIN,
            secure=COOKIE_SECURE,
            httponly=False,
            samesite=COOKIE_SAMESITE
        )

def clear_auth_cookies(response: Response) -> None:
    """Clears authentication and CSRF cookies on logout."""
    response.delete_cookie(
        key=COOKIE_NAME,
        path="/",
        domain=COOKIE_DOMAIN,
        secure=COOKIE_SECURE,
        httponly=True,
        samesite=COOKIE_SAMESITE
    )
    response.delete_cookie(
        key=CSRF_COOKIE_NAME,
        path="/",
        domain=COOKIE_DOMAIN,
        secure=COOKIE_SECURE,
        httponly=False,
        samesite=COOKIE_SAMESITE
    )

def extract_token_from_request(request: Request) -> Optional[str]:
    """Extracts JWT token from HttpOnly cookie first, falling back to Authorization Bearer header."""
    token = request.cookies.get(COOKIE_NAME)
    if token:
        return token
        
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header.split(" ")[1]
        
    return None

def get_current_user(request: Request) -> Dict[str, Any]:
    """
    Authenticates the current user via HttpOnly cookie or Bearer token.
    Enforces server-side validation against database.
    """
    from app.repositories.sqlserver_repository import db

    token = extract_token_from_request(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in.",
            headers={"WWW-Authenticate": "Bearer"}
        )
        
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has expired or token is invalid. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"}
        )
        
    identity = payload.get("sub") or payload.get("email")
    if not identity:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session claims.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    user = db.find_user(identity)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account no longer exists or is inactive.",
            headers={"WWW-Authenticate": "Bearer"}
        )
        
    return {
        "id": user.get("id"),
        "username": user.get("username"),
        "email": user.get("email"),
        "role": user.get("role", "employee"),
        "name": user.get("name"),
        "designation": user.get("designation", ""),
        "employeeId": user.get("employeeId"),
        "team": user.get("team", "")
    }

def require_manager(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Enforces Manager role check on backend. Denies access with 403 Forbidden for non-managers."""
    if user.get("role") != "manager":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Manager privileges are required for this action."
        )
    return user

def require_authenticated_user(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Ensures user is authenticated with a valid session."""
    return user

def verify_csrf(request: Request) -> None:
    """
    Validates CSRF token for unsafe HTTP methods when cookie-based session is used.
    If request is authenticated purely via explicit Bearer header without cookies, CSRF check is bypassed.
    """
    if not CSRF_PROTECTION:
        return
        
    if request.method in ("POST", "PUT", "DELETE", "PATCH"):
        if request.url.path.endswith("/api/auth/login"):
            return
            
        cookie_token = request.cookies.get(CSRF_COOKIE_NAME)
        if cookie_token:
            header_token = request.headers.get(CSRF_HEADER_NAME)
            if not header_token or not verify_csrf_token(header_token, cookie_token):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="CSRF token validation failed. State-changing request denied."
                )
