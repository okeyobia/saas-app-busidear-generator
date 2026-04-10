def get_system_prompt(specialty: str) -> str:
    prompts = {
        "cardiology": "Focus on cardiac symptoms and cardiovascular health. Provide recommendations based on the latest cardiology guidelines.",
        "pediatrics": "Use child-friendly language in patient communications. Consider age-appropriate advice and pediatric best practices.",
        "psychiatry": "Include mental health considerations and resources. Be sensitive to psychiatric symptoms and offer supportive guidance.",
        # Add more specialties as needed
    }
    default_prompt = "You are a helpful, knowledgeable medical assistant."
    return prompts.get(specialty, default_prompt)
import os
from fastapi import FastAPI, Depends  # type: ignore
from fastapi.responses import StreamingResponse  # type: ignore
from pydantic import BaseModel  # type: ignore
from fastapi_clerk_auth import ClerkConfig, ClerkHTTPBearer, HTTPAuthorizationCredentials  # type: ignore
from openai import OpenAI  # type: ignore

app = FastAPI()
clerk_config = ClerkConfig(jwks_url=os.getenv("CLERK_JWKS_URL"))
clerk_guard = ClerkHTTPBearer(clerk_config)



class Visit(BaseModel):
    patient_name: str
    date_of_visit: str
    notes: str
    specialty: str = ""


system_prompt = """
You are provided with notes written by a doctor from a patient's visit.
Your job is to summarize the visit for the doctor and provide an email.
Reply with exactly three sections with the headings:
### Summary of visit for the doctor's records
### Next steps for the doctor
### Draft of email to patient in patient-friendly language
"""


def user_prompt_for(visit: Visit) -> str:
    return f"""Create the summary, next steps and draft email for:
Patient Name: {visit.patient_name}
Date of Visit: {visit.date_of_visit}
Notes:
{visit.notes}"""



@app.post("/api")
def consultation_summary(
    visit: Visit,
    creds: HTTPAuthorizationCredentials = Depends(clerk_guard),
):
    user_id = creds.decoded["sub"]  # Available for tracking/auditing
    client = OpenAI()

    user_prompt = user_prompt_for(visit)
    specialty = visit.specialty.strip().lower() if visit.specialty else ""
    sys_prompt = get_system_prompt(specialty) if specialty else system_prompt

    prompt = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_prompt},
    ]

    stream = client.chat.completions.create(
        model="gpt-5-nano",
        messages=prompt,
        stream=True,
    )

    def event_stream():
        for chunk in stream:
            text = chunk.choices[0].delta.content
            if text:
                lines = text.split("\n")
                for line in lines[:-1]:
                    yield f"data: {line}\n\n"
                    yield "data:  \n"
                yield f"data: {lines[-1]}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")