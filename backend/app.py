import os
from flask import Flask, request, jsonify, session
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from models import db, User, LeaderboardEntry, MatchHistory

app = Flask(__name__)
# The secret key for session management (this is a simple example for dev)
app.config['SECRET_KEY'] = 'super-secret-type-or-die-key'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///db.sqlite3'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE'] = False
app.config['SESSION_COOKIE_DOMAIN'] = 'localhost'
app.config['REMEMBER_COOKIE_SAMESITE'] = 'Lax'
app.config['REMEMBER_COOKIE_HTTPONLY'] = True
app.config['REMEMBER_COOKIE_SECURE'] = False
app.config['REMEMBER_COOKIE_DOMAIN'] = 'localhost'

db.init_app(app)

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = None

@login_manager.unauthorized_handler
def unauthorized():
    return jsonify({"authenticated": False, "error": "login_required"}), 401

DEFAULT_SCORES = [
    {"player_name": "WPM_WIZARD", "score": 1450},
    {"player_name": "NEON_SAMURAI", "score": 1120},
    {"player_name": "GRID_GLIDE", "score": 950},
    {"player_name": "KEYBOARD_HERO", "score": 810},
    {"player_name": "CYBER_RACER", "score": 680},
    {"player_name": "ARCADE_CAT", "score": 550},
    {"player_name": "HACK_THE_PLANET", "score": 420},
    {"player_name": "TYPO_SLAYER", "score": 300},
    {"player_name": "NOOB_FINGERS", "score": 150},
    {"player_name": "SLOTH_TYPER", "score": 40}
]

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

@app.route('/api/leaderboard/', methods=['GET'])
def get_leaderboard():
    if not LeaderboardEntry.query.first():
        for entry in DEFAULT_SCORES:
            new_entry = LeaderboardEntry(
                player_name=entry["player_name"],
                score=entry["score"]
            )
            db.session.add(new_entry)
        db.session.commit()
        
    entries = LeaderboardEntry.query.order_by(LeaderboardEntry.score.desc(), LeaderboardEntry.date.desc()).limit(10).all()
    data = []
    for entry in entries:
        data.append({
            "player_name": entry.player_name,
            "score": entry.score,
            "date": entry.date.isoformat() if entry.date else None
        })
    return jsonify(data)

@app.route('/api/submit/', methods=['POST'])
def submit_score():
    try:
        data = request.get_json()
        if not data:
            data = request.form
            
        player_name = str(data.get("player_name", "PILOT")).upper()
        score = int(data.get("score", 0))
        wpm = int(data.get("wpm", 0))
        accuracy = float(data.get("accuracy", 0.0))
        
        user = current_user if current_user.is_authenticated else None
        user_id = user.id if user else None
        
        if user:
            player_name = user.username
            match_history = MatchHistory(
                user_id=user.id,
                score=score,
                wpm=wpm,
                accuracy=accuracy
            )
            db.session.add(match_history)

        entry = LeaderboardEntry(
            user_id=user_id,
            player_name=player_name,
            score=score
        )
        db.session.add(entry)
        db.session.commit()
        
        return jsonify({
            "status": "success",
            "message": "High score recorded successfully!",
            "id": entry.id
        })
    except Exception as e:
        print("Error processing submit:", str(e))
        return jsonify({"status": "error", "message": "Invalid payload"}), 400

@app.route('/api/register/', methods=['POST'])
def register_user():
    try:
        data = request.get_json()
        if not data:
            data = request.form

        username = data.get('username')
        password = data.get('password')

        if not username or not password:
            return jsonify({"error": "Username and password required"}), 400
        
        if User.query.filter_by(username=username).first():
            return jsonify({"error": "Username already exists"}), 400
        
        hashed_password = generate_password_hash(password)
        new_user = User(username=username, password_hash=hashed_password)
        db.session.add(new_user)
        db.session.commit()
        
        login_user(new_user)
        return jsonify({"status": "success", "username": new_user.username})
    except Exception as e:
        return jsonify({"error": "Invalid payload"}), 400

@app.route('/api/login/', methods=['POST'])
def login_user_route():
    try:
        data = request.get_json()
        if not data:
            data = request.form

        username = data.get('username')
        password = data.get('password')

        user = User.query.filter_by(username=username).first()
        if user and check_password_hash(user.password_hash, password):
            login_user(user)
            return jsonify({"status": "success", "username": user.username})
        else:
            return jsonify({"error": "Invalid credentials"}), 400
    except Exception as e:
        return jsonify({"error": "Invalid payload"}), 400

@app.route('/api/logout/', methods=['POST'])
def logout_user_route():
    logout_user()
    return jsonify({"status": "success"})

@app.route('/api/history/', methods=['GET'])
@login_required
def get_match_history():
    history = MatchHistory.query.filter_by(user_id=current_user.id).order_by(MatchHistory.date.desc()).limit(50).all()
    data = []
    for match in history:
        data.append({
            "id": match.id,
            "score": match.score,
            "wpm": match.wpm,
            "accuracy": match.accuracy,
            "date": match.date.isoformat() if match.date else None
        })
    return jsonify(data)

@app.route('/api/check-auth/', methods=['GET'])
def check_auth():
    if current_user.is_authenticated:
        return jsonify({"authenticated": True, "username": current_user.username})
    return jsonify({"authenticated": False})

@app.route('/api/user/', methods=['GET'])
def get_user():
    if current_user.is_authenticated:
        return jsonify({
            "authenticated": True,
            "username": current_user.username,
            "id": current_user.id,
            "history_url": "/api/history/",
            "leaderboard_url": "/api/leaderboard/"
        })
    return jsonify({"authenticated": False})

@app.route('/')
def index():
    return 'Flask backend is running'

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(host='0.0.0.0', port=8000, debug=True)
