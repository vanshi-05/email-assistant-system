import os
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from dotenv import load_dotenv

load_dotenv()

# Read database URL, defaulting to local SQLite for easy development
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./email_system.db")

# Workaround for Heroku/Render postgres:// scheme which SQLAlchemy doesn't support directly
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# SQLite requires different arguments for threading
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    google_token = relationship("GoogleToken", back_populates="user", uselist=False, cascade="all, delete-orphan")
    emails = relationship("Email", back_populates="user", cascade="all, delete-orphan")

class GoogleToken(Base):
    __tablename__ = "google_tokens"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    token_json = Column(Text, nullable=False)  # Serialized credentials JSON
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="google_token")

class Email(Base):
    __tablename__ = "emails"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    sender = Column(String, nullable=False)
    subject = Column(String, nullable=False)
    body = Column(Text, nullable=True)
    ai_reply = Column(Text, nullable=True)
    intent = Column(String, nullable=True)
    priority = Column(Integer, default=0)
    status = Column(String, default="Human Review")  # 'Auto Sent', 'Human Review', 'Pending'
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="emails")

# Dependency to get db session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Create tables
def init_db():
    Base.metadata.create_all(bind=engine)
