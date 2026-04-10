from fastapi import APIRouter, Request, status
from fastapi.responses import JSONResponse
from .email_utils import send_email_notification

router = APIRouter()

@router.post("/webhook/subscription")
async def subscription_webhook(request: Request):
    event = await request.json()
    event_type = event.get("type")
    user_email = event.get("user_email")
    # Example: send email on subscription_created
    if event_type == "subscription_created" and user_email:
        send_email_notification(
            subject="Subscription Created",
            body=f"A new subscription was created for {user_email}.",
            recipients=[user_email]
        )
    # Add more event handling as needed
    print("Received subscription event:", event)
    return JSONResponse({"received": True}, status_code=status.HTTP_200_OK)
