# Basera V3

Complete frontend prototype integrating the requested Basera modules:
- Housing search
- Smart housing matching
- Fair-rent comparison
- Rent + commute matching
- Shared-room rent splitting
- Room-sharing agreement template
- AI / WhatsApp-style housing assistant
- Scam-risk checks
- Sanitation photo complaint + tracking
- NGO / city dashboard
- English/Tamil toggle

## Run
npm install
npm run dev

Open the localhost URL shown by Vite.

## Build
npm run build

This is a frontend prototype. AI, WhatsApp, maps, database, authentication, municipal APIs and legal integrations are represented as demo flows.

## WhatsApp + OpenAI integration (backend)

This project includes a simple Express backend (`server.js`) that can integrate with Meta WhatsApp Cloud and OpenAI. To enable:

1. Copy `.env.example` to `.env` and set values: `META_WHATSAPP_TOKEN`, `META_WHATSAPP_PHONE_ID`, `WEBHOOK_VERIFY_TOKEN`, `OPENAI_API_KEY`, and `PORT`.
2. Install dependencies: `npm install` (includes `axios`).
3. Start the backend: `node server.js` (or `npm run dev` if you run both front and backend concurrently).
4. For local webhook testing, expose your backend with `ngrok http 3001` and set the Meta app webhook URL to `https://<your-ngrok>/meta-webhook` and verify with your `WEBHOOK_VERIFY_TOKEN`.
5. Use the UI to send messages: on the results page or bottom nav press "WhatsApp" and enter the recipient number (with country code). The server will call Meta's send API using `META_WHATSAPP_TOKEN`.

Security: Keep your tokens secret. For production, use a proper secrets manager and HTTPS.
