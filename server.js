const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });

const rooms = {}; // roomId -> room

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function broadcast(room, obj) {
  [...room.players, ...room.spectators].forEach(c => {
    send(c.ws, obj);
  });
}

function roomInfo(room) {
  return {
    type: "roomInfo",
    players: room.players.map(p => ({
      id: p.id,
      ready: p.ready,
      isHost: p.isHost
    })),
    spectators: room.spectators.map(s => s.id),

    playerCount: room.players.length,
    spectatorCount: room.spectators.length,

    phase: room.phase,
    maxPlayers: room.maxPlayers
  };
}

function ensureHost(room) {
  if (!room.players.some(p => p.isHost) && room.players.length > 0) {
    room.players[0].isHost = true;
  }
}

wss.on("connection", ws => {
  ws.id = null;
  ws.roomId = null;

  ws.on("message", msg => {
    let data;
    try {
      data = JSON.parse(msg.toString());
    } catch {
      return;
    }

    // ===== ルーム作成 or 参加 =====
if (data.type === "join") {
  const roomId = data.roomId;
  const clientId = data.id;
  const isHost = data.isHost === true;

  // 参加側で room が無い
  if (!rooms[roomId] && !isHost) {
    send(ws, {
      type: "joinResult",
      success: false,
      reason: "room_not_found"
    });
    return;
  }

  // ホストなら作成
  if (!rooms[roomId]) {
    rooms[roomId] = {
      maxPlayers: 4,
      players: [],
      spectators: [],
      phase: "waiting"
    };
  }

  const room = rooms[roomId];

  // ★満員チェック
  if (room.players.length >= room.maxPlayers) {
    send(ws, {
      type: "joinResult",
      success: false,
      reason: "room_full"
    });
    return;
  }

  // ここまで来たら成功
  ws.id = clientId;
  ws.roomId = roomId;

  room.players.push({
    id: ws.id,
    ws,
    ready: false,
    isHost: room.players.length === 0
  });

  send(ws, {
    type: "joinResult",
    success: true
  });

  broadcast(room, roomInfo(room));
}

    // ===== 準備完了 =====
    if (data.type === "ready") {
      const room = rooms[ws.roomId];
      if (!room) return;

      const player = room.players.find(p => p.id === ws.id);
      if (player) {
        player.ready = true;
        broadcast(room, roomInfo(room));
      }
    }

    // ===== ゲーム開始（ホストのみ）=====
    if (data.type === "start") {
      const room = rooms[ws.roomId];
      if (!room) return;

      const player = room.players.find(p => p.id === ws.id);
      if (!player || !player.isHost) return;

      if (
        room.players.length >= 2 &&
        room.players.every(p => p.ready || p.isHost)
      ) {
        room.phase = "playing";
        broadcast(room, { type: "gameStart" });
      }
    }

    // ===== 役割変更 =====
    if (data.type === "changeRole") {
      const room = rooms[ws.roomId];
      if (!room || room.phase !== "waiting") return;

      room.players = room.players.filter(p => p.id !== ws.id);
      room.spectators = room.spectators.filter(s => s.id !== ws.id);

      if (data.to === "player" && room.players.length < room.maxPlayers) {
        room.players.push({
          id: ws.id,
          ws,
          ready: false,
          isHost: false
        });
      } else {
        room.spectators.push({ id: ws.id, ws });
      }

      ensureHost(room);
      broadcast(room, roomInfo(room));
    }
  });

  ws.on("close", () => {
    const room = rooms[ws.roomId];
    if (!room) return;

    room.players = room.players.filter(p => p.id !== ws.id);
    room.spectators = room.spectators.filter(s => s.id !== ws.id);

    if (room.players.length === 0 && room.spectators.length === 0) {
      delete rooms[ws.roomId];
      return;
    }

    ensureHost(room);
    broadcast(room, roomInfo(room));
  });
});

console.log("WebSocket server started on port " + PORT);
