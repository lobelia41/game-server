const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

// HTTPサーバー（Railwayが必須とする）
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("OK");
});

// WebSocket を HTTP サーバーに紐づける
const wss = new WebSocket.Server({ server });

wss.on("connection", ws => {
  console.log("client connected");

  ws.on("message", msg => {
    console.log("received:", msg.toString());
    ws.send("pong");
  });
});

server.listen(PORT, () => {
  console.log("Server listening on port " + PORT);
});
