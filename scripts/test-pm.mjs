import { WebSocket } from "ws";
const ws = new WebSocket("ws://127.0.0.1:18791/ws");
ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.method === "welcome") {
    console.log("[WELCOME]");
    ws.send(JSON.stringify({
      jsonrpc: "2.0",
      method: "router.chat",
      params: { message: "@pm hãy thực hiện gap analysis" },
      id: 1
    }));
  }
  if (msg.id === 1) {
    console.log("[RESULT]", JSON.stringify(msg, null, 2).substring(0, 800));
    ws.close();
  }
});
ws.on("close", () => process.exit(0));
setTimeout(() => { console.log("[TIMEOUT]"); process.exit(1); }, 90000);
