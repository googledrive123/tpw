# TFW Crew Wars Bot

Discord bot for managing football crew wars — signings, rosters, promotions, and more.

---

## Setup Guide (Step by Step)

### 1. Create a Discord Bot Application

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application**, name it something like "TFW Bot"
3. Go to the **Bot** tab on the left sidebar
4. Click **Reset Token** and copy the token — you'll need this
5. Scroll down and enable **all three Privileged Gateway Intents**:
   - ✅ Presence Intent
   - ✅ Server Members Intent
   - ✅ Message Content Intent
6. Go to the **OAuth2** tab, copy the **Application ID** (this is your CLIENT_ID)

### 2. Invite the Bot to Your Server

1. Still in the Developer Portal, go to **OAuth2 → URL Generator**
2. Check these scopes: `bot`, `applications.commands`
3. Under Bot Permissions, check:
   - Manage Roles
   - Send Messages
   - Use Slash Commands
   - Embed Links
4. Copy the generated URL and open it in your browser
5. Select your TFW server and authorize

### 3. Get Your Server ID

1. In Discord, go to **Settings → Advanced** and enable **Developer Mode**
2. Right-click your TFW server name → **Copy Server ID**

### 4. Install & Configure the Bot

Make sure you have [Node.js 18+](https://nodejs.org) installed, then:

```bash
cd tfw-bot
npm install
```

Create a `.env` file (copy from the example):

```bash
cp .env.example .env
```

Edit `.env` and fill in your values:

```
BOT_TOKEN=paste_your_bot_token_here
CLIENT_ID=paste_your_application_id_here
GUILD_ID=paste_your_server_id_here
```

### 5. Deploy Commands & Start

```bash
# Register the slash commands with Discord (run once, or after changes)
npm run deploy

# Start the bot
npm start
```

You should see:
```
Deploying 14 commands to guild ...
Commands deployed successfully!
✅ TFW Bot#1234 is online!
```

### 6. Important: Role Hierarchy

The bot's role in your server must be **higher** than any crew role it needs to manage. Drag the bot's role above crew roles in **Server Settings → Roles**.

---

## All Commands

### Staff Only (role ID: 1488409640701136968)

| Command | Description |
|---------|-------------|
| `/addcrew @role @owner` | Register a role as a crew with a franchise owner |
| `/removecrew @role` | Unregister a crew (doesn't delete the role) |
| `/setowner @role @user` | Transfer crew ownership |
| `/forcesign @user @role` | Add a player to a crew without an invite |
| `/forcerelease @user` | Remove a player from their crew |

### Franchise Owner Only

| Command | Description |
|---------|-------------|
| `/promote @user` | Promote a player on your crew to Captain |
| `/demote @user` | Demote a Captain back to player |

### Franchise Owner & Captains

| Command | Description |
|---------|-------------|
| `/sign @user` | Send a DM invite to a free agent to join your crew |
| `/release @user` | Release a player from your crew |

### Crew Members

| Command | Description |
|---------|-------------|
| `/leave` | Leave your crew and become a free agent |

### Everyone

| Command | Description |
|---------|-------------|
| `/roster @role` | View a crew's full roster with ranks |
| `/crews` | List all registered crews |
| `/freeagents` | List all players not on any crew |
| `/myteam` | Check which crew you're on and your rank |

---

## How It Works

- **Crews are tied to Discord roles.** When a player is signed, they get the role. When released, it's removed.
- **Signing sends a DM** with Accept/Reject buttons. The offer expires after 24 hours.
- **Data is stored in `data.json`** in the bot folder. Back this file up if you care about the data.
- **The bot needs Manage Roles permission** and its role must be above crew roles in the hierarchy.

---

## Hosting Options

- **Your own PC:** Just keep the terminal running (good for testing)
- **A VPS:** DigitalOcean, Hetzner, or any $5/month Linux server
- **Free tier:** [Railway](https://railway.app) or [Render](https://render.com) both support Node.js bots
- **Use PM2 for auto-restart:** `npm install -g pm2 && pm2 start index.js --name tfw-bot`
