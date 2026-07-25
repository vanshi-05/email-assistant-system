import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

# Configure Gemini
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("models/gemini-2.5-flash")
else:
    model = None

def detect_intent(subject: str, body: str) -> str:
    """
    Detects if the email is a meeting request, support request, or general inquiry.
    Returns: 'meeting', 'support', or 'general'
    """
    text = f"Subject: {subject}\nBody: {body}"
    
    if not model:
        # Fallback to simple keyword classification
        text_lower = text.lower()
        if any(k in text_lower for k in ["meeting", "schedule", "call", "appointment", "calendar"]):
            return "meeting"
        elif any(k in text_lower for k in ["issue", "bug", "support", "help", "broken", "fail"]):
            return "support"
        return "general"

    prompt = (
        "Classify the following email into one of these exact categories: 'meeting', 'support', 'general'.\n"
        "Return ONLY the category name in lowercase with no other text.\n\n"
        f"{text}"
    )
    
    try:
        response = model.generate_content(prompt)
        intent = response.text.strip().lower()
        if intent in ["meeting", "support", "general"]:
            return intent
    except Exception as e:
        print(f"Gemini intent classification error: {e}")
        
    # Standard fallback
    text_lower = text.lower()
    if any(k in text_lower for k in ["meeting", "schedule", "call"]):
        return "meeting"
    return "general"

def generate_reply(body: str, mode: str) -> str:
    """
    Generates a professional AI reply based on the classification mode.
    Modes:
      - 'meeting_free': Suggest the meeting time works, but requires final verification.
      - 'meeting_busy': Suggest the meeting time is busy, offer to reschedule.
      - 'support': Acknowledge support request, say the team is looking into it.
      - 'general': Draft a professional general response.
    """
    prompts = {
        "meeting_free": "Write a professional, brief email reply confirming that the proposed meeting time appears to be free on the calendar and asking for confirmation. Keep it concise.",
        "meeting_busy": "Write a professional, brief email reply explaining that the proposed meeting time is currently busy on the calendar. Ask them to suggest another time or offer to find a slot later. Keep it concise.",
        "support": "Write a professional, brief email reply acknowledging their support request/issue, stating that our support team is looking into it and will follow up shortly.",
        "general": "Write a professional, polite, and brief reply to the following email."
    }
    
    selected_prompt = prompts.get(mode, prompts["general"])
    
    if not model:
        return "Thank you for your email. We have received it and will get back to you shortly."
        
    try:
        response = model.generate_content(f"{selected_prompt}\n\nEmail body:\n{body}")
        return response.text.strip()
    except Exception as e:
        print(f"Gemini reply generation error: {e}")
        return "Thank you for your email. I will look into this and get back to you shortly."
