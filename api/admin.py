from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/admin")

# Dummy data for demonstration
USERS = [
    {"id": 1, "email": "user1@example.com", "subscription": "active"},
    {"id": 2, "email": "user2@example.com", "subscription": "canceled"},
]

@router.get("/users")
def list_users():
    return JSONResponse(USERS, status_code=status.HTTP_200_OK)
