from fastapi import APIRouter, HTTPException, status, Depends, Header, Request, Response
from typing import Optional, List
from datetime import timedelta
from pydantic import BaseModel
from app.schemas.schemas import Token, LoginRequest
from app.core.security import (
    create_access_token,
    decode_access_token,
    verify_password,
    generate_csrf_token,
    set_auth_cookies,
    clear_auth_cookies,
    get_current_user,
    get_access_token_expire_minutes
)
from app.repositories.sqlserver_repository import db

class ProfileUpdateReq(BaseModel):
    name: Optional[str] = None
    designation: Optional[str] = None
    currentPassword: Optional[str] = None
    newPassword: Optional[str] = None

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

@router.post("/login", response_model=Token)
def login(req: LoginRequest, response: Response):
    identity = (req.email or req.username or "").strip()
    if not identity:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email or username is required")

    user = db.find_user(identity)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email/username or password")

    expected_password = (user.get("password") or "").strip()
    expected_hash = (user.get("passwordHash") or "").strip()
    provided_password = (req.password or "").strip()

    # Credential verification
    is_valid = False
    if expected_password and provided_password == expected_password:
        is_valid = True
    elif expected_hash and verify_password(provided_password, expected_hash):
        is_valid = True
    elif expected_password and verify_password(provided_password, expected_password):
        is_valid = True
    
   
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email/username or password")

    expires_delta = timedelta(minutes=get_access_token_expire_minutes())
    token_data = {
        "sub": user["email"],
        "role": user["role"],
        "user_id": user["id"],
        "employee_id": user.get("employeeId"),
        "name": user["name"],
        "email": user["email"],
        "designation": user.get("designation", "")
    }
    access_token = create_access_token(token_data, expires_delta=expires_delta)
    csrf_token = generate_csrf_token()
    
    # Secure HttpOnly session cookie + CSRF cookie
    set_auth_cookies(response, access_token=access_token, csrf_token=csrf_token)
    
    expires_in_seconds = get_access_token_expire_minutes() * 60

    return Token(
        access_token=access_token,
        token_type="bearer",
        role=user["role"],
        user_id=user["id"],
        employee_id=user.get("employeeId"),
        name=user["name"],
        email=user["email"],
        designation=user.get("designation", ""),
        expires_in=expires_in_seconds,
        csrf_token=csrf_token
    )

@router.post("/logout")
def logout(response: Response):
    """Securely terminates the session by clearing HttpOnly authentication and CSRF cookies."""
    clear_auth_cookies(response)
    return {"success": True, "message": "Successfully logged out and session terminated"}

@router.get("/me")
def get_current_user_profile(user: dict = Depends(get_current_user)):
    """Returns the authenticated, server-verified user identity, role, and permissions."""
    return {
        "id": user["id"],
        "username": user.get("username"),
        "email": user["email"],
        "role": user["role"],
        "name": user["name"],
        "designation": user.get("designation", ""),
        "employeeId": user.get("employeeId"),
        "team": user.get("team", "")
    }

@router.post("/refresh", response_model=Token)
def refresh_token(response: Response, user: dict = Depends(get_current_user)):
    expires_delta = timedelta(minutes=get_access_token_expire_minutes())
    token_data = {
        "sub": user["email"],
        "role": user["role"],
        "user_id": user["id"],
        "employee_id": user.get("employeeId"),
        "name": user["name"],
        "email": user["email"],
        "designation": user.get("designation", "")
    }
    new_token = create_access_token(token_data, expires_delta=expires_delta)
    csrf_token = generate_csrf_token()
    set_auth_cookies(response, access_token=new_token, csrf_token=csrf_token)
    
    expires_in_seconds = get_access_token_expire_minutes() * 60

    return Token(
        access_token=new_token,
        token_type="bearer",
        role=user["role"],
        user_id=user["id"],
        employee_id=user.get("employeeId"),
        name=user["name"],
        email=user["email"],
        designation=user.get("designation", ""),
        expires_in=expires_in_seconds,
        csrf_token=csrf_token
    )

@router.put("/profile")
def update_profile(req: ProfileUpdateReq, user: dict = Depends(get_current_user)):
    """
    Update profile information strictly for the authenticated user.
    Prevents IDOR by ignoring any client-provided identity and binding updates to authenticated session.
    """
    user_identity = user["email"]
    db_user = db.find_user(user_identity)
    if not db_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if req.currentPassword and req.newPassword:
        expected = db_user.get("password")
        if expected and req.currentPassword != expected and not verify_password(req.currentPassword, expected):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password does not match")

    updated = db.update_user_profile(
        identifier=user_identity,
        name=req.name,
        designation=req.designation,
        password=req.newPassword if (req.currentPassword and req.newPassword) else None
    )

    return {
        "success": True,
        "message": "Profile updated successfully",
        "user": {
            "id": updated.get("id"),
            "email": updated.get("email"),
            "name": updated.get("name"),
            "designation": updated.get("designation"),
            "role": updated.get("role"),
            "employeeId": updated.get("employeeId")
        }
    }
