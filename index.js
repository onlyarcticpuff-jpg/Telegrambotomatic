const http = require("http");

const TOKEN = process.env.BOT_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

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
    // ✅ parse body manually
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
      await sendMessage(chatId, "Say something bro 😭");
      res.writeHead(200);
      return res.end();
    }

    // 🔥 OpenRouter request
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b:free",
        messages: [
{
  role: "system",
  content: `You are a chill crypto bro who trades.

Talk casually like you're texting a friend.
No definitions. No history lessons.

Give short, real takes like a trader:
- what you think is happening
- what might happen next
- any risk if relevant

Be a bit degen, confident, and natural.
No structured formats, no bullet points.

Sound human, not like an analyst.`
},
{
  role: "user",
  content: userText
}
]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("OpenRouter error:", err);
      await sendMessage(chatId, "API error 💀");
      res.writeHead(200);
      return res.end();
    }

    const result = await response.json();

    let reply =
      result?.choices?.[0]?.message?.content || "No response";

    if (!reply || reply.length < 2) {
      reply = "Try again bro 😤";
    }

    await sendMessage(chatId, reply);

  } catch (err) {
    console.error("SERVER ERROR:", err);
  }

  res.writeHead(200);
  res.end();
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Bot running on port", PORT);
});
