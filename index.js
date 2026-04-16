const http = require("http");

const TOKEN = process.env.BOT_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;

const memory = {};

// 🧠 coin mapping (you can extend anytime)
const coins = {
  btc: "bitcoin",
  bitcoin: "bitcoin",
  eth: "ethereum",
  ethereum: "ethereum",
  sol: "solana",
  solana: "solana",
  ltc: "litecoin",
  litecoin: "litecoin",
  trx: "tron",
  tron: "tron",
  pol: "matic-network",
  matic: "matic-network",
  doge: "dogecoin",
  xrp: "ripple",
  ada: "cardano",
  bnb: "binancecoin",
  avax: "avalanche-2"
};

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

// 🧠 detect coin
function detectCoin(text) {
  const lower = text.toLowerCase();
  return Object.keys(coins).find(c => lower.includes(c));
}

// 🧠 wallet detect (very basic)
function detectWallet(text) {
  return text.match(/[13][a-km-zA-HJ-NP-Z1-9]{25,34}/) || // BTC
         text.match(/^0x[a-fA-F0-9]{40}$/) || // ETH
         text.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/); // SOL/LTC-ish
}

// 💰 wallet tracker (no API key)
async function trackWallet(address) {
  try {
    // ETH (Etherscan public)
    if (address.startsWith("0x")) {
      const res = await fetch(
        `https://api.ethplorer.io/getAddressInfo/${address}?apiKey=freekey`
      );
      const data = await res.json();
      return `ETH wallet balance: ${data.ETH?.balance || 0}`;
    }

    // BTC (blockchain.info)
    if (address.startsWith("1") || address.startsWith("3")) {
      const res = await fetch(
        `https://blockchain.info/q/addressbalance/${address}`
      );
      const sat = await res.text();
      return `BTC balance: ${(sat / 1e8).toFixed(4)}`;
    }

    return "wallet tracking limited for this chain";
  } catch {
    return "couldn't fetch wallet 💀";
  }
}

// 📩 send
async function sendMessage(chatId, text) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
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
    memory[chatId] = memory[chatId].slice(-4);

    const history = memory[chatId].join("\n");

    // 🔍 wallet tracking
    const wallet = detectWallet(userText);
    if (wallet) {
      const result = await trackWallet(wallet[0]);
      await sendMessage(chatId, result);
      return res.end();
    }

    // 📊 coin data
    let priceContext = "";
    const coinKey = detectCoin(userText);

    if (coinKey) {
      const data = await getCryptoData(coins[coinKey]);

      if (data?.price) {
        priceContext = `${coins[coinKey]}: $${data.price} (${data.change?.toFixed(2)}%)`;
      }
    }

    // 🌐 web search
    let webContext = "";
    if (!coinKey && /why|news|what|update/i.test(userText)) {
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
        model: "google/gemma-4-26b-a4b-it",
        messages: [
          {
            role: "system",
            content: `You are Mr Prophet 🎩.

You can:
- use price data if given (never guess)
- use web context if given
- react normally otherwise

Crypto = trader tone  
Other = chill human

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
    const reply =
      result?.choices?.[0]?.message?.content || "no response 💀";

    await sendMessage(chatId, reply);

  } catch (e) {
    console.log(e);
  }

  res.end();
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Mr Prophet 🎩 running");
});
