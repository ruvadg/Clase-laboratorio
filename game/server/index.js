/* ============================================================
   Campus Master Lab IA — Servidor multijugador (Fase 2)
   Colyseus: sala "plaza" con jugadores, monedas del servidor
   y chat retransmitido (la proximidad se filtra en el cliente).
   ============================================================ */

const http = require("http");
const { Server, Room } = require("colyseus");
const { Schema, MapSchema, defineTypes } = require("@colyseus/schema");

// --- Geometría de la plaza (espejo del cliente) ---
const FLOOR_CX = 950, FLOOR_CY = 610, FLOOR_RX = 590, FLOOR_RY = 370;
const FOUNTAIN = { x: 945, y: 575, r: 185 };

function isWalkable(x, y) {
  const dx = (x - FLOOR_CX) / FLOOR_RX;
  const dy = (y - FLOOR_CY) / FLOOR_RY;
  if (dx * dx + dy * dy > 1) return false;
  return Math.hypot(x - FOUNTAIN.x, y - FOUNTAIN.y) > FOUNTAIN.r;
}

function randomFloorPoint() {
  for (let i = 0; i < 200; i++) {
    const x = FLOOR_CX - FLOOR_RX + Math.random() * FLOOR_RX * 2;
    const y = FLOOR_CY - FLOOR_RY + Math.random() * FLOOR_RY * 2;
    if (isWalkable(x, y)) return { x, y };
  }
  return { x: 960, y: 880 };
}

// --- Estado sincronizado ---
class Player extends Schema {}
defineTypes(Player, {
  name: "string",
  x: "number",
  y: "number",
  flip: "boolean",
  moving: "boolean",
  score: "number",
});

class Coin extends Schema {}
defineTypes(Coin, { x: "number", y: "number" });

class PlazaState extends Schema {}
defineTypes(PlazaState, {
  players: { map: Player },
  coins: { map: Coin },
});

const COIN_COUNT = 8;
const PICKUP_DIST = 70;
const CHAT_MAX_LEN = 120;
const CHAT_COOLDOWN_MS = 800;

class PlazaRoom extends Room {
  onCreate() {
    this.maxClients = 40;
    this.setState(new PlazaState());
    this.state.players = new MapSchema();
    this.state.coins = new MapSchema();
    this.coinSeq = 0;
    this.lastChatAt = new Map();

    for (let i = 0; i < COIN_COUNT; i++) this.spawnCoin();

    // Movimiento: el cliente manda su posición; el server valida límites.
    this.onMessage("move", (client, data) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || typeof data !== "object") return;
      const x = Number(data.x), y = Number(data.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (!isWalkable(x, y)) return; // ignora posiciones ilegales
      p.x = x;
      p.y = y;
      p.flip = !!data.flip;
      p.moving = !!data.moving;
    });

    // Recolección de moneda: validada del lado servidor.
    this.onMessage("collect", (client, data) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !data || typeof data.id !== "string") return;
      const coin = this.state.coins.get(data.id);
      if (!coin) return;
      if (Math.hypot(coin.x - p.x, coin.y - p.y) > PICKUP_DIST + 40) return;
      this.state.coins.delete(data.id);
      p.score += 1;
      this.broadcast("collected", { id: data.id, by: client.sessionId });
      this.clock.setTimeout(() => this.spawnCoin(), 1500);
    });

    // Chat: retransmite a todos; cada cliente filtra por proximidad.
    this.onMessage("chat", (client, data) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !data || typeof data.text !== "string") return;
      const now = Date.now();
      if (now - (this.lastChatAt.get(client.sessionId) || 0) < CHAT_COOLDOWN_MS) return;
      this.lastChatAt.set(client.sessionId, now);
      const text = data.text.trim().slice(0, CHAT_MAX_LEN);
      if (!text) return;
      this.broadcast("chat", { id: client.sessionId, text });
    });
  }

  spawnCoin() {
    const { x, y } = randomFloorPoint();
    const coin = new Coin();
    coin.x = x;
    coin.y = y;
    this.state.coins.set(`c${this.coinSeq++}`, coin);
  }

  onJoin(client, options) {
    const p = new Player();
    const name = (options && typeof options.name === "string" ? options.name : "")
      .trim().slice(0, 14) || "Científic@";
    p.name = name;
    const spawn = randomFloorPoint();
    p.x = spawn.x;
    p.y = spawn.y;
    p.flip = false;
    p.moving = false;
    p.score = 0;
    this.state.players.set(client.sessionId, p);
    console.log(`+ ${name} (${client.sessionId}) — ${this.state.players.size} en la plaza`);
  }

  onLeave(client) {
    this.state.players.delete(client.sessionId);
    this.lastChatAt.delete(client.sessionId);
    console.log(`- ${client.sessionId} — ${this.state.players.size} en la plaza`);
  }
}

const port = Number(process.env.PORT) || 2567;
const gameServer = new Server({ server: http.createServer() });
gameServer.define("plaza", PlazaRoom);
gameServer.listen(port).then(() => {
  console.log(`🧪✦ Servidor Campus Master Lab IA escuchando en ws://0.0.0.0:${port}`);
});
