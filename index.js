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

  let body = "";
  for await (const chunk of req) {
    body += chunk;
  }

  const data = JSON.parse(body || "{}");

  if (!data.message) {
    res.writeHead(200);
    return res.end();
  }

  const chatId = data.message.chat.id;
  const userText = data.message.text;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: `Answer clearly:\n${userText}` }
              ]
            }
          ]
        })
      }
    );

    const gemini = await response.json();

    let reply = "No response";

    if (gemini.candidates?.length) {
      reply = gemini.candidates[0].content?.parts?.map(p => p.text).join(" ");
    }

    await sendMessage(chatId, reply);

  } catch (e) {
    console.error(e);
  }

  res.writeHead(200);
  res.end();
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Bot running on port", PORT);
});
