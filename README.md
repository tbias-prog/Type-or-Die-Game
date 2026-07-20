<div align="center">
  <h1 style="font-family: 'Segoe UI', Roboto, sans-serif; letter-spacing: 2px;">⚡️ <strong>TYPE • OR • DIE</strong> ⚡️</h1>
  <p style="opacity:0.85; margin-top:-12px">A pulse‑pounding, neon‑soaked typing survival challenge</p>
</div>

---

**Badges:** [Build Status](#) • [License: MIT](#) • [Python](#) • [Node](#)

---

**Quick Demo:** Open the prototype at [public/prototype.html](public/prototype.html)

## Overview

Type • Or • Die is a fast-paced typing game that turns keystrokes into survival. Words spawn, the clock bites, and only sharp fingers keep you alive. The project includes a Vite + React frontend and a small Flask backend for score handling and persistence.

## Features

- Neon, high-contrast UI with audio cues and reactive word difficulty
- Local score persistence via the Flask backend
- Configurable wordlists and audio assets in `src/utils` and `assets`
- Lightweight, single-file backend for easy deployment

## Try It (Local)

Prerequisites: Node 18+ and Python 3.10+

Frontend:

```bash
npm install
npm run dev
```

Backend (Windows PowerShell):

```powershell
python -m venv venv
.
venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
python backend/app.py
```

Open `http://localhost:5173` (Vite) and the backend on the configured port.

## Gameplay

- Objective: Type the words that appear before the timer runs out.
- Each correct word adds time and raises your score.
- Missed or slow words reduce your life — reach zero and it’s game over.
- Difficulty scales with score; words get longer and spawn faster.

## Controls

- Type letters normally to complete words.
- `Enter` to submit current input (optional, instantaneous on match).
- `Esc` to pause / open settings.

## Customize

- Edit word lists: [src/utils/words.ts](src/utils/words.ts)
- Modify audio: `assets/sfx/` and `src/utils/audio.ts`
- UI tweaks: [src/App.tsx](src/App.tsx) and [index.css](index.css)

## Development Notes

- Tests: run the backend API tests with `pytest backend/test_api.py`
- Lint & format: use your preferred tools (Prettier / ESLint / Black)

## Files of Interest

- Frontend: [src/](src/) — React + Vite app
- Backend: [backend/app.py](backend/app.py) — Flask score API
- Word source: [src/utils/words.ts](src/utils/words.ts)

## Contributing

Contributions are welcome. Open an issue or submit a PR with changes. For UI/UX suggestions, include screenshots or a short GIF.

## Credits

Made with ⚡️ vibes by the Type • Or • Die team. Inspired by arcade typing challenges and neon cyber aesthetics.



