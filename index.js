const TOKEN = process.env.BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;

async function sendMessage(chatId, text) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text
    })
  });
}

module.exports = async (req, res) => {
  try {
    const body = req.body;

    if (!body.message) {
      return res.status(200).end();
    }

    const chatId = body.message.chat.id;
    const userText = body.message.text;

    // 🧠 Gemini call
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are a chill crypto + trading assistant.
Give short, clear, realistic analysis (not financial advice).
Question: ${userText}`
                }
              ]
            }
          ]
        }),
      }
    );

    const data = await response.json();

    let reply = "No response";

    if (data.candidates && data.candidates.length > 0) {
      const parts = data.candidates[0].content?.parts;
      if (parts) {
        reply = parts.map(p => p.text || "").join(" ");
      }
    }

    await sendMessage(chatId, reply);

    return res.status(200).end();

  } catch (err) {
    console.error(err);
    return res.status(200).end();
  }
};
