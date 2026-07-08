/* ============================================================
   Campus Master Lab IA — Servidor multijugador (Fase 3)
   9 salas (Colyseus filterBy roomId), cuentas persistentes,
   monedas por sala, chat anti-spam, asientos y emotes.
   ============================================================ */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Server, Room } = require("colyseus");
const { Schema, MapSchema, defineTypes } = require("@colyseus/schema");
const { AccessToken } = require("livekit-server-sdk");

// ---------- Voz por proximidad (LiveKit) ----------
const LK_URL = process.env.LIVEKIT_URL || "";
const LK_KEY = process.env.LIVEKIT_API_KEY || "";
const LK_SECRET = process.env.LIVEKIT_API_SECRET || "";
const VOICE_ENABLED = !!(LK_URL && LK_KEY && LK_SECRET);

// ---------- Persistencia simple en disco (prototipo) ----------
const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let users = {};
try {
  users = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
} catch (_) { users = {}; }

let saveTimer = null;
function saveUsers() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), () => {});
  }, 250);
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 32).toString("hex");
}

const USERNAME_RE = /^[\p{L}\p{N} _.-]{3,14}$/u;

// Cuentas administradoras: ADMIN_USERS="Jorge,OtroNombre" (sin distinguir mayúsculas)
const ADMIN_SET = new Set(
  (process.env.ADMIN_USERS || "")
    .split(",")
    .map((s) => s.trim().replace(/^["']+|["']+$/g, "").trim().toLowerCase())
    .filter(Boolean)
);
console.log("[admin] cuentas administradoras:", ADMIN_SET.size ? [...ADMIN_SET].join(", ") : "(ninguna — configura ADMIN_USERS)");
const isAdminKey = (key) => ADMIN_SET.has(key) || users[key]?.role === "admin";
const AVATARS = ["kai", "vera", "tato", "zoe", "max", "nina", "leo", "robi"];
const ROOM_IDS = ["plaza", "cafe", "juegos", "auditorio", "biblioteca", "jardin", "robots", "observatorio", "taller"];

// ---------- Geometría (espejo del cliente) ----------
const FLOOR_CX = 950, FLOOR_CY = 610, FLOOR_RX = 590, FLOOR_RY = 370;
const FOUNTAIN = { x: 945, y: 575, r: 185 };

function makeIsWalkable(hasFountain) {
  return (x, y) => {
    const dx = (x - FLOOR_CX) / FLOOR_RX;
    const dy = (y - FLOOR_CY) / FLOOR_RY;
    if (dx * dx + dy * dy > 1) return false;
    if (hasFountain && Math.hypot(x - FOUNTAIN.x, y - FOUNTAIN.y) <= FOUNTAIN.r) return false;
    return true;
  };
}

function makeRandomFloorPoint(isWalkable) {
  return () => {
    for (let i = 0; i < 200; i++) {
      const x = FLOOR_CX - FLOOR_RX + Math.random() * FLOOR_RX * 2;
      const y = FLOOR_CY - FLOOR_RY + Math.random() * FLOOR_RY * 2;
      if (isWalkable(x, y)) return { x, y };
    }
    return { x: 960, y: 880 };
  };
}

// ---------- Estado sincronizado ----------
class Player extends Schema {}
defineTypes(Player, {
  name: "string",
  avatar: "string",
  admin: "boolean",
  x: "number",
  y: "number",
  flip: "boolean",
  moving: "boolean",
  dir: "string",
  sit: "number",     // índice de asiento o -1
  score: "number",
});

class Coin extends Schema {}
defineTypes(Coin, { x: "number", y: "number" });

class SalaState extends Schema {}
defineTypes(SalaState, {
  players: { map: Player },
  coins: { map: Coin },
});

const COIN_COUNT = 3;
const PICKUP_DIST = 70;
const CHAT_MAX_LEN = 120;
const CHAT_WINDOW_MS = 5000;
const CHAT_WINDOW_MAX = 3;
const EMOTES = ["dance", "laugh", "wave", "heart", "party"];
const EMOTE_COOLDOWN_MS = 1200;
const MAX_SEATS = 12;

const onlineUsers = new Map();          // userKey -> sessionId activo
const passCache = new Map();            // userKey -> sha256(pass+salt) verificado
function fastHash(password, salt) {
  return crypto.createHash("sha256").update(password + ":" + salt).digest("hex");
}

// ---------- Sesión de evento (marcador global) ----------
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const session = {
  active: false,
  startedAt: null,
  baseline: {},      // userKey -> coins al iniciar
  participants: {},  // userKey -> nombre
};

function sessionJoin(key) {
  if (!session.active || !users[key]) return;
  if (!(key in session.baseline)) {
    session.baseline[key] = users[key].coins || 0;
    session.participants[key] = users[key].name;
  }
}

function sessionResults() {
  const rows = [];
  for (const key of Object.keys(session.baseline)) {
    const earned = Math.max(0, (users[key]?.coins || 0) - session.baseline[key]);
    rows.push({ name: session.participants[key] || key, earned });
  }
  rows.sort((a, b) => b.earned - a.earned);
  return rows;
}

function saveSessionLog(rows) {
  let log = [];
  try { log = JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8")); } catch (_) {}
  log.push({ startedAt: session.startedAt, endedAt: new Date().toISOString(), results: rows });
  fs.writeFile(SESSIONS_FILE, JSON.stringify(log, null, 2), () => {});
}

// ---------- Búsqueda del Tesoro (estado global entre salas) ----------
const hunt = { active: false, area: null, x: 0, y: 0, prize: 0 };
const liveRooms = new Set();
function globalBroadcast(type, data) {
  for (const r of liveRooms) r.broadcast(type, data);
}
const ROOM_NAMES = {
  plaza: "Plaza Central", cafe: "Café IA", juegos: "Sala de Juegos",
  auditorio: "Auditorio", biblioteca: "Biblioteca", jardin: "Jardín Neural",
  robots: "Lab de Robots", observatorio: "Observatorio", taller: "Taller Maker",
};

class SalaRoom extends Room {
  async onAuth(client, options) {
    const username = String(options?.username || "").trim();
    const password = String(options?.password || "");
    const register = !!options?.register;

    if (!USERNAME_RE.test(username)) {
      throw new Error("El nombre debe tener de 3 a 14 caracteres (letras, números, espacios).");
    }
    if (password.length < 4) {
      throw new Error("La contraseña debe tener al menos 4 caracteres.");
    }
    const key = username.toLowerCase();

    if (register) {
      if (users[key]) throw new Error("Ese nombre ya está registrado. Inicia sesión.");
      const salt = crypto.randomBytes(12).toString("hex");
      users[key] = {
        name: username,
        salt,
        hash: hashPassword(password, salt),
        coins: 0,
        avatar: "kai",
        createdAt: new Date().toISOString(),
      };
      saveUsers();
    } else {
      const u = users[key];
      if (!u) throw new Error("Nombre o contraseña incorrectos.");
      // Cache de verificación: al viajar entre salas evita repetir scrypt (~80ms)
      const fh = fastHash(password, u.salt);
      if (passCache.get(key) !== fh) {
        if (u.hash !== hashPassword(password, u.salt)) {
          throw new Error("Nombre o contraseña incorrectos.");
        }
        passCache.set(key, fh);
      }
    }

    // Takeover: si la cuenta ya tiene una sesión (viaje entre salas o
    // reconexión), se expulsa la conexión anterior al instante.
    if (onlineUsers.has(key)) {
      for (const r of liveRooms) {
        for (const c of [...r.clients]) {
          if (c.auth?.key === key) {
            try { c.leave(4001); } catch (_) {}
          }
        }
      }
    }
    onlineUsers.set(key, client.sessionId);
    return { key };
  }

  onCreate(options) {
    this.area = ROOM_IDS.includes(options?.area) ? options.area : "plaza";
    this.maxClients = 40;
    this.setState(new SalaState());
    this.state.players = new MapSchema();
    this.state.coins = new MapSchema();
    this.coinSeq = 0;
    this.chatLog = new Map();
    this.lastEmoteAt = new Map();

    this.isWalkable = makeIsWalkable(this.area === "plaza");
    this.randomFloorPoint = makeRandomFloorPoint(this.isWalkable);

    for (let i = 0; i < COIN_COUNT; i++) this.spawnCoin();
    liveRooms.add(this);
    console.log(`[sala:${this.area}] creada`);

    const isAdmin = (client) => isAdminKey(client.auth?.key);
    const give = (p, key, n) => {
      p.score += n;
      const u = users[key];
      if (u) { u.coins = p.score; saveUsers(); }
    };
    const eachPlayer = (fn) => {
      for (const c of this.clients) {
        const p = this.state.players.get(c.sessionId);
        if (p) fn(p, c);
      }
    };

    // --- Panel de Host ---
    this.onMessage("admin:announce", (client, data) => {
      if (!isAdmin(client)) return;
      const text = String(data?.text || "").trim().slice(0, 140);
      if (!text) return;
      globalBroadcast("announce", { text });
    });

    // ============ 🌧️ LLUVIA DE MASTER COINS ============
    this.onMessage("admin:rain", (client) => {
      if (!isAdmin(client) || this.rainActive) return;
      this.rainActive = true;
      globalBroadcast("announce", {
        text: `🌧️ ¡LLUVIA DE MASTER COINS en ${ROOM_NAMES[this.area]}! ¡Corre a atraparlas!`,
      });
      let ticks = 0;
      const iv = this.clock.setInterval(() => {
        ticks++;
        if (this.state.coins.size < 18) this.spawnCoin();
        if (ticks >= 16) { iv.clear(); this.rainActive = false; }
      }, 700);
    });

    // ============ ⚡ QUIZ SPARK ============
    this.onMessage("admin:quiz", (client, data) => {
      if (!isAdmin(client) || this.quiz) return;
      const q = String(data?.q || "").trim().slice(0, 140);
      const opts = Array.isArray(data?.opts) ? data.opts.map((o) => String(o || "").trim().slice(0, 40)) : [];
      const correct = Number(data?.correct);
      if (!q || opts.length !== 4 || opts.some((o) => !o) || !(correct >= 0 && correct <= 3)) return;
      this.quiz = { correct };
      this.broadcast("quiz-start", { q, opts, seconds: 20 });
      this.clock.setTimeout(() => {
        if (!this.quiz) return;
        const winners = [];
        eachPlayer((p, c) => {
          const zone = (p.x >= FLOOR_CX ? 1 : 0) + (p.y >= FLOOR_CY ? 2 : 0);
          if (zone === this.quiz.correct) {
            winners.push(p.name);
            give(p, c.auth?.key, 3);
          }
        });
        this.broadcast("quiz-end", { correct: this.quiz.correct, winners });
        this.quiz = null;
      }, 20000);
    });

    // ============ 🤖 ROBI DICE ============
    const EMOTE_LIST = ["dance", "laugh", "wave", "heart", "party"];
    const simonRound = () => {
      if (!this.simon) return;
      this.simon.round++;
      this.simon.current = EMOTE_LIST[Math.floor(Math.random() * EMOTE_LIST.length)];
      this.simon.done = new Set();
      this.broadcast("simon", { type: this.simon.current, seconds: 6, round: this.simon.round });
      this.clock.setTimeout(() => {
        if (!this.simon) return;
        const out = [];
        for (const id of [...this.simon.alive]) {
          if (!this.simon.done.has(id)) {
            this.simon.alive.delete(id);
            const p = this.state.players.get(id);
            if (p) out.push(p.name);
          }
        }
        this.simon.current = null;
        const aliveNames = [...this.simon.alive]
          .map((id) => this.state.players.get(id)?.name).filter(Boolean);
        this.broadcast("simon-out", { out, alive: aliveNames });
        if (this.simon.alive.size <= 2 || this.simon.round >= 6) {
          const winners = [];
          eachPlayer((p, c) => {
            if (this.simon.alive.has(c.sessionId)) {
              winners.push(p.name);
              give(p, c.auth?.key, 5);
            }
          });
          this.broadcast("simon-end", { winners });
          this.simon = null;
        } else {
          this.clock.setTimeout(simonRound, 2600);
        }
      }, 6600);
    };
    this.onMessage("admin:simon", (client) => {
      if (!isAdmin(client) || this.simon) return;
      this.simon = { alive: new Set(this.clients.map((c) => c.sessionId)), round: 0, current: null, done: new Set() };
      this.broadcast("announce", { text: "🤖 ¡ROBI DICE! Haz el emote que ordene Robi antes de que acabe el tiempo. Los lentos quedan fuera." });
      this.clock.setTimeout(simonRound, 2500);
    });

    // ============ 🔥 PISO CALIENTE ============
    const hotRound = () => {
      if (!this.hot) return;
      this.hot.round++;
      const count = Math.max(1, 4 - (this.hot.round - 1));
      const zones = [];
      for (let i = 0; i < count; i++) {
        const pt = this.randomFloorPoint();
        zones.push({ x: pt.x, y: pt.y, r: 150 });
      }
      this.hot.zones = zones;
      this.broadcast("hot-round", { zones, seconds: 6, round: this.hot.round });
      this.clock.setTimeout(() => {
        if (!this.hot) return;
        const out = [];
        for (const id of [...this.hot.alive]) {
          const p = this.state.players.get(id);
          const safe = p && this.hot.zones.some((z) => Math.hypot(p.x - z.x, p.y - z.y) <= z.r);
          if (!safe) {
            this.hot.alive.delete(id);
            if (p) out.push(p.name);
          }
        }
        const aliveNames = [...this.hot.alive]
          .map((id) => this.state.players.get(id)?.name).filter(Boolean);
        this.broadcast("hot-out", { out, alive: aliveNames });
        if (this.hot.alive.size <= 2 || this.hot.round >= 4) {
          const winners = [];
          eachPlayer((p, c) => {
            if (this.hot.alive.has(c.sessionId)) {
              winners.push(p.name);
              give(p, c.auth?.key, 5);
            }
          });
          this.broadcast("hot-end", { winners });
          this.hot = null;
        } else {
          this.clock.setTimeout(hotRound, 3000);
        }
      }, 6600);
    };
    this.onMessage("admin:hotfloor", (client) => {
      if (!isAdmin(client) || this.hot) return;
      this.hot = { alive: new Set(this.clients.map((c) => c.sessionId)), round: 0, zones: [] };
      this.broadcast("announce", { text: "🔥 ¡PISO CALIENTE! Cuando aparezcan las zonas seguras, corre a una antes del conteo. Cada ronda hay menos." });
      this.clock.setTimeout(hotRound, 2500);
    });

    // ============ 🎨 ADIVINA EL PROMPT ============
    const normalize = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    this.onMessage("admin:guess", (client, data) => {
      if (!isAdmin(client) || this.guess) return;
      const img = String(data?.img || "").trim();
      const answer = String(data?.answer || "").trim().slice(0, 60);
      const prize = Math.max(1, Math.min(20, Number(data?.prize) || 5));
      if (!/^https:\/\//.test(img) || answer.length < 2) return;
      this.guess = { answer: normalize(answer), prize };
      this.broadcast("guess-start", { img, seconds: 60, prize });
      this.clock.setTimeout(() => {
        if (!this.guess) return;
        this.broadcast("guess-end", { winner: null, answer });
        this.guess = null;
      }, 60000);
    });

    this.onMessage("admin:hunt", (client, data) => {
      if (!isAdmin(client)) return;
      const area = ROOM_IDS.includes(data?.area) ? data.area : null;
      const prize = Math.max(1, Math.min(25, Number(data?.prize) || 10));
      if (!area || hunt.active) return;
      const walk = makeIsWalkable(area === "plaza");
      const spot = makeRandomFloorPoint(walk)();
      hunt.active = true;
      hunt.area = area;
      hunt.x = spot.x;
      hunt.y = spot.y;
      hunt.prize = prize;
      globalBroadcast("announce", {
        text: `🔎 ¡BÚSQUEDA DEL TESORO! Una Chispa Dorada de ${prize} Master Coins está escondida en el campus…`,
      });
      for (const r of liveRooms) {
        if (r.area === area) r.broadcast("hunt-spawn", { x: hunt.x, y: hunt.y, prize });
      }
      console.log(`[hunt] escondida en ${area} (${spot.x | 0},${spot.y | 0}) premio ${prize}`);
    });

    this.onMessage("admin:session-start", (client) => {
      if (!isAdmin(client)) return;
      if (session.active) return;
      session.active = true;
      session.startedAt = new Date().toISOString();
      session.baseline = {};
      session.participants = {};
      // Inscribir a todos los conectados ahora mismo
      for (const r of liveRooms) {
        r.clients.forEach((c) => { if (c.auth?.key) sessionJoin(c.auth.key); });
      }
      globalBroadcast("announce", {
        text: "🏁 ¡SESIÓN DE EVENTO INICIADA! Todas las Master Coins que ganes desde ahora cuentan para el marcador final.",
      });
      globalBroadcast("session", { active: true });
      console.log("[sesion] iniciada");
    });

    this.onMessage("admin:session-end", (client) => {
      if (!isAdmin(client)) return;
      if (!session.active) return;
      const rows = sessionResults();
      saveSessionLog(rows);
      session.active = false;
      globalBroadcast("session", { active: false });
      globalBroadcast("leaderboard", { rows: rows.slice(0, 20) });
      console.log("[sesion] cerrada:", rows.map((r) => `${r.name}:${r.earned}`).join(" "));
    });

    this.onMessage("admin:hunt-cancel", (client) => {
      if (!isAdmin(client) || !hunt.active) return;
      hunt.active = false;
      globalBroadcast("hunt-despawn", {});
      globalBroadcast("announce", { text: "La Búsqueda del Tesoro fue cancelada." });
    });

    // Token de voz LiveKit: identidad = nombre de la cuenta, sala = voz-<area>
    this.onMessage("voice-token", async (client) => {
      if (!VOICE_ENABLED) {
        client.send("voice-token", { disabled: true });
        return;
      }
      try {
        const u = users[client.auth?.key];
        const at = new AccessToken(LK_KEY, LK_SECRET, {
          identity: u?.name || client.sessionId,
          ttl: "3h",
        });
        at.addGrant({
          roomJoin: true,
          room: `voz-${this.area}`,
          canPublish: true,
          canSubscribe: true,
        });
        client.send("voice-token", { url: LK_URL, token: await at.toJwt() });
      } catch (e) {
        console.error("[voz] error generando token:", e.message);
        client.send("voice-token", { disabled: true });
      }
    });

    // El cliente pregunta al terminar de montar su escena (evita la
    // carrera de mensajes enviados durante el join).
    this.onMessage("hunt-query", (client) => {
      if (hunt.active && hunt.area === this.area) {
        client.send("hunt-spawn", { x: hunt.x, y: hunt.y, prize: hunt.prize });
      }
      if (session.active) client.send("session", { active: true });
    });

    this.onMessage("hunt-claim", (client) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !hunt.active || hunt.area !== this.area) return;
      if (Math.hypot(p.x - hunt.x, p.y - hunt.y) > 95) return;
      hunt.active = false;
      p.score += hunt.prize;
      const u = users[client.auth?.key];
      if (u) { u.coins = p.score; saveUsers(); }
      globalBroadcast("hunt-despawn", {});
      globalBroadcast("announce", {
        text: `🏆 ¡${p.name} encontró la Chispa Dorada en ${ROOM_NAMES[this.area]}! +${hunt.prize} Master Coins`,
      });
      console.log(`[hunt] encontrada por ${p.name} (+${hunt.prize})`);
    });

    this.onMessage("move", (client, data) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || typeof data !== "object") return;
      const x = Number(data.x), y = Number(data.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (!this.isWalkable(x, y)) return;
      p.x = x;
      p.y = y;
      p.flip = !!data.flip;
      p.moving = !!data.moving;
      p.sit = -1;
      if (data.dir === "up" || data.dir === "down" || data.dir === "side") p.dir = data.dir;
    });

    this.onMessage("sit", (client, data) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const seat = Number(data?.seat);
      if (!Number.isInteger(seat) || seat < -1 || seat >= MAX_SEATS) return;
      p.sit = seat;
      p.moving = false;
    });

    this.onMessage("emote", (client, data) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !EMOTES.includes(data?.type)) return;
      const now = Date.now();
      if (now - (this.lastEmoteAt.get(client.sessionId) || 0) < EMOTE_COOLDOWN_MS) return;
      this.lastEmoteAt.set(client.sessionId, now);
      if (this.simon?.current && data.type === this.simon.current &&
          this.simon.alive.has(client.sessionId)) {
        this.simon.done.add(client.sessionId);
      }
      this.broadcast("emote", { id: client.sessionId, type: data.type });
    });

    this.onMessage("avatar", (client, data) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !data || !AVATARS.includes(data.avatar)) return;
      p.avatar = data.avatar;
      const u = users[client.auth?.key];
      if (u) { u.avatar = data.avatar; saveUsers(); }
    });

    this.onMessage("collect", (client, data) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !data || typeof data.id !== "string") return;
      const coin = this.state.coins.get(data.id);
      if (!coin) return;
      if (Math.hypot(coin.x - p.x, coin.y - p.y) > PICKUP_DIST + 40) return;
      this.state.coins.delete(data.id);
      p.score += 1;
      const u = users[client.auth?.key];
      if (u) { u.coins = p.score; saveUsers(); }
      this.broadcast("collected", { id: data.id, by: client.sessionId });
      this.clock.setTimeout(() => this.spawnCoin(), 30000 + Math.random() * 45000);
    });

    this.onMessage("chat", (client, data) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !data || typeof data.text !== "string") return;
      const text = data.text.trim().slice(0, CHAT_MAX_LEN);
      if (!text) return;

      const now = Date.now();
      let log = this.chatLog.get(client.sessionId);
      if (!log) { log = { times: [], last: "" }; this.chatLog.set(client.sessionId, log); }
      log.times = log.times.filter((t) => now - t < CHAT_WINDOW_MS);

      if (log.times.length >= CHAT_WINDOW_MAX) {
        client.send("chat-blocked", { reason: "Vas muy rápido: espera unos segundos ✋" });
        return;
      }
      if (text === log.last) {
        client.send("chat-blocked", { reason: "No repitas el mismo mensaje 🙃" });
        return;
      }
      log.times.push(now);
      log.last = text;
      this.broadcast("chat", { id: client.sessionId, text });

      if (this.guess) {
        const norm = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (norm.includes(this.guess.answer)) {
          const key = client.auth?.key;
          const prize = this.guess.prize;
          this.guess = null;
          const gp = this.state.players.get(client.sessionId);
          if (gp) {
            give(gp, key, prize);
            this.broadcast("guess-end", { winner: gp.name, answer: gp.name + " acertó" });
            globalBroadcast("announce", { text: `🎨 ¡${gp.name} adivinó el prompt y ganó Master Coins!` });
          }
        }
      }
    });
  }

  spawnCoin() {
    const { x, y } = this.randomFloorPoint();
    const coin = new Coin();
    coin.x = x;
    coin.y = y;
    this.state.coins.set(`c${this.coinSeq++}`, coin);
  }

  onJoin(client) {
    const u = users[client.auth?.key] || {};
    const p = new Player();
    p.name = u.name || "Científic@";
    p.avatar = AVATARS.includes(u.avatar) ? u.avatar : "kai";
    const spawn = this.randomFloorPoint();
    p.x = spawn.x;
    p.y = spawn.y;
    p.flip = false;
    p.moving = false;
    p.dir = "down";
    p.sit = -1;
    p.score = u.coins || 0;
    p.admin = isAdminKey(client.auth?.key);
    this.state.players.set(client.sessionId, p);
    if (hunt.active && hunt.area === this.area) {
      client.send("hunt-spawn", { x: hunt.x, y: hunt.y, prize: hunt.prize });
    }
    if (session.active) {
      sessionJoin(client.auth?.key);
      client.send("session", { active: true });
    }
    console.log(`[sala:${this.area}] + ${p.name} (${p.avatar}) — ${this.state.players.size}`);
  }

  onDispose() {
    liveRooms.delete(this);
  }

  onLeave(client) {
    const p = this.state.players.get(client.sessionId);
    const u = users[client.auth?.key];
    if (p && u) { u.coins = p.score; saveUsers(); }
    if (client.auth?.key && onlineUsers.get(client.auth.key) === client.sessionId) {
      onlineUsers.delete(client.auth.key);
    }
    this.state.players.delete(client.sessionId);
    this.chatLog.delete(client.sessionId);
    this.lastEmoteAt.delete(client.sessionId);
    console.log(`[sala:${this.area}] - ${client.sessionId} — ${this.state.players.size}`);
  }
}

// ---------- Servidor de archivos estáticos (el juego mismo) ----------
const STATIC_ROOT = path.join(__dirname, "..");
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "application/javascript",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".json": "application/json", ".webp": "image/webp",
};

function serveStatic(req, res) {
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = path.normalize(path.join(STATIC_ROOT, urlPath));
  if (!filePath.startsWith(STATIC_ROOT) || filePath.includes("server")) {
    res.writeHead(403); res.end(); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("404"); return; }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": filePath.endsWith(".html") ? "no-cache" : "public, max-age=86400",
    });
    res.end(data);
  });
}

const port = Number(process.env.PORT) || 2567;
const gameServer = new Server({ server: http.createServer(serveStatic) });
gameServer.define("sala", SalaRoom).filterBy(["area"]);
gameServer.listen(port).then(() => {
  console.log(`🧪✦ Servidor Campus Master Lab IA (9 salas) en ws://0.0.0.0:${port}`);
});
