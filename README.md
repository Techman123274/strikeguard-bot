# ⚠️ Strike Bot

A modular Discord.js v14 bot with advanced strike moderation system and MongoDB support.

## 🚀 Features

- Slash commands for issuing, approving, denying strikes.
- Auto-punishment on 3rd approved strike.
- Obfuscate user messages via `/sa` (session annihilation).
- Logs everything to MongoDB and logs channel.

## 📦 Setup

1. `git clone <this-repo>`
2. `cd strike-bot`
3. `npm install`
4. Create `.env` file based on `.env.example`
5. Run `node index.js`

## 🧠 Folder Structure

- `commands/` - Slash command files
- `events/` - Discord event handlers
- `models/` - Mongoose schemas

---

Made with 🧠 by Tech.
