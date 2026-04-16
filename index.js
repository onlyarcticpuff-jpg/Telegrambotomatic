const http = require("http");

const TOKEN = process.env.BOT_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;

// 🧠 memory
const memory = {};

// send message
async function sendMessage(chatId, text) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

// 🌐 Tavily search
async function searchWeb(query) {
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query,
        search_depth: "basic",
        max_results: 3
      })
    });

    const data = await res.json();

    return data.results
      ?.map(r => `- ${r.title}: ${r.content}`)
      .join("\n") || "";
  } catch (e) {
    return "";
  }
}

// 🧠 decide if search is needed
function shouldSearch(text) {
  return /price|news|why|what happened|update|current/i.test(text);
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(200);
    return res.end("OK");
  }

  try {
    let body = "";
    for await (const chunk of req) body += chunk;

    const data = JSON.parse(body || "{}");

    const chatId = data?.message?.chat?.id;
    let userText = data?.message?.text || "";
    let imageUrl = null;

    if (!chatId) {
      res.writeHead(200);
      return res.end();
    }

    // ignore commands
    if (userText.startsWith("/")) {
      res.writeHead(200);
      return res.end();
    }

    // 🖼️ image handling
    if (data?.message?.photo) {
      const photo = data.message.photo.pop();
      const fileRes = await fetch(
        `${TELEGRAM_API}/getFile?file_id=${photo.file_id}`
      );
      const fileData = await fileRes.json();
      const filePath = fileData.result.file_path;

      imageUrl = `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;

      if (!userText) userText = "React to this image";
    }

    if (!userText && !imageUrl) {
      await sendMessage(chatId, "say something bro 😭");
      res.writeHead(200);
      return res.end();
    }

    // 🧠 memory (text only, avoid cursed image history)
    if (!memory[chatId]) memory[chatId] = [];

    if (!imageUrl) {
      memory[chatId].push(userText);
      memory[chatId] = memory[chatId].slice(-4);
    }

    const history = memory[chatId]?.join("\n") || "";

    // 🌐 optional web search
    let webContext = "";
    if (shouldSearch(userText)) {
      webContext = await searchWeb(userText);
    }

    // 🤖 OpenRouter request
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://telegrambot",
          "X-Title": "mr-prophet-bot"
        },
        body: JSON.stringify({
          model: "google/gemma-4-26b-a4b-it",
          messages: [
            {
              role: "system",
              content: `You are Mr Prophet 🎩.

You are a crypto trader ONLY when the topic is clearly about crypto or markets.

Otherwise, you're a funny, chill guy.

Keep responses short (1–2 sentences).

If unsure whether something is crypto-related → assume it's NOT.

Use web info if provided, but don’t mention "source" or "search".
use emojis and be funny guy

Recent context:
${history}

Web context:
${webContext}`
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
      }
    );

    if (!response.ok) {
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
  console.log("Mr Prophet 🎩 running on", PORT);
});
