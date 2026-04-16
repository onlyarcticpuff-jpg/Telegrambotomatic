const http = require("http");

const TOKEN = process.env.BOT_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;

// 🧠 simple RAM memory
const memory = {};

// send message
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
    // ✅ parse body
    let body = "";
    for await (const chunk of req) {
      body += chunk;
    }

    const data = JSON.parse(body || "{}");

    const chatId = data?.message?.chat?.id;
    let userText = data?.message?.text || "";
    let imageUrl = null;

    if (!chatId) {
      res.writeHead(200);
      return res.end();
    }

    // ✅ ignore commands
    if (userText.startsWith("/")) {
      res.writeHead(200);
      return res.end();
    }

    // 🖼️ handle image
    if (data?.message?.photo) {
      const photo = data.message.photo.pop();
      const fileId = photo.file_id;

      const fileRes = await fetch(
        `${TELEGRAM_API}/getFile?file_id=${fileId}`
      );
      const fileData = await fileRes.json();

      const filePath = fileData.result.file_path;
      imageUrl = `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;

      if (!userText) userText = "Analyze this chart";
    }

    if (!userText && !imageUrl) {
      await sendMessage(chatId, "say something bro 😭");
      res.writeHead(200);
      return res.end();
    }

    // 🧠 memory handling
    if (!memory[chatId]) memory[chatId] = [];

    memory[chatId].push(userText);
    memory[chatId] = memory[chatId].slice(-5);

    const history = memory[chatId].join("\n");

    // 🔥 OpenRouter request (Gemma 4 9B)
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://telegrambot",
        "X-Title": "telegram-bot"
      },
      body: JSON.stringify({
        model: "google/gemma-4-26b-a4b-it",
        messages: [
          {
            role: "system",
            content: `You are a chill bro.

Talk casually like a real person.
No definitions. No textbook tone.

If image is provided → analyze it.

Use recent context if helpful:
${history}

Be short, realistic, and slightly confident.
If the message is NOT about crypto, trading, gambling, or markets:
respond like a normal funny guy.

DO NOT use trading analogies.
DO NOT force crypto language.
also use emojis but not alot just add a touch tk the messages and be funny`
          },
          {
            role: "user",
            content: imageUrl
              ? [
                  { type: "text", text: userText },
                  { type: "image_url", image_url: { url: imageUrl } }
                ]
              : userText
          }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("API ERROR:", err);
      await sendMessage(chatId, "api error 💀");
      res.writeHead(200);
      return res.end();
    }

    const result = await response.json();

    let reply =
      result?.choices?.[0]?.message?.content || "no response";

    if (!reply || reply.length < 2) {
      reply = "try again bro 😤";
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
