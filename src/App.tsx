import React, { useState, useEffect, useRef } from 'react';
import { 
  Trophy, 
  Download, 
  Play, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Shield, 
  Code, 
  Check, 
  Copy, 
  Cpu, 
  Activity, 
  Award, 
  Flame, 
  Heart,
  Keyboard,
  LogOut
} from 'lucide-react';
import { GameWord, LaserLine, SparkParticle, LeaderboardEntry, SyncHistoryEntry, GamePanel, MatchHistoryEntry } from './types';
import { audio } from './utils/audio';
import { wordBank } from './utils/words';

const originalFetch = typeof window !== 'undefined' ? window.fetch.bind(window) : null;

const appFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  if (originalFetch) {
    const fetchInit = { ...init };
    const apiRequest =
      (typeof input === 'string' && input.startsWith('/api/')) ||
      (input instanceof Request && input.url.includes('/api/'));

    // Ensure session cookies are sent to the API and keep same-origin semantics
    if (apiRequest) {
      fetchInit.credentials = 'include';
      fetchInit.mode = 'same-origin';
    }
    return originalFetch(input, fetchInit);
  }
  throw new Error('Fetch API not available');
};

export default function App() {
  // Tabs: 'play' or 'source'
  const [activeTab, setActiveTab] = useState<'play' | 'source'>('play');
  
  // Game UI panel states
  const [panel, setPanel] = useState<GamePanel>('start');
  const [playerName, setPlayerName] = useState<string>('');
  const [score, setScore] = useState<number>(0);
  const [lives, setLives] = useState<number>(3);
  const [level, setLevel] = useState<number>(1);
  const [wpm, setWpm] = useState<number>(0);
  const [accuracy, setAccuracy] = useState<number>(100);
  const [streak, setStreak] = useState<number>(0);
  const [inputValue, setInputValue] = useState<string>('');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [shakeCabinet, setShakeCabinet] = useState<boolean>(false);
  
  // Auth and Match History
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [authUsername, setAuthUsername] = useState<string>('');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const [matchHistory, setMatchHistory] = useState<MatchHistoryEntry[]>([]);
  const [matchHistoryLoading, setMatchHistoryLoading] = useState<boolean>(false);
  const [matchHistorySource, setMatchHistorySource] = useState<GamePanel>('start');
  
  // Stats detail
  const [goWpm, setGoWpm] = useState<number>(0);
  const [goAcc, setGoAcc] = useState<number>(0);
  const [goDestroyed, setGoDestroyed] = useState<number>(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardSource, setLeaderboardSource] = useState<GamePanel>('start');
  const [historySource, setHistorySource] = useState<GamePanel>('start');
  const [leaderboardLoading, setLeaderboardLoading] = useState<boolean>(false);
  const [syncHistory, setSyncHistory] = useState<SyncHistoryEntry[]>([]);
  const [prototypeSource, setPrototypeSource] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  // Core Game Engine REFS
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameLoopIdRef = useRef<number | null>(null);
  const wordsRef = useRef<GameWord[]>([]);
  const lasersRef = useRef<LaserLine[]>([]);
  const particlesRef = useRef<SparkParticle[]>([]);
  
  // Ref mirrors of states to safely query in animation loop without closures
  const scoreRef = useRef<number>(0);
  const livesRef = useRef<number>(3);
  const levelRef = useRef<number>(1);
  const streakRef = useRef<number>(0);
  const typedInputRef = useRef<string>('');
  const lastSpawnTimeRef = useRef<number>(0);
  const spawnDelayRef = useRef<number>(2200);
  const speedScaleRef = useRef<number>(0.85);
  const correctCharsRef = useRef<number>(0);
  const totalCharsRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const wordsDestroyedRef = useRef<number>(0);
  const gridScrollRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);

  // Fetch index prototype code on load
  const checkAuthStatus = async () => {
    setAuthChecking(true);
    try {
      const res = await appFetch('/api/check-auth/');
      const data = await res.json();
      if (data.authenticated) {
        setCurrentUser(data.username);
      } else {
        setCurrentUser(null);
      }
    } catch (err) {
      setCurrentUser(null);
    } finally {
      setAuthChecking(false);
    }
  };

  useEffect(() => {
    appFetch('/prototype.html')
      .then(res => res.text())
      .then(text => setPrototypeSource(text))
      .catch(err => console.error("Could not load prototype source file", err));

    checkAuthStatus();
  }, []);

  // Update sound state from reactive settings
  useEffect(() => {
    const currentMuted = audio.getMuted();
    if (currentMuted !== isMuted) {
      audio.toggleMute();
    }
  }, [isMuted]);

  // Clean up loops on unmount
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('syncHistory') : null;
    if (saved) {
      try {
        setSyncHistory(JSON.parse(saved));
      } catch {
        // ignore corrupt storage
      }
    }

    return () => {
      if (gameLoopIdRef.current) {
        cancelAnimationFrame(gameLoopIdRef.current);
      }
    };
  }, []);

  const triggerDamage = () => {
    audio.playLifeLost();
    setShakeCabinet(true);
    setTimeout(() => setShakeCabinet(false), 350);
  };

  const handleLogout = async () => {
    if (gameLoopIdRef.current) {
      cancelAnimationFrame(gameLoopIdRef.current);
    }
    
    try {
      await appFetch('/api/logout/', { method: 'POST' });
    } catch (e) {}
    
    setCurrentUser(null);
    setPlayerName('');
    setPanel('start');
  };

  const submitAuth = async (isLogin: boolean) => {
    setAuthError('');
    if (!authUsername || !authPassword) {
      setAuthError('Please enter username and password');
      return;
    }
    
    const endpoint = isLogin ? '/api/login/' : '/api/register/';
    try {
      const res = await appFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsername, password: authPassword })
      });
      
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Authentication failed');
        return;
      }

      await checkAuthStatus();
      if (!currentUser && data.username) {
        setCurrentUser(data.username);
      }
      setAuthUsername('');
      setAuthPassword('');
      setPanel('start');
    } catch (err) {
      setAuthError('Network error');
    }
  };

  const queryMatchHistory = async (source: GamePanel) => {
    setMatchHistorySource(source);
    setMatchHistoryLoading(true);
    setPanel('match_history');

    try {
      const res = await appFetch('/api/history/');
      if (!res.ok) {
        setMatchHistory([]);
        return;
      }

      const list = await res.json();
      setMatchHistory(list);
    } catch (err) {
      setMatchHistory([]);
    } finally {
      setMatchHistoryLoading(false);
    }
  };

  const handleStartGame = () => {
    const finalName = playerName.trim() ? playerName.trim().toUpperCase() : 'PILOT';
    setPlayerName(finalName);
    
    // Init Audio context on user gesture
    audio.playLevelUp();

    // Reset loop variables
    scoreRef.current = 0;
    livesRef.current = 3;
    levelRef.current = 1;
    streakRef.current = 0;
    typedInputRef.current = '';
    wordsRef.current = [];
    lasersRef.current = [];
    particlesRef.current = [];
    lastSpawnTimeRef.current = Date.now();
    spawnDelayRef.current = 2200;
    speedScaleRef.current = 0.85;
    correctCharsRef.current = 0;
    totalCharsRef.current = 0;
    startTimeRef.current = Date.now();
    wordsDestroyedRef.current = 0;
    gridScrollRef.current = 0;

    // Reset reactive states
    setScore(0);
    setLives(3);
    setLevel(1);
    setStreak(0);
    setWpm(0);
    setAccuracy(100);
    setInputValue('');
    setPanel('game');

    // Cancel old loop
    if (gameLoopIdRef.current) cancelAnimationFrame(gameLoopIdRef.current);

    // Bootstrap animation frame loop
    lastFrameTimeRef.current = performance.now();
    gameLoopIdRef.current = requestAnimationFrame(gameLoop);
  };

  // Main Canvas game tick
  const gameLoop = (timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const delta = (timestamp - lastFrameTimeRef.current) / 1000;
    lastFrameTimeRef.current = timestamp;

    const canvasWidth = canvas.width / (window.devicePixelRatio || 1);
    const canvasHeight = canvas.height / (window.devicePixelRatio || 1);

    // 1. Spawning Mechanics
    const now = Date.now();
    if (now - lastSpawnTimeRef.current > spawnDelayRef.current) {
      spawnWord();
      lastSpawnTimeRef.current = now;
    }

    // 2. Physics & State updates
    const wordsToRemove: GameWord[] = [];
    wordsRef.current.forEach(word => {
      // update Y coordinate as percentage
      word.y += (word.speed * delta / canvasHeight) * 100;

      // Word breaches bottom threshold (90%)
      if (word.y >= 92) {
        wordsToRemove.push(word);
        livesRef.current--;
        streakRef.current = 0;
        triggerDamage();
        
        // sync states immediately
        setLives(livesRef.current);
        setStreak(0);
        setLevel(levelRef.current);
      }
    });

    // Remove breached words
    if (wordsToRemove.length > 0) {
      wordsRef.current = wordsRef.current.filter(w => !wordsToRemove.includes(w));
    }

    // Update active lasers
    lasersRef.current.forEach(laser => {
      laser.progress += delta;
    });
    lasersRef.current = lasersRef.current.filter(laser => laser.progress < laser.duration);

    // Update particles
    particlesRef.current.forEach(p => {
      p.x += p.vx * delta;
      p.y += p.vy * delta;
      p.alpha -= p.decay * delta;
    });
    particlesRef.current = particlesRef.current.filter(p => p.alpha > 0);

    // Parallax background grid scroll
    gridScrollRef.current = (gridScrollRef.current + (15 + levelRef.current * 10) * delta) % 40;

    // Calculate typing statistics
    const minutesElapsed = (now - startTimeRef.current) / 1000 / 60;
    if (minutesElapsed > 0) {
      const calculatedWpm = (correctCharsRef.current / 5) / minutesElapsed;
      setWpm(Math.min(250, Math.max(0, calculatedWpm)));
    }

    if (totalCharsRef.current > 0) {
      const calculatedAcc = (correctCharsRef.current / totalCharsRef.current) * 100;
      setAccuracy(Math.min(100, Math.max(10, calculatedAcc)));
    }

    // 3. Render Canvas Elements
    drawCanvas(ctx, canvasWidth, canvasHeight);

    // 4. Continuation Check
    if (livesRef.current > 0) {
      gameLoopIdRef.current = requestAnimationFrame(gameLoop);
    } else {
      handleGameOver();
    }
  };

  const spawnWord = () => {
    // Choose appropriate vocabulary based on current difficulty level
    const currentLvl = levelRef.current;
    const allowedPools = [1];
    if (currentLvl >= 2) allowedPools.push(2);
    if (currentLvl >= 3) allowedPools.push(3);
    if (currentLvl >= 4) allowedPools.push(4);
    if (currentLvl >= 5) allowedPools.push(5);

    const poolKey = allowedPools[Math.floor(Math.random() * allowedPools.length)];
    const wordPool = wordBank[poolKey] || wordBank[1];
    const text = wordPool[Math.floor(Math.random() * wordPool.length)];

    // Prevent direct twins on screen
    if (wordsRef.current.some(w => w.text === text)) return;

    // Horizontal placement between 15% and 80% to avoid clipped borders
    const x = 15 + Math.random() * 65;
    
    const colors = [
      '#ff007f', // pink
      '#00f0ff', // cyan
      '#fffb00', // yellow
      '#39ff14', // green
      '#b026ff'  // purple
    ];
    const color = colors[Math.floor(Math.random() * colors.length)];

    // Speed scales dynamically with level
    const baseSpeed = (12 + (currentLvl * 4)) * speedScaleRef.current;
    const speed = baseSpeed + (Math.random() * 8);

    wordsRef.current.push({
      id: Math.random().toString(36).substr(2, 9),
      text,
      x,
      y: -5,
      speed,
      color
    });
  };

  const drawCanvas = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);

    // A. Starry outer space backdrop
    ctx.fillStyle = '#06020c';
    ctx.fillRect(0, 0, w, h);

    // Draw grid perspective
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.05)';
    ctx.lineWidth = 1;
    const horizon = h * 0.15;

    // Perspective Lines converging to center horizon
    const verticalLines = 14;
    for (let i = 0; i <= verticalLines; i++) {
      const ratio = i / verticalLines;
      const startX = w * (0.46 + (ratio - 0.5) * 0.08);
      const endX = w * ratio;
      ctx.beginPath();
      ctx.moveTo(startX, horizon);
      ctx.lineTo(endX, h);
      ctx.stroke();
    }

    // Horizontal grid scrolling lines
    const horizontalGrids = 8;
    for (let i = 0; i < horizontalGrids; i++) {
      const yOffset = (i * (h - horizon) / horizontalGrids + gridScrollRef.current) % (h - horizon);
      const drawY = horizon + yOffset;
      ctx.strokeStyle = `rgba(255, 0, 127, ${0.01 + 0.07 * (yOffset / (h - horizon))})`;
      ctx.beginPath();
      ctx.moveTo(0, drawY);
      ctx.lineTo(w, drawY);
      ctx.stroke();
    }

    // Draw danger line boundary (90% height)
    ctx.strokeStyle = 'rgba(255, 0, 127, 0.3)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(0, h * 0.9);
    ctx.lineTo(w, h * 0.9);
    ctx.stroke();
    ctx.setLineDash([]); // reset dash

    // B. Draw lasers
    lasersRef.current.forEach(laser => {
      const t = laser.progress / laser.duration;
      ctx.save();
      ctx.strokeStyle = laser.color;
      ctx.lineWidth = 6 * (1 - t);
      ctx.shadowColor = laser.color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(laser.startX, laser.startY);
      ctx.lineTo(laser.endX, laser.endY);
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 * (1 - t);
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(laser.startX, laser.startY);
      ctx.lineTo(laser.endX, laser.endY);
      ctx.stroke();
      ctx.restore();
    });

    // C. Draw Particles
    particlesRef.current.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // D. Draw Words with glowing capsules
    wordsRef.current.forEach(word => {
      const xPos = (word.x / 100) * w;
      const yPos = (word.y / 100) * h;

      ctx.save();
      ctx.font = "bold 16px 'Share Tech Mono'";
      const textWidth = ctx.measureText(word.text).width;
      const paddingX = 10;
      const paddingY = 6;
      const capW = textWidth + paddingX * 2;
      const capH = 20 + paddingY * 2;
      const capX = xPos - capW / 2;
      const capY = yPos - capH / 2;

      // Draw Capsule Background
      ctx.fillStyle = 'rgba(13, 4, 21, 0.85)';
      const isFocused = typedInputRef.current && word.text.startsWith(typedInputRef.current);
      
      const strokeStyleStr = word.y > 75 ? '#ff007f' : (isFocused ? '#00f0ff' : word.color);
      ctx.strokeStyle = strokeStyleStr;
      ctx.lineWidth = isFocused ? 2 : 1;
      
      // Shadow glow based on status
      ctx.shadowColor = strokeStyleStr;
      ctx.shadowBlur = word.y > 75 ? 10 : (isFocused ? 8 : 4);

      // Draw capsule rounded border
      drawRoundedRect(ctx, capX, capY, capW, capH, 6);
      ctx.fill();
      ctx.stroke();

      // Render Text characters inside capsule
      ctx.shadowBlur = 0; // reset for text readability
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // If user typing matched prefix, highlight it
      if (typedInputRef.current && word.text.startsWith(typedInputRef.current)) {
        const matchLen = typedInputRef.current.length;
        const matchedStr = word.text.substring(0, matchLen);
        const remainingStr = word.text.substring(matchLen);

        // Calculate positions
        const totalTextWidth = ctx.measureText(word.text).width;
        let drawStartX = xPos - totalTextWidth / 2;

        ctx.textAlign = 'left';
        
        // Draw matched portion in glowing cyan
        ctx.fillStyle = '#00f0ff';
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 4;
        ctx.fillText(matchedStr, drawStartX, yPos);
        
        // Draw remaining portion in white
        const matchedWidth = ctx.measureText(matchedStr).width;
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 0;
        ctx.fillText(remainingStr, drawStartX + matchedWidth, yPos);
      } else {
        // Draw plain word in white
        ctx.fillStyle = '#ffffff';
        ctx.fillText(word.text, xPos, yPos);
      }

      ctx.restore();
    });
  };

  // Helper utility to draw rounded rectangles on HTML5 Canvas
  const drawRoundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  };

  const handleTypingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.toLowerCase().replace(/\s/g, ''); // no spaces allowed
    setInputValue(rawVal);
    typedInputRef.current = rawVal;
    totalCharsRef.current++;
    audio.playClick();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      evaluateMatch();
    }
  };

  const evaluateMatch = () => {
    const term = inputValue.trim().toLowerCase();
    if (!term) return;

    // Check if matching word on screen
    const matchIdx = wordsRef.current.findIndex(w => w.text.toLowerCase() === term);

    if (matchIdx !== -1) {
      const match = wordsRef.current[matchIdx];
      
      // Update statistics
      correctCharsRef.current += match.text.length + 1; // chars + enter key
      wordsDestroyedRef.current++;
      streakRef.current++;
      
      // Calculate gained score: length points * speed factor * multipliers
      const points = match.text.length * 10;
      const speedMultiplier = Math.round(match.speed / 10);
      const mult = getStreakMultiplier(streakRef.current);
      const addedScore = points * speedMultiplier * mult;
      scoreRef.current += addedScore;

      // Draw firing laser beam line from gun turret
      const canvas = canvasRef.current;
      if (canvas) {
        const cw = canvas.width / (window.devicePixelRatio || 1);
        const ch = canvas.height / (window.devicePixelRatio || 1);
        const endX = (match.x / 100) * cw;
        const endY = (match.y / 100) * ch;

        lasersRef.current.push({
          startX: cw / 2,
          startY: ch - 50,
          endX,
          endY,
          progress: 0,
          duration: 0.15,
          color: match.color
        });

        // Spawn explode sparkles
        spawnSparks(endX, endY, match.color);
      }

      // Check level upgrades (every 200 points scale up speed and frequency)
      const currentOldLvl = levelRef.current;
      levelRef.current = Math.floor(scoreRef.current / 200) + 1;
      if (levelRef.current > currentOldLvl) {
        audio.playLevelUp();
        spawnDelayRef.current = Math.max(800, 2200 - (levelRef.current * 200));
        speedScaleRef.current += 0.12;
      }

      // Sound play
      audio.playLaser();

      // Splice word
      wordsRef.current.splice(matchIdx, 1);

      // Reset inputs
      setInputValue('');
      typedInputRef.current = '';

      // Sync state hook variables
      setScore(scoreRef.current);
      setLevel(levelRef.current);
      setStreak(streakRef.current);
    } else {
      // Typo failed match
      streakRef.current = 0;
      setStreak(0);
      
      // Input shake buzzer visual indicator
      const inputElem = document.getElementById('react-typing-input');
      if (inputElem) {
        inputElem.classList.add('error-shake');
        setTimeout(() => inputElem.classList.remove('error-shake'), 200);
      }
    }
  };

  const getStreakMultiplier = (currentStreak: number) => {
    if (currentStreak >= 25) return 4;
    if (currentStreak >= 15) return 3;
    if (currentStreak >= 5) return 2;
    return 1;
  };

  const spawnSparks = (x: number, y: number, color: string) => {
    const sparks = 20;
    for (let i = 0; i < sparks; i++) {
      const angle = Math.random() * Math.PI * 2;
      const vel = 50 + Math.random() * 120;
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * vel,
        vy: Math.sin(angle) * vel,
        size: 2 + Math.random() * 3,
        color,
        alpha: 1.0,
        decay: 1.2 + Math.random() * 1.5
      });
    }
  };

  const handleGameOver = () => {
    if (gameLoopIdRef.current) cancelAnimationFrame(gameLoopIdRef.current);
    audio.playGameOver();

    // Cache metrics for game over screen
    setGoWpm(wpm);
    setGoAcc(accuracy);
    setGoDestroyed(wordsDestroyedRef.current);

    // POST Score payload to the mocked submit endpoint
    submitScoreToServer(scoreRef.current);

    setPanel('gameover');
  };

  const submitScoreToServer = async (finalScore: number) => {
    const nameStr = playerName.trim() ? playerName.trim().toUpperCase() : 'PILOT';
    try {
      const res = await appFetch('/api/submit/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          player_name: nameStr,
          score: finalScore,
          wpm: Math.round(wpm),
          accuracy: Math.round(accuracy)
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        appendSyncHistory({
          action: 'Submit score',
          status: 'failed',
          message: `Submit failed: ${errorText || res.statusText}`,
          timestamp: new Date().toISOString()
        });
        return;
      }

      appendSyncHistory({
        action: 'Submit score',
        status: 'success',
        message: `Score submitted for ${nameStr}`,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error("Score submission network error", err);
      appendSyncHistory({
        action: 'Submit score',
        status: 'failed',
        message: (err as Error).message || 'Network error',
        timestamp: new Date().toISOString()
      });
    }
  };

  const queryLeaderboard = async (source: GamePanel) => {
    setLeaderboardSource(source);
    setLeaderboardLoading(true);
    setPanel('leaderboard');

    try {
      const res = await appFetch('/api/leaderboard/');
      if (!res.ok) {
        const errorText = await res.text();
        appendSyncHistory({
          action: 'Fetch leaderboard',
          status: 'failed',
          message: `Fetch failed: ${errorText || res.statusText}`,
          timestamp: new Date().toISOString()
        });
        setLeaderboard([]);
        return;
      }

      const list = await res.json();
      setLeaderboard(list);
      appendSyncHistory({
        action: 'Fetch leaderboard',
        status: 'success',
        message: `Loaded ${list.length} entries`,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error("Could not fetch leaderboard data", err);
      appendSyncHistory({
        action: 'Fetch leaderboard',
        status: 'failed',
        message: (err as Error).message || 'Network error',
        timestamp: new Date().toISOString()
      });
    } finally {
      setLeaderboardLoading(false);
    }
  };

  const appendSyncHistory = (entry: SyncHistoryEntry) => {
    setSyncHistory(prev => {
      const next = [entry, ...prev].slice(0, 20);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('syncHistory', JSON.stringify(next));
      }
      return next;
    });
  };

  const viewSyncHistory = (source: GamePanel) => {
    setHistorySource(source);
    setPanel('history');
  };

  const copyToClipboard = () => {
    if (!prototypeSource) return;
    navigator.clipboard.writeText(prototypeSource);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const triggerPrototypeDownload = () => {
    if (!prototypeSource) return;
    const blob = new Blob([prototypeSource], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'prototype.html';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Canvas context scaling on resize
  const onCanvasResize = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.parentElement?.getBoundingClientRect();
    if (!rect) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
    }
  };

  useEffect(() => {
    if (panel === 'game') {
      onCanvasResize();
      window.addEventListener('resize', onCanvasResize);
    }
    return () => {
      window.removeEventListener('resize', onCanvasResize);
    };
  }, [panel]);

  return (
    <div className="min-h-screen bg-[#070310] bg-radial-gradient(circle_at_center,rgba(26,11,46,0.5)_0%,transparent_100%) text-white font-sans flex flex-col selection:bg-arcade-pink selection:text-white pb-10">
      
      {/* 1. Header Banner & Nav Tabs */}
      <header className="w-full max-w-5xl mx-auto px-4 mt-6 flex flex-col md:flex-row justify-between items-center gap-4 border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <div className="bg-arcade-pink p-2 rounded-lg shadow-[0_0_15px_rgba(255,0,127,0.4)] animate-pulse">
            <Keyboard className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-black tracking-widest text-white uppercase neon-glow-pink">
              Type or Die
            </h1>
            <p className="text-xs font-mono text-arcade-cyan tracking-wider uppercase">
              Retro Typing Speedrun Terminal
            </p>
          </div>
        </div>

        {/* Action Toggle Tabs */}
        <div className="flex bg-[#0d071d] p-1 rounded-xl border border-white/10 gap-1">
          <button
            onClick={() => setActiveTab('play')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-display text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'play'
                ? 'bg-arcade-pink text-white shadow-[0_0_12px_rgba(255,0,127,0.35)]'
                : 'text-white/40 hover:text-white/80'
            }`}
          >
            🕹️ Play Emulator
          </button>
          <button
            onClick={() => setActiveTab('source')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-display text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'source'
                ? 'bg-arcade-cyan text-arcade-dark shadow-[0_0_12px_rgba(0,240,255,0.35)] font-black'
                : 'text-white/40 hover:text-white/80'
            }`}
          >
            💾 Standalone Source
          </button>
        </div>
      </header>

      {/* 2. Interactive App View */}
      <main className="flex-grow w-full max-w-5xl mx-auto px-4 mt-6">
        
        {activeTab === 'play' ? (
          <div className="w-full">
            
            {/* Retro Cabinet Wrapper */}
            <div 
              className={`w-full max-w-3xl mx-auto bg-arcade-cabinet rounded-2xl border-4 border-[#22123d] shadow-[0_0_35px_rgba(0,0,0,0.8),0_0_20px_#ff007f] relative overflow-hidden transition-transform duration-300 ${
                shakeCabinet ? 'screen-shake' : ''
              }`}
            >
              {/* Marquee Top */}
              <div className="bg-[#05020a] border-b-4 border-arcade-pink p-4 text-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] animate-scanline" />
                <h2 className="text-3xl font-display font-black tracking-[0.25em] text-white uppercase neon-glow-pink animate-pulse">
                  TYPE OR DIE
                </h2>
                <div className="text-[10px] font-mono text-arcade-cyan tracking-[0.3em] uppercase mt-1">
                  Typing Speedrun Arena
                </div>
              </div>

              {/* Monitor Screen Frame */}
              <div className="bg-[#030107] relative h-[480px] w-full flex flex-col overflow-hidden crt-overlay">
                <div className="absolute inset-0 animate-scanline pointer-events-none z-10" />

                {/* PANEL 1: START SCREEN */}
                {panel === 'start' && (
                  <div className="absolute inset-0 flex flex-col justify-between items-center p-8 z-20 bg-[#05020a]">
                    <div className="text-center mt-6">
                      <h3 className="text-2xl font-display font-bold tracking-wider text-white neon-glow-cyan uppercase animate-flicker">
                        Insert Name
                      </h3>
                      <p className="text-xs text-white/50 max-w-md mx-auto leading-relaxed mt-3">
                        Prepare your fingers. Words fall from orbit. Speed scales up dynamically. Let a word breach the perimeter and suffer catastrophic de-synchronization.
                      </p>
                    </div>

                    <div className="w-full max-w-xs text-center">
                      <label className="text-[10px] font-mono text-arcade-cyan tracking-widest uppercase block mb-3">
                        Operator Identification
                      </label>
                      {currentUser ? (
                        <div className="w-full bg-[#1a0b2e]/60 border-2 border-arcade-cyan rounded-lg px-4 py-3 font-mono text-xl text-center text-white uppercase tracking-[0.2em]">
                          {currentUser}
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={playerName}
                          onChange={(e) => setPlayerName(e.target.value.substring(0, 12))}
                          onKeyPress={(e) => e.key === 'Enter' && handleStartGame()}
                          placeholder="PILOT"
                          maxLength={12}
                          className="w-full bg-[#1a0b2e]/60 border-2 border-arcade-cyan rounded-lg px-4 py-3 font-mono text-xl text-center text-white placeholder-white/20 uppercase tracking-[0.2em] outline-none transition-all focus:border-arcade-pink focus:shadow-[0_0_15px_rgba(255,0,127,0.4)]"
                          autoFocus
                        />
                      )}
                    </div>

                    <div className="flex gap-4 mb-6 flex-wrap justify-center">
                      <button
                        onClick={handleStartGame}
                        className="bg-transparent border-2 border-arcade-pink text-white font-display text-sm font-bold uppercase tracking-wider px-6 py-3 rounded-lg hover:bg-arcade-pink hover:shadow-[0_0_20px_#ff007f] active:scale-95 transition-all cursor-pointer"
                      >
                        Run Protocol
                      </button>
                      <button
                        onClick={() => queryLeaderboard('start')}
                        className="bg-transparent border-2 border-arcade-cyan text-white font-display text-sm font-bold uppercase tracking-wider px-6 py-3 rounded-lg hover:bg-arcade-cyan hover:text-arcade-dark hover:shadow-[0_0_20px_#00f0ff] active:scale-95 transition-all cursor-pointer"
                      >
                        Leaderboard
                      </button>
                      {currentUser ? (
                        <>
                          <button
                            onClick={() => queryMatchHistory('start')}
                            className="bg-transparent border-2 border-arcade-yellow text-white font-display text-sm font-bold uppercase tracking-wider px-6 py-3 rounded-lg hover:bg-arcade-yellow hover:text-arcade-dark hover:shadow-[0_0_20px_#fffb00] active:scale-95 transition-all cursor-pointer"
                          >
                            My Matches
                          </button>
                          <button
                            onClick={handleLogout}
                            className="bg-transparent border-2 border-arcade-green text-white font-display text-sm font-bold uppercase tracking-wider px-6 py-3 rounded-lg hover:bg-arcade-green hover:text-arcade-dark hover:shadow-[0_0_20px_#39ff14] active:scale-95 transition-all cursor-pointer"
                          >
                            Logout
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setPanel('auth')}
                          className="bg-transparent border-2 border-arcade-green text-white font-display text-sm font-bold uppercase tracking-wider px-6 py-3 rounded-lg hover:bg-arcade-green hover:text-arcade-dark hover:shadow-[0_0_20px_#39ff14] active:scale-95 transition-all cursor-pointer"
                        >
                          Login / Register
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* PANEL 1.5: AUTH SCREEN */}
                {panel === 'auth' && (
                  <div className="absolute inset-0 flex flex-col justify-center items-center p-8 z-20 bg-[#05020a]">
                    <div className="text-center mb-6">
                      <h3 className="text-2xl font-display font-bold tracking-wider text-arcade-green neon-glow-cyan uppercase animate-pulse">
                        Authentication
                      </h3>
                      <p className="text-[10px] font-mono text-white/40 uppercase tracking-widest mt-2">
                        Identify Yourself to the Matrix
                      </p>
                    </div>

                    <div className="w-full max-w-xs flex flex-col gap-4">
                      <input
                        type="text"
                        value={authUsername}
                        onChange={(e) => setAuthUsername(e.target.value)}
                        placeholder="USERNAME"
                        className="w-full bg-[#1a0b2e]/60 border border-arcade-cyan rounded-lg px-4 py-2 font-mono text-sm text-center text-white placeholder-white/20 outline-none transition-all focus:border-arcade-pink"
                      />
                      <input
                        type="password"
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                        placeholder="PASSWORD"
                        className="w-full bg-[#1a0b2e]/60 border border-arcade-cyan rounded-lg px-4 py-2 font-mono text-sm text-center text-white placeholder-white/20 outline-none transition-all focus:border-arcade-pink"
                      />
                    </div>

                    {authError && (
                      <div className="text-arcade-pink text-xs font-mono mt-3 uppercase tracking-wider">
                        {authError}
                      </div>
                    )}

                    <div className="flex gap-4 mt-6 flex-wrap justify-center">
                      <button
                        onClick={() => submitAuth(true)}
                        className="bg-arcade-green/10 border-2 border-arcade-green text-white font-display text-sm font-bold uppercase tracking-wider px-6 py-2 rounded-lg hover:bg-arcade-green hover:text-arcade-dark hover:shadow-[0_0_20px_#39ff14] transition-all cursor-pointer"
                      >
                        Login
                      </button>
                      <button
                        onClick={() => submitAuth(false)}
                        className="bg-transparent border-2 border-arcade-cyan text-white font-display text-sm font-bold uppercase tracking-wider px-6 py-2 rounded-lg hover:bg-arcade-cyan hover:text-arcade-dark hover:shadow-[0_0_20px_#00f0ff] transition-all cursor-pointer"
                      >
                        Register
                      </button>
                      <button
                        onClick={() => setPanel('start')}
                        className="bg-transparent border-2 border-white/20 text-white/60 font-display text-sm font-bold uppercase tracking-wider px-6 py-2 rounded-lg hover:border-white hover:text-white transition-all cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* PANEL 2: GAMEPLAY SCREEN */}
                {panel === 'game' && (
                  <div className="absolute inset-0 flex flex-col justify-between z-20">
                    
                    {/* HUD Header */}
                    <div className="flex justify-between items-center px-6 py-3 bg-gradient-to-b from-[#100624] to-transparent border-b border-white/5">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-mono text-white/50 uppercase tracking-widest">Score</span>
                        <span className="text-md font-display font-bold text-arcade-cyan neon-glow-cyan">
                          {String(score).padStart(6, '0')}
                        </span>
                      </div>
                      
                      <div className="flex flex-col items-center">
                        <span className="text-[9px] font-mono text-white/50 uppercase tracking-widest">Speed</span>
                        <span className="text-md font-display font-bold text-arcade-yellow">
                          LVL {level}
                        </span>
                      </div>

                      <div className="flex flex-col items-center">
                        <span className="text-[9px] font-mono text-white/50 uppercase tracking-widest">WPM</span>
                        <span className="text-md font-display font-bold text-white">
                          {Math.round(wpm)}
                        </span>
                      </div>

                      <div className="flex flex-col items-center">
                        <span className="text-[9px] font-mono text-white/50 uppercase tracking-widest">Accuracy</span>
                        <span className="text-md font-display font-bold text-arcade-cyan">
                          {Math.round(accuracy)}%
                        </span>
                      </div>

                      <div className="flex flex-col items-center">
                        <span className="text-[9px] font-mono text-white/50 uppercase tracking-widest">Streak</span>
                        <span className="text-md font-display font-bold text-arcade-pink neon-glow-pink">
                          x{getStreakMultiplier(streak)}
                        </span>
                      </div>

                      <div className="flex flex-col items-end">
                        <span className="text-[9px] font-mono text-white/50 uppercase tracking-widest mb-1">Lives</span>
                        <div className="flex gap-1">
                          {[1, 2, 3].map(h => (
                            <Heart 
                              key={h}
                              className={`w-4 h-4 transition-all duration-300 ${
                                h <= lives 
                                  ? 'fill-arcade-pink text-arcade-pink drop-shadow-[0_0_3px_#ff007f]' 
                                  : 'text-white/10 scale-90'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Canvas Main Viewport */}
                    <div className="flex-grow relative overflow-hidden">
                      <canvas 
                        ref={canvasRef} 
                        className="absolute inset-0 w-full h-full"
                      />
                    </div>

                    {/* Bottom Console Controls */}
                    <div className="bg-gradient-to-t from-[#100624] to-[#06020c] border-t border-[#00f0ff]/15 p-4 flex flex-col items-center gap-2">
                      <div className="w-full max-w-md relative">
                        <input
                          id="react-typing-input"
                          type="text"
                          value={inputValue}
                          onChange={handleTypingChange}
                          onKeyDown={handleKeyDown}
                          placeholder="TYPE WORD HERE & ENTER"
                          autoComplete="off"
                          className="w-full bg-[#0a0415]/85 border-2 border-arcade-cyan rounded-full px-6 py-2.5 font-mono text-lg text-center text-white placeholder-white/20 tracking-wider outline-none transition-all focus:shadow-[0_0_15px_rgba(0,240,255,0.35)]"
                        />
                      </div>
                      
                      <div className="w-full max-w-md flex justify-between items-center text-[10px] font-mono text-white/40 px-2">
                        <span>PRESS [SPACE] OR [ENTER] TO BLAST</span>
                        <div className="flex gap-4">
                          <button 
                            onClick={() => setIsMuted(!isMuted)}
                            className="flex items-center gap-1 hover:text-arcade-cyan transition-colors cursor-pointer"
                          >
                            {isMuted ? (
                              <>
                                <VolumeX className="w-3.5 h-3.5 text-white/30" /> AUDIO OFF
                              </>
                            ) : (
                              <>
                                <Volume2 className="w-3.5 h-3.5 text-arcade-cyan" /> AUDIO ON
                              </>
                            )}
                          </button>

                          <button 
                            onClick={handleLogout}
                            className="flex items-center gap-1 hover:text-arcade-pink transition-colors text-white/40 hover:text-arcade-pink font-bold uppercase tracking-wider cursor-pointer"
                          >
                            <LogOut className="w-3 h-3 text-white/30 hover:text-arcade-pink" /> Logout
                          </button>
                        </div>
                      </div>
                    </div>

                  </div>
                )}

                {/* PANEL 3: GAME OVER SCREEN */}
                {panel === 'gameover' && (
                  <div className="absolute inset-0 flex flex-col justify-center items-center p-8 z-20 bg-[#05020a]/95 backdrop-blur-sm">
                    <h3 className="text-4xl font-display font-black text-arcade-pink neon-glow-pink tracking-widest uppercase animate-pulse mb-6">
                      De-Synced
                    </h3>

                    {/* Statistics grid */}
                    <div className="grid grid-cols-2 gap-4 w-full max-w-md mb-8">
                      <div className="bg-[#1a0b2e]/50 border border-arcade-pink/20 rounded-xl p-3 text-center">
                        <div className="text-[10px] font-mono text-white/55 tracking-wider uppercase mb-1">Final Score</div>
                        <div className="text-2xl font-display font-black text-arcade-pink neon-glow-pink">{score}</div>
                      </div>
                      <div className="bg-[#0b262e]/40 border border-arcade-cyan/30 rounded-xl p-3 text-center">
                        <div className="text-[10px] font-mono text-white/55 tracking-wider uppercase mb-1">Words Per Min</div>
                        <div className="text-2xl font-display font-black text-arcade-cyan neon-glow-cyan">{Math.round(goWpm)}</div>
                      </div>
                      <div className="bg-[#1a0b2e]/50 border border-arcade-pink/20 rounded-xl p-3 text-center">
                        <div className="text-[10px] font-mono text-white/55 tracking-wider uppercase mb-1">Accuracy</div>
                        <div className="text-2xl font-display font-black text-arcade-yellow">{Math.round(goAcc)}%</div>
                      </div>
                      <div className="bg-[#1a0b2e]/50 border border-arcade-pink/20 rounded-xl p-3 text-center">
                        <div className="text-[10px] font-mono text-white/55 tracking-wider uppercase mb-1">Words Destroyed</div>
                        <div className="text-2xl font-display font-black text-arcade-green">{goDestroyed}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap justify-center gap-3">
                      <button
                        onClick={handleStartGame}
                        className="bg-transparent border-2 border-arcade-pink text-white font-display text-sm font-bold uppercase tracking-wider px-5 py-2.5 rounded-lg hover:bg-arcade-pink hover:shadow-[0_0_20px_#ff007f] active:scale-95 transition-all cursor-pointer"
                      >
                        Reboot Protocol
                      </button>
                      <button
                        onClick={() => queryLeaderboard('gameover')}
                        className="bg-transparent border-2 border-arcade-cyan text-white font-display text-sm font-bold uppercase tracking-wider px-5 py-2.5 rounded-lg hover:bg-arcade-cyan hover:text-arcade-dark hover:shadow-[0_0_20px_#00f0ff] active:scale-95 transition-all cursor-pointer"
                      >
                        Leaderboard
                      </button>
                      <button
                        onClick={() => viewSyncHistory('gameover')}
                        className="bg-transparent border-2 border-arcade-green text-white font-display text-sm font-bold uppercase tracking-wider px-5 py-2.5 rounded-lg hover:bg-arcade-green hover:text-arcade-dark hover:shadow-[0_0_20px_#39ff14] active:scale-95 transition-all cursor-pointer"
                      >
                        Sync History
                      </button>
                      {currentUser && (
                        <button
                          onClick={() => queryMatchHistory('gameover')}
                          className="bg-transparent border-2 border-arcade-yellow text-white font-display text-sm font-bold uppercase tracking-wider px-5 py-2.5 rounded-lg hover:bg-arcade-yellow hover:text-arcade-dark hover:shadow-[0_0_20px_#fffb00] active:scale-95 transition-all cursor-pointer"
                        >
                          My Matches
                        </button>
                      )}
                      <button
                        onClick={handleLogout}
                        className="bg-transparent border border-white/20 text-white/60 font-display text-sm font-bold uppercase tracking-wider px-5 py-2.5 rounded-lg hover:border-white hover:text-white hover:bg-white/5 active:scale-95 transition-all cursor-pointer"
                      >
                        {currentUser ? "Logout" : "New Pilot"}
                      </button>
                    </div>
                  </div>
                )}

                {/* PANEL 4: LEADERBOARD SCREEN */}
                {panel === 'leaderboard' && (
                  <div className="absolute inset-0 flex flex-col justify-start items-center p-8 z-20 bg-[#05020a]">
                    <h3 className="text-2xl font-display font-black text-arcade-cyan neon-glow-cyan tracking-wider uppercase mt-4">
                      Hall of Masters
                    </h3>
                    <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest mt-1 mb-4">
                      Top Matrix Speedrunners
                    </div>

                    <div className="w-full max-w-md flex-grow overflow-y-auto border border-arcade-cyan/15 bg-[#0d0415]/40 rounded-xl p-3 mb-6">
                      <table className="w-full border-collapse font-mono text-xs">
                        <thead>
                          <tr className="border-b border-arcade-cyan/20 text-arcade-cyan">
                            <th className="text-left py-2 px-3">Rank</th>
                            <th className="text-left py-2 px-3">Operator</th>
                            <th className="text-right py-2 px-3">Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {leaderboardLoading ? (
                            <tr>
                              <td colSpan={3} className="text-center py-8 text-white/40 italic">
                                Loading Encrypted Records...
                              </td>
                            </tr>
                          ) : leaderboard.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="text-center py-8 text-white/40 italic">
                                No matrix scores found.
                              </td>
                            </tr>
                          ) : (
                            leaderboard.map((entry, idx) => {
                              const r = idx + 1;
                              let badgeColor = 'text-white/80';
                              if (r === 1) badgeColor = 'text-[#ffd700] drop-shadow-[0_0_4px_rgba(255,215,0,0.5)] font-bold';
                              if (r === 2) badgeColor = 'text-[#c0c0c0] drop-shadow-[0_0_4px_rgba(192,192,192,0.5)] font-bold';
                              if (r === 3) badgeColor = 'text-[#cd7f32] drop-shadow-[0_0_4px_rgba(205,127,50,0.5)] font-bold';

                              return (
                                <tr key={idx} className="border-b border-white/5 hover:bg-arcade-pink/5 transition-colors">
                                  <td className={`py-2 px-3 font-bold ${badgeColor}`}>#{r}</td>
                                  <td className="py-2 px-3 uppercase tracking-wider font-bold">{entry.player_name}</td>
                                  <td className="py-2 px-3 text-right text-arcade-green font-bold drop-shadow-[0_0_3px_rgba(57,255,20,0.4)]">{entry.score}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex gap-4 flex-wrap justify-center">
                      <button
                        onClick={() => setPanel(leaderboardSource)}
                        className="bg-transparent border-2 border-white/30 text-white font-display text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-lg hover:border-white hover:bg-white/10 transition-all cursor-pointer"
                      >
                        Exit Terminal
                      </button>
                      <button
                        onClick={() => viewSyncHistory(leaderboardSource)}
                        className="bg-transparent border-2 border-arcade-green text-white font-display text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-lg hover:bg-arcade-green hover:text-arcade-dark hover:shadow-[0_0_20px_#39ff14] transition-all cursor-pointer"
                      >
                        Sync History
                      </button>
                      <button
                        onClick={handleLogout}
                        className="bg-transparent border border-arcade-pink/40 text-arcade-pink font-display text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-lg hover:border-arcade-pink hover:bg-arcade-pink/10 transition-all cursor-pointer"
                      >
                        Logout / New Pilot
                      </button>
                    </div>
                  </div>
                )}

                {panel === 'history' && (
                  <div className="absolute inset-0 flex flex-col justify-start items-center p-8 z-20 bg-[#05020a] overflow-hidden">
                    <h3 className="text-2xl font-display font-black text-arcade-green neon-glow-pink tracking-wider uppercase mt-4">
                      Sync History
                    </h3>
                    <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest mt-1 mb-4">
                      Recent data sync and network events
                    </div>

                    <div className="w-full max-w-md flex-grow overflow-y-auto border border-arcade-green/15 bg-[#0d0415]/40 rounded-xl p-3 mb-6">
                      <div className="space-y-3">
                        {syncHistory.length === 0 ? (
                          <div className="text-center py-8 text-white/40 italic">
                            No sync history recorded yet.
                          </div>
                        ) : (
                          syncHistory.map((entry, idx) => (
                            <div key={idx} className="rounded-xl border border-white/10 bg-[#070810]/80 p-3 backdrop-blur-sm">
                              <div className="flex justify-between items-center gap-3">
                                <div>
                                  <p className="text-xs uppercase tracking-[0.2em] text-white/40">{entry.action}</p>
                                  <p className="text-sm font-display font-bold text-white mt-1">{entry.message}</p>
                                </div>
                                <span className={`text-[10px] font-mono uppercase tracking-[0.2em] ${entry.status === 'success' ? 'text-arcade-green' : 'text-arcade-pink'}`}>
                                  {entry.status}
                                </span>
                              </div>
                              <div className="mt-2 text-[10px] font-mono text-white/50">
                                {new Date(entry.timestamp).toLocaleString()}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="flex gap-4 flex-wrap justify-center">
                      <button
                        onClick={() => setPanel(historySource)}
                        className="bg-transparent border-2 border-white/30 text-white font-display text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-lg hover:border-white hover:bg-white/10 transition-all cursor-pointer"
                      >
                        Back
                      </button>
                      <button
                        onClick={() => {
                          setSyncHistory([]);
                          if (typeof window !== 'undefined') {
                            window.localStorage.removeItem('syncHistory');
                          }
                        }}
                        className="bg-transparent border-2 border-arcade-pink text-white font-display text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-lg hover:bg-arcade-pink hover:text-white transition-all cursor-pointer"
                      >
                        Clear History
                      </button>
                    </div>
                  </div>
                )}

                {/* PANEL 6: MATCH HISTORY SCREEN */}
                {panel === 'match_history' && (
                  <div className="absolute inset-0 flex flex-col justify-start items-center p-8 z-20 bg-[#05020a]">
                    <h3 className="text-2xl font-display font-black text-arcade-yellow neon-glow-cyan tracking-wider uppercase mt-4">
                      My Match History
                    </h3>
                    <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest mt-1 mb-4">
                      Recent performance records
                    </div>

                    <div className="w-full max-w-md flex-grow overflow-y-auto border border-arcade-yellow/15 bg-[#0d0415]/40 rounded-xl p-3 mb-6">
                      <table className="w-full border-collapse font-mono text-xs">
                        <thead>
                          <tr className="border-b border-arcade-yellow/20 text-arcade-yellow">
                            <th className="text-left py-2 px-3">Date</th>
                            <th className="text-right py-2 px-3">Score</th>
                            <th className="text-right py-2 px-3">WPM</th>
                            <th className="text-right py-2 px-3">Acc</th>
                          </tr>
                        </thead>
                        <tbody>
                          {matchHistoryLoading ? (
                            <tr>
                              <td colSpan={4} className="text-center py-8 text-white/40 italic">
                                Fetching History...
                              </td>
                            </tr>
                          ) : matchHistory.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="text-center py-8 text-white/40 italic">
                                No match history found.
                              </td>
                            </tr>
                          ) : (
                            matchHistory.map((match, idx) => (
                              <tr key={idx} className="border-b border-white/5 hover:bg-arcade-yellow/5 transition-colors">
                                <td className="py-2 px-3 text-white/70">
                                  {new Date(match.date).toLocaleDateString()}
                                </td>
                                <td className="py-2 px-3 text-right text-arcade-green font-bold">
                                  {match.score}
                                </td>
                                <td className="py-2 px-3 text-right text-white font-bold">
                                  {match.wpm}
                                </td>
                                <td className="py-2 px-3 text-right text-arcade-cyan font-bold">
                                  {Math.round(match.accuracy)}%
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex gap-4 flex-wrap justify-center">
                      <button
                        onClick={() => setPanel(matchHistorySource)}
                        className="bg-transparent border-2 border-white/30 text-white font-display text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-lg hover:border-white hover:bg-white/10 transition-all cursor-pointer"
                      >
                        Back
                      </button>
                    </div>
                  </div>
                )}

              </div>

              {/* Cabinet Base Info */}
              <div className="bg-[#0a0414] border-t-4 border-arcade-pink px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-2 text-[10px] font-mono text-white/40">
                <div className="flex items-center gap-1">
                  <Cpu className="w-3.5 h-3.5 text-arcade-pink" /> 16-BIT AUDIO OSCILLATOR ONLINE
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-arcade-green shadow-[0_0_6px_#39ff14] animate-pulse" />
                  API INTEGRATION: SQLITE + DJANGO
                </div>
              </div>

            </div>

            {/* Instruction Guides */}
            <div className="w-full max-w-3xl mx-auto mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#0e081f] border border-arcade-pink/20 rounded-xl p-5 shadow-lg">
                <h4 className="text-sm font-display font-bold text-arcade-pink uppercase tracking-wider flex items-center gap-2">
                  <Award className="w-4 h-4 text-arcade-pink" /> Game Rules
                </h4>
                <p className="text-xs text-white/60 leading-relaxed mt-2.5">
                  Type words descending from the skies and hit <strong>Enter</strong> or <strong>Space</strong> to discharge neon particle lasers. Every correct hit triggers score gains and streak multipliers. Misses reset streaks!
                </p>
              </div>

              <div className="bg-[#0e081f] border border-arcade-cyan/20 rounded-xl p-5 shadow-lg">
                <h4 className="text-sm font-display font-bold text-arcade-cyan uppercase tracking-wider flex items-center gap-2">
                  <Activity className="w-4 h-4 text-arcade-cyan" /> Standalone Setup
                </h4>
                <p className="text-xs text-white/60 leading-relaxed mt-2.5">
                  This game mocks GET and POST requests in the fetch layers to query high scores from LocalStorage. When deployed alongside a real Django or Node backend, pointing requests to your endpoints works right out of the box!
                </p>
              </div>
            </div>

          </div>
        ) : (
          /* SOURCE CODE VIEW TAB */
          <div className="w-full max-w-4xl mx-auto bg-[#0d071d] rounded-xl border border-white/10 p-6 shadow-2xl">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/5 pb-4 mb-4">
              <div>
                <h3 className="text-md font-display font-bold text-arcade-cyan uppercase tracking-wider flex items-center gap-2">
                  <Code className="w-5 h-5 text-arcade-cyan" /> Single-File Prototype
                </h3>
                <p className="text-xs text-white/50 mt-1">
                  Complete, fully-contained raw HTML file with inside CSS and game loop scripts. Perfect to deploy instantly or pack inside a Django template!
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={copyToClipboard}
                  className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-white font-mono text-xs px-3.5 py-2 rounded-lg border border-white/10 transition-all cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-arcade-green" /> Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copy Code
                    </>
                  )}
                </button>
                <button
                  onClick={triggerPrototypeDownload}
                  className="flex items-center gap-1.5 bg-arcade-cyan text-arcade-dark font-display font-bold text-xs px-4 py-2 rounded-lg shadow-[0_0_12px_rgba(0,240,255,0.25)] hover:shadow-[0_0_18px_rgba(0,240,255,0.4)] transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> Download File
                </button>
              </div>
            </div>

            {/* Code editor container */}
            <div className="relative">
              <div className="absolute top-3 right-3 text-[10px] font-mono text-white/35 bg-[#05020a] border border-white/5 px-2.5 py-1 rounded">
                HTML + CSS + VANILLA JS
              </div>
              <pre className="w-full h-[520px] overflow-auto bg-[#05020a] text-[#a5e844] font-mono text-xs p-5 rounded-lg border border-white/5 select-all">
                <code>{prototypeSource || "Reading prototype source code from disk..."}</code>
              </pre>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
