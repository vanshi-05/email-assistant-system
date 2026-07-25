import os
import json
import base64
import re
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from sqlalchemy.orm import Session
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

from database import GoogleToken, Email
from ai_utils import detect_intent, generate_reply

SCOPES = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events"
]

def find_client_secrets_file():
    """Checks for client_secret.json or credentials.json in backend directory or root directory."""
    paths = [
        "client_secret.json",
        "credentials.json",
        "../client_secret.json",
        "../credentials.json",
        "D:\\email-reply-system-fullstack\\backend\\client_secret.json",
        "D:\\email reply system project\\client_secret.json",
        "D:\\email reply system project\\credentials.json"
    ]
    for path in paths:
        if os.path.exists(path):
            return path
    return None

def get_google_flow(redirect_uri: str):
    secrets_file = find_client_secrets_file()
    if not secrets_file:
        raise FileNotFoundError(
            "Google Client secrets file (client_secret.json or credentials.json) not found in backend directory. "
            "Please copy it from D:\\email reply system project to D:\\email-reply-system-fullstack\\backend."
        )
    
    return Flow.from_client_secrets_file(
        secrets_file,
        scopes=SCOPES,
        redirect_uri=redirect_uri
    )

def get_google_credentials(user_id: int, db: Session) -> Credentials:
    """Loads credentials from database, refreshes if expired, and updates database."""
    token_record = db.query(GoogleToken).filter(GoogleToken.user_id == user_id).first()
    if not token_record:
        return None

    creds_info = json.loads(token_record.token_json)
    creds = Credentials.from_authorized_user_info(creds_info, SCOPES)

    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
            # Save updated credentials back to db
            token_record.token_json = creds.to_json()
            db.commit()
        except Exception as e:
            print(f"Error refreshing Google Credentials for user {user_id}: {e}")
            return None

    return creds

def get_google_services(user_id: int, db: Session):
    creds = get_google_credentials(user_id, db)
    if not creds:
        return None, None
    
    gmail_service = build("gmail", "v1", credentials=creds)
    calendar_service = build("calendar", "v3", credentials=creds)
    return gmail_service, calendar_service

def is_calendar_free(calendar_service, start_time: datetime) -> bool:
    """Checks if the primary calendar is free for 1 hour from the start_time."""
    end_time = start_time + timedelta(hours=1)
    
    try:
        events_result = calendar_service.events().list(
            calendarId="primary",
            timeMin=start_time.isoformat() + 'Z',  # 'Z' indicates UTC time
            timeMax=end_time.isoformat() + 'Z',
            singleEvents=True
        ).execute()
        events = events_result.get("items", [])
        return len(events) == 0
    except Exception as e:
        print(f"Google Calendar API check error: {e}")
        return True  # Fallback to free if check fails to prevent blocking

def extract_meeting_time(text: str) -> datetime:
    """Simple parser to detect if meeting time is 'tomorrow' or 'today' etc."""
    text_lower = text.lower()
    now = datetime.utcnow()
    # Simple relative day extraction
    if "tomorrow" in text_lower:
        # Default meeting tomorrow at 10:00 AM UTC
        tomorrow = now + timedelta(days=1)
        return datetime(tomorrow.year, tomorrow.month, tomorrow.day, 10, 0, 0)
    elif "next monday" in text_lower:
        days_ahead = 7 - now.weekday()
        if days_ahead <= 0: days_ahead += 7
        next_monday = now + timedelta(days=days_ahead)
        return datetime(next_monday.year, next_monday.month, next_monday.day, 10, 0, 0)
    
    # Try custom time parsing for common meeting phrases e.g. "at 3pm" or "at 10am"
    # Placeholder: if no specific tomorrow/next week is found, return tomorrow at 2 PM
    if any(k in text_lower for k in ["meeting", "schedule", "call"]):
        default_time = now + timedelta(days=1)
        return datetime(default_time.year, default_time.month, default_time.day, 14, 0, 0)
        
    return None

def clean_email_body(payload) -> str:
    """Recursively fetches and decodes email body, stripping HTML tags."""
    body = ""
    if "parts" in payload:
        for part in payload["parts"]:
            body += clean_email_body(part)
    elif payload.get("mimeType") in ["text/plain", "text/html"]:
        data = payload.get("body", {}).get("data")
        if data:
            try:
                decoded = base64.urlsafe_b64decode(data).decode("utf-8", "ignore")
                # Remove HTML tags if present
                clean = re.sub("<[^<]+?>", "", decoded)
                body += clean.strip() + "\n"
            except Exception as e:
                print(f"Error decoding email part: {e}")
    return body

def process_single_email(gmail_service, calendar_service, msg_id: str, user_id: int, db: Session):
    """Processes a single unread Gmail message."""
    try:
        msg = gmail_service.users().messages().get(
            userId="me", id=msg_id, format="full"
        ).execute()

        subject, sender = "", ""
        headers = msg.get("payload", {}).get("headers", [])
        for h in headers:
            if h["name"] == "Subject":
                subject = h["value"]
            elif h["name"] == "From":
                sender = h["value"]

        body = clean_email_body(msg.get("payload", {}))

        # Check if already processed
        exists = db.query(Email).filter(
            Email.user_id == user_id,
            Email.sender == sender,
            Email.subject == subject
        ).first()

        if exists:
            # Mark as read and return
            gmail_service.users().messages().modify(
                userId="me", id=msg_id, body={"removeLabelIds": ["UNREAD"]}
            ).execute()
            return

        # Classification
        intent = detect_intent(subject, body)
        priority = 1 if intent == "meeting" else 0
        
        status = "Human Review"
        ai_reply_text = ""

        if intent == "meeting":
            meeting_time = extract_meeting_time(body)
            if meeting_time:
                is_free = is_calendar_free(calendar_service, meeting_time)
                if is_free:
                    ai_reply_text = generate_reply(body, "meeting_free")
                    status = "Human Review"  # Requires human verification to book
                else:
                    ai_reply_text = generate_reply(body, "meeting_busy")
                    # Send busy email automatically
                    send_email_direct(gmail_service, sender, f"Re: {subject}", ai_reply_text)
                    status = "Auto Sent"
            else:
                ai_reply_text = generate_reply(body, "meeting_free")
                status = "Human Review"
        elif intent == "support":
            ai_reply_text = generate_reply(body, "support")
            # Auto-send support acknowledgment
            send_email_direct(gmail_service, sender, f"Re: {subject}", ai_reply_text)
            status = "Auto Sent"
        else:
            ai_reply_text = generate_reply(body, "general")
            # Auto-reply for general emails
            send_email_direct(gmail_service, sender, f"Re: {subject}", ai_reply_text)
            status = "Auto Sent"

        # Save to database
        db_email = Email(
            user_id=user_id,
            sender=sender,
            subject=subject,
            body=body,
            ai_reply=ai_reply_text,
            intent=intent,
            priority=priority,
            status=status
        )
        db.add(db_email)
        db.commit()

        # Mark as read in Gmail
        gmail_service.users().messages().modify(
            userId="me", id=msg_id, body={"removeLabelIds": ["UNREAD"]}
        ).execute()

    except Exception as e:
        print(f"Failed to process email {msg_id}: {e}")

def process_inbox(user_id: int, db: Session):
    """Fetches and processes all unread emails in the user's Inbox."""
    gmail_service, calendar_service = get_google_services(user_id, db)
    if not gmail_service:
        raise ValueError("Google services not authenticated. Please link your Google Account first.")

    try:
        results = gmail_service.users().messages().list(
            userId="me", labelIds=["INBOX", "UNREAD"]
        ).execute()

        messages = results.get("messages", [])
        for msg in messages:
            process_single_email(gmail_service, calendar_service, msg["id"], user_id, db)
        
        return len(messages)
    except Exception as e:
        print(f"Error fetching/processing inbox: {e}")
        raise e

def send_email_direct(gmail_service, to_email: str, subject: str, body: str):
    """Low-level helper to send mail using Gmail API."""
    msg = MIMEText(body)
    msg["to"] = to_email
    msg["subject"] = subject
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    try:
        gmail_service.users().messages().send(
            userId="me", body={"raw": raw}
        ).execute()
        return True
    except Exception as e:
        print(f"Gmail Send Error: {e}")
        raise e

def send_reply(user_id: int, to_email: str, subject: str, body: str, db: Session):
    """High-level function to send reply from current user's Gmail."""
    gmail_service, _ = get_google_services(user_id, db)
    if not gmail_service:
        raise ValueError("Google services not authenticated.")
    return send_email_direct(gmail_service, to_email, subject, body)
