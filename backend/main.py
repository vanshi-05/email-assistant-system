import os
from fastapi import FastAPI, Depends, HTTPException, status, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

from database import init_db, get_db, User, GoogleToken, Email
from auth_utils import get_password_hash, verify_password, create_access_token, get_current_user
from google_utils import get_google_flow, process_inbox, send_reply

app = FastAPI(title="AI Email Reply System API")

# Initialize database tables
init_db()

# Configure CORS
origins = [
    "http://localhost:5173",  # React / Vite
    "http://localhost:3000",  # Next.js / React
    "https://email-assistant-frontend-o0yq.onrender.com",  # Production frontend placeholder
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://email-assistant-frontend-o0yq.onrender.com")
BACKEND_URL = os.getenv("BACKEND_URL", "https://email-assistant-backend-jf77.onrender.com"
)

# Pydantic schemas for requests
class UserAuth(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    email: str

class EmailUpdate(BaseModel):
    ai_reply: str

# ==========================================
# AUTH ENDPOINTS
# ==========================================

@app.post("/auth/signup", response_model=TokenResponse)
def signup(user_data: UserAuth, db: Session = Depends(get_db)):
    # Check if user already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists"
        )
    
    # Hash password and create user
    hashed_pwd = get_password_hash(user_data.password)
    new_user = User(email=user_data.email, password_hash=hashed_pwd)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Generate token
    token = create_access_token(data={"sub": new_user.email})
    return {"access_token": token, "token_type": "bearer", "email": new_user.email}

@app.post("/auth/login", response_model=TokenResponse)
def login(user_data: UserAuth, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_data.email).first()
    if not user or not verify_password(user_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Generate token
    token = create_access_token(data={"sub": user.email})
    return {"access_token": token, "token_type": "bearer", "email": user.email}

@app.get("/auth/status")
def get_auth_status(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Check if Google Account is linked
    google_token = db.query(GoogleToken).filter(GoogleToken.user_id == current_user.id).first()
    return {
        "email": current_user.email,
        "google_linked": google_token is not None
    }

# ==========================================
# GOOGLE OAUTH ENDPOINTS
# ==========================================

@app.get("/auth/google")
def get_google_auth_url(token: str, db: Session = Depends(get_db)):
    """Generates the Google Consent Screen URL. Pass jwt token as query param to associate user."""
    # Validate the JWT token first since Redirects can't easily send authorization headers
    try:
        user = get_current_user(token=token, db=db)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token."
        )

    # Use the local backend endpoint as redirect callback
    redirect_uri = f"{BACKEND_URL}/auth/google/callback"
    flow = get_google_flow(redirect_uri)
    
    # Embed the user email in the OAuth state parameter to identify them in callback
    authorization_url, state = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        state=user.email
    )
    return {"url": authorization_url}

@app.get("/auth/google/callback")
def google_oauth_callback(code: str, state: str, db: Session = Depends(get_db)):
    """Receives callback from Google, exchanges auth code for token, and stores it."""
    # Locate the user by state (we stored their email here)
    user = db.query(User).filter(User.email == state).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found for OAuth flow.")

    redirect_uri = f"{BACKEND_URL}/auth/google/callback"
    flow = get_google_flow(redirect_uri)
    
    try:
        flow.fetch_token(code=code)
        credentials = flow.credentials
        
        # Save token to DB
        token_record = db.query(GoogleToken).filter(GoogleToken.user_id == user.id).first()
        if token_record:
            token_record.token_json = credentials.to_json()
        else:
            token_record = GoogleToken(user_id=user.id, token_json=credentials.to_json())
            db.add(token_record)
            
        db.commit()
        
        # Redirect back to frontend root
        return RedirectResponse(url=f"{FRONTEND_URL}/?status=success")
        
    except Exception as e:
        print(f"Callback error: {e}")
        return RedirectResponse(url=f"{FRONTEND_URL}/?status=error&detail={str(e)}")

# ==========================================
# EMAIL MANAGEMENT ENDPOINTS
# ==========================================

@app.get("/emails")
def get_emails(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    emails = db.query(Email).filter(Email.user_id == current_user.id).order_by(Email.created_at.desc()).all()
    return emails

@app.post("/emails/process")
def trigger_inbox_processing(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Triggers Gmail and Calendar background processing asynchronously."""
    # Check if Google Linked
    google_token = db.query(GoogleToken).filter(GoogleToken.user_id == current_user.id).first()
    if not google_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google account must be linked before processing emails."
        )

    # Run in background
    background_tasks.add_task(process_inbox, current_user.id, db)
    return {"message": "Email processing started in background."}

@app.post("/emails/{email_id}/send-reply")
def send_approved_reply(
    email_id: int,
    payload: EmailUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    email = db.query(Email).filter(Email.id == email_id, Email.user_id == current_user.id).first()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found.")
        
    if email.status != "Human Review":
        raise HTTPException(status_code=400, detail="Only emails in 'Human Review' status can be sent.")

    try:
        # Send mail using current user's credentials
        send_reply(current_user.id, email.sender, f"Re: {email.subject}", payload.ai_reply, db)
        
        # Update db record
        email.ai_reply = payload.ai_reply
        email.status = "Auto Sent"
        db.commit()
        
        return {"message": "Reply sent successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")

@app.post("/emails/{email_id}/skip")
def skip_reply(
    email_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    email = db.query(Email).filter(Email.id == email_id, Email.user_id == current_user.id).first()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found.")
        
    if email.status != "Human Review":
        raise HTTPException(status_code=400, detail="Only emails in 'Human Review' status can be skipped.")

    email.status = "Skipped"
    db.commit()
    return {"message": "Email reply skipped."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
