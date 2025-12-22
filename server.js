const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

let room = [];
let readySet = new Set();
let confirmSet = new Set();
let phase = "LOBBY"; // LOBBY, CONFIRM, PLAYING

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  room.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  });
}

wss.on("connection", ws => {
  if (room.length >= 4) {
    ws.send(JSON.stringify({ type: "error", message: "room full" }));
    ws.close();
    return;
  }

  room.push(ws);

  broadcast({
    type: "joined",
    playerCount: room.length
  });

  ws.on("message", msg => {
    const data = JSON.parse(msg.toString());

    // 準備OK
    if (data.type === "ready" && phase === "LOBBY") {
      readySet.add(ws);

      broadcast({
        type: "ready_update",
        readyCount: readySet.size,
        playerCount: room.length
      });

      // 全員準備OK → 確認フェーズへ
      if (readySet.size === room.length && room.length >= 2) {
        phase = "CONFIRM";
        confirmSet.clear();
        broadcast({ type: "confirm_request" });
      }
    }

    // 開始確認
    if (data.type === "confirm" && phase === "CONFIRM") {
      confirmSet.add(ws);

      broadcast({
        type: "confirm_update",
        confirmCount: confirmSet.size,
        playerCount: room.length
      });

      if (confirmSet.size === room.length) {
        phase = "PLAYING";
        broadcast({ type: "start" });
      }
    }
  });

  ws.on("close", () => {
    room = room.filter(p => p !== ws);
    readySet.delete(ws);
    confirmSet.delete(ws);

    phase = "LOBBY";

    broadcast({
      type: "left",
      playerCount: room.length
    });
  });
});

console.log("Room server started on port", PORT);
