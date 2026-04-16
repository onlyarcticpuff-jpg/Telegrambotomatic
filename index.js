const http = require("http");

const TOKEN = process.env.BOT_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;

const memory = {};

// 🧠 coin map (STACKED)
const coins = {
  btc: "bitcoin", bitcoin: "bitcoin",
  eth: "ethereum", ethereum: "ethereum",
  sol: "solana", solana: "solana",
  ltc: "litecoin", litecoin: "litecoin",
  trx: "tron", tron: "tron",
  ton: "the-open-network", toncoin: "the-open-network",
  pol: "matic-network", matic: "matic-network",
  doge: "dogecoin",
  xrp: "ripple",
  ada: "cardano",
  bnb: "binancecoin",
  avax: "avalanche-2"
};

// 📊 detect coin (FIXED)
function detectCoin(text) {
  const lower = text.toLowerCase();
  for (const key in coins) {
    if (new RegExp(`\\b${key}\\b`).test(lower)) {
      return coins[key];
    }
  }
  return null;
}

// 📊 CoinGecko
async function getCryptoData(id) {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`
    );
    const data = await res.json();

    return {
      price: data[id]?.usd,
      change: data[id]?.usd_24h_change
    };
  } catch {
    return null;
  }
}

// 🌐 Tavily
async function searchWeb(query) {
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query,
        max_results: 2
      })
    });

    const data = await res.json();

    return data.results
      ?.map(r => `- ${r.title}: ${r.content}`)
      .join("\n") || "";
  } catch {
    return "";
  }
}

// 👛 wallet detect
function detectWallet(text) {
  return text.match(/[13][a-km-zA-HJ-NP-Z1-9]{25,34}/) ||
         text.match(/^0x[a-fA-F0-9]{40}$/);
}

// 👛 wallet tracker
async function trackWallet(address) {
  try {
    if (address.startsWith("0x")) {
      const res = await fetch(`https://api.ethplorer.io/getAddressInfo/${address}?apiKey=freekey`);
      const data = await res.json();
      return `ETH balance: ${data.ETH?.balance || 0}`;
    }

    if (address.startsWith("1") || address.startsWith("3")) {
      const res = await fetch(`https://blockchain.info/q/addressbalance/${address}`);
      const sat = await res.text();
      return `BTC balance: ${(sat / 1e8).toFixed(4)}`;
    }

    return "wallet tracking limited";
  } catch {
    return "wallet error 💀";
  }
}

// 📩 send
async function sendMessage(chatId, text) {
  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
  return res.json();
}

// ✏️ edit
async function editMessage(chatId, messageId, text) {
  await fetch(`${TELEGRAM_API}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text
    })
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST") return res.end("OK");

  try {
    let body = "";
    for await (const chunk of req) body += chunk;

    const data = JSON.parse(body || {});
    const chatId = data?.message?.chat?.id;
    let userText = data?.message?.text || "";

    if (!chatId) return res.end();

    // 🧠 memory
    if (!memory[chatId]) memory[chatId] = [];
    memory[chatId].push(userText);
    memory[chatId] = memory[chatId].slice(-5);

    const history = memory[chatId].join("\n");

    // 👛 wallet
    const wallet = detectWallet(userText);
    if (wallet) {
      const msg = await sendMessage(chatId, "Scanning wallet 👛...");
      const result = await trackWallet(wallet[0]);
      await editMessage(chatId, msg.result.message_id, result);
      return res.end();
    }

    // 📊 coin
    let priceContext = "";
    const coinId = detectCoin(userText);

    if (coinId) {
      const data = await getCryptoData(coinId);
      if (data?.price) {
        priceContext = `${coinId}: $${data.price} (${data.change?.toFixed(2)}%)`;
      }
    }

    // 🌐 search
    let webContext = "";
    const needsSearch = /why|news|happening|update|explain|reason|cause/i.test(userText);

    let loadingMsg;

    if (needsSearch) {
      loadingMsg = await sendMessage(chatId, "🔍 Searching...");
      webContext = await searchWeb(userText);
    }

    // 🤖 AI
    const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "google/gemma-4-31b-it",
        messages: [
          {
            role: "system",
            content: `You are Mr Prophet 🎩.

You act, you don't ask.

- If coin mentioned → use price
- If web context exists → use it
- NEVER ask for data
- NEVER say you can't search

Crypto = confident trader  
Other = chill  

Short replies only.

History:
${history}

Price:
${priceContext}

Web:
${webContext}`
          },
          {
            role: "user",
            content: userText
          }
        ]
      })
    });

    const result = await aiRes.json();
    const reply = result?.choices?.[0]?.message?.content || "no response 💀";

    // ✏️ edit or send
    if (loadingMsg) {
      await editMessage(chatId, loadingMsg.result.message_id, reply);
    } else {
      await sendMessage(chatId, reply);
    }

  } catch (e) {
    console.log(e);
  }

  res.end();
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Mr Prophet 🎩 running");
});
