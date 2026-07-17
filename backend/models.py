from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from datetime import datetime, timezone

db = SQLAlchemy()

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    # relationship
    history = db.relationship('MatchHistory', backref='user', lazy=True)
    leaderboard = db.relationship('LeaderboardEntry', backref='user', lazy=True)

class LeaderboardEntry(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    player_name = db.Column(db.String(50), nullable=False)
    score = db.Column(db.Integer, nullable=False)
    date = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

class MatchHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    score = db.Column(db.Integer, nullable=False)
    wpm = db.Column(db.Integer, default=0)
    accuracy = db.Column(db.Float, default=0.0)
    date = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
