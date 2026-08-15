const express = require("express");
const axios = require("axios");
const qs = require("querystring");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;

// ----------------------------------------------------
// BASERA SERVER CONFIGURATION
// ----------------------------------------------------

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Load environment variables when present
require("dotenv").config();

const META_TOKEN = process.env.META_WHATSAPP_TOKEN || "";
const META_PHONE_ID = process.env.META_WHATSAPP_PHONE_ID || "";
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || "";
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";

// Load 120 housing listings
const homes = require("./basera-housing-120.json");

// ----------------------------------------------------
// HELPER FUNCTIONS
// ----------------------------------------------------

// Convert budget text into a number
// Supports:
// ₹5000
// Rs 5000
// 5000 rupees
// 5k
// 5 K
// 5,000
function extractBudget(text) {
  const clean = String(text || "")
    .toLowerCase()
    .replace(/,/g, "");

  // ₹5000 / rs 5000 / rupees 5000
  let match = clean.match(
    /(?:₹|rs\.?|rupees?)\s*(\d+(?:\.\d+)?)\s*(k)?/i
  );

  if (match) {
    let value = Number(match[1]);

    if (match[2]) {
      value *= 1000;
    }

    return value;
  }

  // 5k / 5.5k
  match = clean.match(/(\d+(?:\.\d+)?)\s*k\b/i);

  if (match) {
    return Number(match[1]) * 1000;
  }

  // "budget of 5000"
  match = clean.match(
    /(?:budget|under|below|within|upto|up to|maximum|max)\s*(?:of)?\s*(?:₹|rs\.?|rupees?)?\s*(\d+(?:\.\d+)?)/i
  );

  if (match) {
    return Number(match[1]);
  }

  return null;
}

// ----------------------------------------------------
// MINIMUM / MAXIMUM BUDGET
// ----------------------------------------------------

function extractBudgetRange(text) {
  const clean = String(text || "")
    .toLowerCase()
    .replace(/,/g, "");

  let maxBudget = null;
  let minBudget = null;

  const budgetPatterns = [
    /(?:under|below|less than|within|upto|up to|max(?:imum)?|budget(?:\s+of)?)\s*(?:₹|rs\.?|rupees?)?\s*(\d+(?:\.\d+)?)\s*(k)?/i,
    /(?:₹|rs\.?|rupees?)\s*(\d+(?:\.\d+)?)\s*(k)?/i,
    /(\d+(?:\.\d+)?)\s*(k)\s*(?:budget|rupees|rs)?/i
  ];

  for (const pattern of budgetPatterns) {
    const match = clean.match(pattern);
    if (match) {
      const value = Number(match[1]);
      const expanded = match[2] ? value * 1000 : value;
      if (!maxBudget) maxBudget = expanded;
      break;
    }
  }

  const minMatch = clean.match(
    /(?:above|over|more than|minimum|min)\s*(?:₹|rs\.?|rupees?)?\s*(\d+(?:\.\d+)?)\s*(k)?/i
  );

  if (minMatch) {
    minBudget = Number(minMatch[1]);
    if (minMatch[2]) minBudget *= 1000;
  }

  const betweenMatch = clean.match(
    /between\s*(?:₹|rs\.?|rupees?)?\s*(\d+(?:\.\d+)?)\s*(k)?\s*(?:and|to)\s*(?:₹|rs\.?|rupees?)?\s*(\d+(?:\.\d+)?)\s*(k)?/i
  );

  if (betweenMatch) {
    minBudget = Number(betweenMatch[1]) * (betweenMatch[2] ? 1000 : 1);
    maxBudget = Number(betweenMatch[3]) * (betweenMatch[4] ? 1000 : 1);
  }

  return { minBudget, maxBudget };
}

// ----------------------------------------------------
// PEOPLE / BED EXTRACTION
// ----------------------------------------------------

function extractPeople(text) {
  const clean = String(text || "").toLowerCase();

  const patterns = [
    /(?:for|with)\s*(\d+)\s*(?:people|persons|members|pax)/i,
    /(\d+)\s*(?:people|persons|members|pax)/i,
    /(\d+)\s*(?:bed|beds)/i,
    /(\d+)\s*(?:person|persons)/i
  ];

  for (const pattern of patterns) {
    const match = clean.match(pattern);

    if (match) {
      return Number(match[1]);
    }
  }

  return null;
}

// ----------------------------------------------------
// LOCATION EXTRACTION
// ----------------------------------------------------

function extractLocation(text) {
  const lower = String(text || "").toLowerCase();

  const locations = [
    ...new Set(homes.map(home => home.location))
  ];

  // Exact location matching
  for (const location of locations) {
    if (lower.includes(location.toLowerCase())) {
      return location;
    }
  }

  // Common location aliases
  const aliases = {
    saravanampatti: "Saravanampatti",
    saravanampatty: "Saravanampatti",

    sidco: "SIDCO Industrial Estate",
    "sidco industrial": "SIDCO Industrial Estate",

    gandhipuram: "Gandhipuram",

    peelamedu: "Peelamedu",

    singanallur: "Singanallur",

    ganapathy: "Ganapathy",

    kovaipudur: "Kovaipudur",
    kovaiputhur: "Kovaipudur",

    kurumbapalayam: "Kurumbapalayam",

    "saibaba colony": "Saibaba Colony",
    "sai baba colony": "Saibaba Colony",

    ukkadam: "Ukkadam",

    kuniyamuthur: "Kuniyamuthur",

    kalapatti: "Kalapatti"
  };

  for (const alias in aliases) {
    if (lower.includes(alias)) {
      return aliases[alias];
    }
  }

  return null;
}

// ----------------------------------------------------
// ROOM TYPE
// ----------------------------------------------------

function extractRoomType(text) {
  const lower = String(text || "").toLowerCase();

  if (
    /\b(private|single|individual|1bhk|1 bhk|personal)\b/.test(lower)
  ) {
    return "Private";
  }

  if (
    /\b(shared|sharing|roommates|roommate|hostel|pg|dorm|bed space)\b/.test(
      lower
    )
  ) {
    return "Shared";
  }

  return null;
}

// ----------------------------------------------------
// AMENITY EXTRACTION
// ----------------------------------------------------

function extractAmenities(text) {
  const lower = String(text || "").toLowerCase();

  const amenities = [];

  if (
    lower.includes("wifi") ||
    lower.includes("wi-fi") ||
    lower.includes("internet")
  ) {
    amenities.push("wifi");
  }

  if (
    lower.includes("water") ||
    lower.includes("drinking water")
  ) {
    amenities.push("water");
  }

  if (
    lower.includes("bathroom") ||
    lower.includes("toilet")
  ) {
    amenities.push("bathroom");
  }

  if (
    lower.includes("kitchen") ||
    lower.includes("cooking")
  ) {
    amenities.push("kitchen");
  }

  return amenities;
}

// ----------------------------------------------------
// SPECIAL SEARCH INTENT
// ----------------------------------------------------

function detectIntent(text) {
  const lower = String(text || "").toLowerCase();

  return {
    cheapest:
      lower.includes("cheap") ||
      lower.includes("cheapest") ||
      lower.includes("lowest rent") ||
      lower.includes("affordable"),

    safest:
      lower.includes("safe") ||
      lower.includes("safest") ||
      lower.includes("security") ||
      lower.includes("secure"),

    best:
      lower.includes("best") ||
      lower.includes("recommended") ||
      lower.includes("recommend"),

    verified:
      lower.includes("verified"),

    wifi:
      lower.includes("wifi") ||
      lower.includes("wi-fi") ||
      lower.includes("internet")
  };
}

// ----------------------------------------------------
// CHATBOT SEARCH
// ----------------------------------------------------

function searchHomes(message) {
  const text = String(message || "");

  const budgetRange = extractBudgetRange(text);

  const people = extractPeople(text);
  const location = extractLocation(text);
  const roomType = extractRoomType(text);
  const amenities = extractAmenities(text);
  const intent = detectIntent(text);

  let results = homes.filter(home => {
    // Location
    if (
      location &&
      home.location.toLowerCase() !== location.toLowerCase()
    ) {
      return false;
    }

    // Room type
    if (
      roomType &&
      home.roomType.toLowerCase() !== roomType.toLowerCase()
    ) {
      return false;
    }

    // Maximum budget
    if (
      budgetRange.maxBudget &&
      home.rent > budgetRange.maxBudget
    ) {
      return false;
    }

    // Minimum budget
    if (
      budgetRange.minBudget &&
      home.rent < budgetRange.minBudget
    ) {
      return false;
    }

    // Number of people
    if (
      people &&
      home.beds < people
    ) {
      return false;
    }

    // Amenities
    for (const amenity of amenities) {
      if (!home[amenity]) {
        return false;
      }
    }

    // Verified
    if (intent.verified && !home.verified) {
      return false;
    }

    return true;
  });

  // --------------------------------------------------
  // IF NOTHING FOUND
  // Relax budget slightly
  // --------------------------------------------------

  if (!results.length && budgetRange.maxBudget) {
    const relaxedBudget = budgetRange.maxBudget + 1000;

    results = homes.filter(home => {
      if (
        location &&
        home.location.toLowerCase() !== location.toLowerCase()
      ) {
        return false;
      }

      if (
        roomType &&
        home.roomType.toLowerCase() !== roomType.toLowerCase()
      ) {
        return false;
      }

      if (
        people &&
        home.beds < people
      ) {
        return false;
      }

      return home.rent <= relaxedBudget;
    });
  }

  // --------------------------------------------------
  // SORT RESULTS
  // --------------------------------------------------

  if (intent.cheapest) {
    results.sort((a, b) => a.rent - b.rent);
  } else if (intent.safest) {
    results.sort((a, b) => {
      if (b.safetyScore !== a.safetyScore) {
        return b.safetyScore - a.safetyScore;
      }

      return b.fairRentScore - a.fairRentScore;
    });
  } else {
    results.sort((a, b) => {
      const scoreA =
        a.fairRentScore +
        a.safetyScore +
        (a.verified ? 10 : 0) +
        (a.wifi ? 3 : 0);

      const scoreB =
        b.fairRentScore +
        b.safetyScore +
        (b.verified ? 10 : 0) +
        (b.wifi ? 3 : 0);

      return scoreB - scoreA;
    });
  }

  return {
    filters: {
      location,
      minBudget: budgetRange.minBudget,
      maxBudget: budgetRange.maxBudget,
      roomType,
      people,
      amenities,
      verified: intent.verified
    },
    intent,
    results: results.slice(0, 10)
  };
}

// ----------------------------------------------------
// FORMAT CHATBOT RESPONSE
// ----------------------------------------------------

function formatResults(search) {
  const {
    filters,
    results,
    intent
  } = search;

  const topNearby = homes
    .filter(home => {
      if (filters.location && home.location.toLowerCase() !== filters.location.toLowerCase()) return false;
      if (filters.roomType && home.roomType.toLowerCase() !== filters.roomType.toLowerCase()) return false;
      return true;
    })
    .sort((a, b) => a.rent - b.rent)
    .slice(0, 3);

  if (!results.length) {
    const locationText = filters.location ? ` in ${filters.location}` : "";
    const roomText = filters.roomType ? ` ${filters.roomType.toLowerCase()} room` : " room";
    const budgetText = filters.maxBudget ? ` under ₹${filters.maxBudget}` : "";

    if (topNearby.length) {
      return (
        `😔 I did not find an exact match${locationText}${budgetText}.\n\n` +
        `Closest available options:${topNearby.map((home, index) => `\n${index + 1}. ${home.name} — ₹${home.rent}/month, ${home.location}, ${home.roomType}, ${home.commuteMinutes} min commute, ${home.verified ? 'verified' : 'verification pending'}`).join('')}` +
        `\n\nTry increasing the budget by ₹500–₹1000 or choosing another nearby area.`
      );
    }

    return (
      "😔 Sorry! I couldn't find a matching home.\n\n" +
      "Try:\n" +
      "• A higher budget\n" +
      "• Another location\n" +
      "• Shared or Private room\n" +
      "• Fewer people\n\n" +
      "Example: \"Shared room in Peelamedu under ₹5000\""
    );
  }

  let title = "🏠 BASERA AI FOUND MATCHING HOMES";

  if (intent.cheapest) {
    title = "💰 BASERA AI — CHEAPEST HOMES";
  }

  if (intent.safest) {
    title = "🛡️ BASERA AI — SAFEST HOMES";
  }

  let reply = `${title}\n\n`;

  if (filters.location) reply += `📍 Location: ${filters.location}\n`;
  if (filters.roomType) reply += `🛏️ Type: ${filters.roomType}\n`;
  if (filters.maxBudget) reply += `💰 Budget: Up to ₹${filters.maxBudget}\n`;
  if (filters.minBudget) reply += `💰 Minimum: ₹${filters.minBudget}\n`;
  if (filters.people) reply += `👥 People: ${filters.people}\n`;
  if (filters.amenities.length) reply += `✨ Amenities: ${filters.amenities.join(", ")}\n`;

  reply += `\nFound ${results.length} suitable homes.\n\n`;

  results.slice(0, 5).forEach((home, index) => {
    reply +=
      `${index + 1}. 🏠 ${home.name}\n` +
      `📍 ${home.location}\n` +
      `📌 ${home.area}\n` +
      `💰 ₹${home.rent}/month\n` +
      `🛏️ ${home.roomType} · ${home.beds} bed(s)\n` +
      `⭐ Fair Rent: ${home.fairRentScore}/100\n` +
      `🛡️ Safety: ${home.safetyScore}/100\n` +
      `🚶 Commute: ${home.commuteMinutes} min\n` +
      `✅ Verified: ${home.verified ? "Yes" : "No"}\n\n`;
  });

  return reply;
}

// ----------------------------------------------------
// CHATBOT API
// ----------------------------------------------------

app.post("/api/chat", (req, res) => {
  try {
    const message = req.body.message || "";

    if (!message.trim()) {
      return res.json({
        success: true,
        reply:
          "👋 Hi! I'm BASERA AI.\n\n" +
          "Tell me what type of room you need.\n\n" +
          "Example:\n" +
          "\"Shared room in Peelamedu under ₹5000\""
      });
    }

    const search = searchHomes(message);

    res.json({
      success: true,
      message,
      filters: search.filters,
      intent: search.intent,
      count: search.results.length,
      results: search.results,
      reply: formatResults(search)
    });
  } catch (error) {
    console.error("Chat error:", error);

    res.status(500).json({
      success: false,
      reply:
        "🤖 BASERA AI is temporarily unavailable. Please try again."
    });
  }
});

// ----------------------------------------------------
// HOUSING SEARCH API
// ----------------------------------------------------

app.get("/api/housing", (req, res) => {
  try {
    let results = [...homes];

    const location = req.query.location;
    const roomType = req.query.roomType;

    const maxBudget =
      req.query.maxBudget !== undefined
        ? Number(req.query.maxBudget)
        : null;

    const minBudget =
      req.query.minBudget !== undefined
        ? Number(req.query.minBudget)
        : null;

    const verified =
      req.query.verified === "true";

    const wifi =
      req.query.wifi === "true";

    // Location
    if (location) {
      results = results.filter(
        home =>
          home.location.toLowerCase() ===
          String(location).toLowerCase()
      );
    }

    // Room type
    if (roomType) {
      results = results.filter(
        home =>
          home.roomType.toLowerCase() ===
          String(roomType).toLowerCase()
      );
    }

    // Maximum budget
    if (maxBudget !== null && !Number.isNaN(maxBudget)) {
      results = results.filter(
        home => home.rent <= maxBudget
      );
    }

    // Minimum budget
    if (minBudget !== null && !Number.isNaN(minBudget)) {
      results = results.filter(
        home => home.rent >= minBudget
      );
    }

    // Verified only
    if (verified) {
      results = results.filter(
        home => home.verified === true
      );
    }

    // WiFi only
    if (wifi) {
      results = results.filter(
        home => home.wifi === true
      );
    }

    res.json({
      success: true,
      count: results.length,
      results
    });
  } catch (error) {
    console.error("Housing API error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load housing listings"
    });
  }
});

// ----------------------------------------------------
// GET ALL LOCATIONS
// ----------------------------------------------------

app.get("/api/locations", (req, res) => {
  const locations = [
    ...new Set(homes.map(home => home.location))
  ];

  res.json({
    success: true,
    count: locations.length,
    locations
  });
});

// ----------------------------------------------------
// GET AVAILABLE BUDGET RANGE
// ----------------------------------------------------

app.get("/api/budgets", (req, res) => {
  const rents = homes.map(home => home.rent);

  res.json({
    success: true,
    minimum: Math.min(...rents),
    maximum: Math.max(...rents),
    suggestedBudgets: [
      2000,
      3000,
      4000,
      5000,
      6000,
      7000,
      8000,
      9000,
      10000
    ]
  });
});

// ----------------------------------------------------
// SINGLE LISTING
// ----------------------------------------------------

app.get("/api/housing/:id", (req, res) => {
  const id = Number(req.params.id);

  const home = homes.find(
    home => home.id === id
  );

  if (!home) {
    return res.status(404).json({
      success: false,
      message: "Listing not found"
    });
  }

  res.json({
    success: true,
    result: home
  });
});

// ----------------------------------------------------
// RECOMMENDED HOMES
// ----------------------------------------------------

app.get("/api/recommended", (req, res) => {
  const results = [...homes]
    .sort((a, b) => {
      const scoreA =
        a.fairRentScore +
        a.safetyScore +
        (a.verified ? 10 : 0);

      const scoreB =
        b.fairRentScore +
        b.safetyScore +
        (b.verified ? 10 : 0);

      return scoreB - scoreA;
    })
    .slice(0, 10);

  res.json({
    success: true,
    count: results.length,
    results
  });
});

// ----------------------------------------------------
// SAFEST HOMES
// ----------------------------------------------------

app.get("/api/safest", (req, res) => {
  const results = [...homes]
    .sort((a, b) =>
      b.safetyScore - a.safetyScore
    )
    .slice(0, 10);

  res.json({
    success: true,
    count: results.length,
    results
  });
});

// ----------------------------------------------------
// CHEAPEST HOMES
// ----------------------------------------------------

app.get("/api/cheapest", (req, res) => {
  const results = [...homes]
    .sort((a, b) =>
      a.rent - b.rent
    )
    .slice(0, 10);

  res.json({
    success: true,
    count: results.length,
    results
  });
});

// ----------------------------------------------------
// VERIFIED HOMES
// ----------------------------------------------------

app.get("/api/verified", (req, res) => {
  const results = homes
    .filter(home => home.verified)
    .slice(0, 20);

  res.json({
    success: true,
    count: results.length,
    results
  });
});

// ----------------------------------------------------
// STATS
// ----------------------------------------------------

app.get("/api/stats", (req, res) => {
  const locations = [
    ...new Set(
      homes.map(home => home.location)
    )
  ];

  const sharedRooms = homes.filter(
    home => home.roomType === "Shared"
  );

  const privateRooms = homes.filter(
    home => home.roomType === "Private"
  );

  const verified = homes.filter(
    home => home.verified
  );

  const wifiHomes = homes.filter(
    home => home.wifi
  );

  const avgRent =
    homes.reduce(
      (total, home) => total + home.rent,
      0
    ) / homes.length;

  res.json({
    success: true,
    totalListings: homes.length,
    locations: locations.length,
    locationNames: locations,
    sharedRooms: sharedRooms.length,
    privateRooms: privateRooms.length,
    verified: verified.length,
    wifiAvailable: wifiHomes.length,
    averageRent: Math.round(avgRent),
    minimumRent: Math.min(
      ...homes.map(home => home.rent)
    ),
    maximumRent: Math.max(
      ...homes.map(home => home.rent)
    )
  });
});

// ----------------------------------------------------
// META WHATSAPP CLOUD - VERIFICATION & WEBHOOK
// ----------------------------------------------------

app.get("/meta-webhook", (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
      console.log('✅ Webhook verified');
      return res.status(200).send(challenge);
    } else {
      return res.sendStatus(403);
    }
  }

  res.sendStatus(400);
});

// Helper: send message via Meta WhatsApp Cloud
async function sendMetaWhatsApp(to, text) {
  if (!META_TOKEN || !META_PHONE_ID) {
    throw new Error('Missing META_WHATSAPP_TOKEN or META_WHATSAPP_PHONE_ID');
  }

  const url = `https://graph.facebook.com/v17.0/${META_PHONE_ID}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    to: to,
    text: { body: text }
  };

  const resp = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${META_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });

  return resp.data;
}

// Use OpenAI to enhance the reply (optional)
async function generateAIReply(systemPrompt, userMessage) {
  if (!OPENAI_KEY) return null;

  try {
    const url = 'https://api.openai.com/v1/chat/completions';
    const resp = await axios.post(url, {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      max_tokens: 600
    }, {
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    return resp.data.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error('OpenAI error', err?.response?.data || err.message);
    return null;
  }
}

// Meta webhook receiver
app.post('/meta-webhook', async (req, res) => {
  try {
    const body = req.body;

    // Basic safety
    if (!body || !body.entry) return res.sendStatus(400);

    // Process each incoming message
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        if (!value.messages) continue;

        for (const message of value.messages) {
          const from = message.from; // phone number
          const text = message.text?.body || '';

          console.log('📩 Meta incoming from', from, text);

          const search = searchHomes(text);
          const formatted = formatResults(search);

          // Optionally let OpenAI rewrite the reply for readability
          let reply = formatted;

          if (OPENAI_KEY) {
            const system = 'You are Basera assistant. Create a concise friendly reply for a worker searching housing. Use the information provided and keep language simple.';
            const ai = await generateAIReply(system, formatted);
            if (ai) reply = ai;
          }

          // Send reply back
          try {
            await sendMetaWhatsApp(from, reply);
            console.log('✅ Replied to', from);
          } catch (err) {
            console.error('Failed to send reply', err?.response?.data || err.message);
          }
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('meta-webhook error', error);
    res.sendStatus(500);
  }
});

// Endpoint: send WhatsApp message from UI
app.post('/api/send-whatsapp', async (req, res) => {
  try {
    const to = req.body.to;
    const message = req.body.message;

    if (!to || !message) return res.status(400).json({ success: false, message: 'to and message required' });

    const resp = await sendMetaWhatsApp(to, message);

    res.json({ success: true, resp });
  } catch (err) {
    console.error('send-whatsapp error', err?.response?.data || err.message);
    res.status(500).json({ success: false, error: err?.message || 'send error' });
  }
});

// ----------------------------------------------------
// WHATSAPP WEBHOOK
// ----------------------------------------------------

app.post("/whatsapp", (req, res) => {
  try {
    // This endpoint was originally implemented for Twilio.
    // For Meta WhatsApp Cloud integration we use a separate webhook below (/meta-webhook).
    res.json({ success: true, message: "Use /meta-webhook for Meta WhatsApp Cloud integrations" });

  } catch (error) {
    console.error(
      "WhatsApp error:",
      error
    );

    const twiml =
      new twilio.twiml.MessagingResponse();

    twiml.message(
      "🤖 BASERA AI is temporarily unavailable. Please try again."
    );

    res
      .type("text/xml")
      .send(twiml.toString());
  }
});

// ----------------------------------------------------
// HOME PAGE
// ----------------------------------------------------

app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>BASERA AI</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background: #f4f7f6;
            text-align: center;
            padding: 60px;
          }

          h1 {
            color: #1b5e20;
          }

          .card {
            background: white;
            max-width: 600px;
            margin: auto;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.1);
          }
        </style>
      </head>

      <body>

        <div class="card">

          <h1>🏠 BASERA AI</h1>

          <h2>Backend is Running 🚀</h2>

          <p>
            ${homes.length} housing listings loaded
          </p>

          <p>
            🤖 AI Chatbot Ready
          </p>

          <p>
            📍 Multiple Locations
          </p>

          <p>
            💰 Multiple Budgets
          </p>

          <p>
            🛏️ Shared & Private Rooms
          </p>

          <p>
            🛡️ Safety & Fair Rent Scores
          </p>

        </div>

      </body>
    </html>
  `);
});

// ----------------------------------------------------
// 404 HANDLER
// ----------------------------------------------------

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "BASERA API endpoint not found"
  });
});

// ----------------------------------------------------
// START SERVER
// ----------------------------------------------------

app.listen(PORT, () => {
  console.log("");
  console.log("========================================");
  console.log("🏠 BASERA AI BACKEND");
  console.log("========================================");
  console.log(`🚀 Server: http://localhost:${PORT}`);
  console.log(`🏠 Listings: ${homes.length}`);
  console.log(
    `📍 Locations: ${
      new Set(homes.map(h => h.location)).size
    }`
  );
  console.log(
    `👥 Shared: ${
      homes.filter(h => h.roomType === "Shared").length
    }`
  );
  console.log(
    `🛏️ Private: ${
      homes.filter(h => h.roomType === "Private").length
    }`
  );
  console.log(
    `✅ Verified: ${
      homes.filter(h => h.verified).length
    }`
  );
  console.log("========================================");
  console.log("");
});