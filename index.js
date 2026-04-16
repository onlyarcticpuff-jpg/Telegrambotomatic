const http = require("http");

const TOKEN = process.env.BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;

async function sendMessage(chatId, text) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text
    })
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(200);
    return res.end("OK");
  }

  try {
    // ✅ FIX: manual body parsing
    let body = "";
    for await (const chunk of req) {
      body += chunk;
    }

    const data = JSON.parse(body || "{}");

    const chatId = data?.message?.chat?.id;
    const userText = data?.message?.text;

    if (!chatId) {
      res.writeHead(200);
      return res.end();
    }

    if (!userText) {
      await sendMessage(chatId, "Send a text message bro 😭");
      res.writeHead(200);
      return res.end();
    }

    // ✅ Gemini request
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Give a short, clear answer:\n${userText}`
                }
              ]
            }
          ]
        })
      }
    );

    // ✅ Handle API errors properly
    if (!response.ok) {
      const err = await response.text();
      console.error("Gemini error:", err);
      await sendMessage(chatId, "API error 💀 try again later");
      res.writeHead(200);
      return res.end();
    }

    const gemini = await response.json();

    let reply = "No response";

    if (gemini?.candidates?.length) {
      const parts = gemini.candidates[0].content?.parts;
      if (parts?.length) {
        reply = parts.map(p => p.text || "").join(" ");
      }
    }

    if (!reply || reply.length < 2) {
      reply = "Try again bro 😤";
    }

    await sendMessage(chatId, reply);

  } catch (err) {
    console.error("SERVER CRASH:", err);
  }

  res.writeHead(200);
  res.end();
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Bot running on port", PORT);
});
