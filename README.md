-----

# Bun Discord Bot

Welcome to the **Bun Discord Bot**\! This bot is built with **Bun**, a fast JavaScript runtime, and **Discord.js**, a powerful library for interacting with the Discord API.

## 🚀 Features

### ⚙️ Configuratie
- `/config` — beheer alle bot-instellingen (welkom, tickets, levels, economie, enz.)

---

### 💰 Economie
- `/config economy` — stel alle economy commands in via Wizard
- `/balance` — bekijk je saldo  
- `/deposit` — zet geld op de bank  
- `/withdraw` — haal geld van de bank  
- `/work` — werk voor een beloning  
- `/crime` — waag een gok met risico’s  
- `/rob` — probeer een ander te beroven  
- `/shop` — bekijk beschikbare items  
- `/inventory` — bekijk je spullen  
- `/eco` — economiebeheer (admin)  
- `/jobstats` — statistieken van je job  

---

### 🎉 Fun
- `/birthday` — stel je verjaardag in (met meldingen)  
- `/tellen` — tellen in een channel (counting game)   

---

### 📈 Levels
- `/level` — bekijk je huidige level  
- `/leaderboard` — toon de top 10  
- `/setlevel` — stel handmatig een level in (admin)  
- `/resetlevels` — reset alle levels  

---

### 🛡️ Moderatie
- `/ban` — ban een gebruiker  
- `/kick` — kick een gebruiker  
- `/warn` — waarschuw een gebruiker  
- `/clear` — verwijder berichten  
- `/ticket` — maak een ticket aan  
- `/close` — sluit een ticket  

---

### 🎟️ Ticketsysteem
- `/config tickets` — dit opent het ticket model

---

### 🔧 Events & Utilities
**Events:**
- `guildMemberAdd` — welkom events  
- `messageCreate` — berichtenhandling  
- `interactionCreate` — slash commands & knoppen  
- `voiceStateUpdate` — voice events (bv. levels)  
- `shopInteraction` — interacties in de shop  
- `countingHelper` — helper voor het tel-spel  
- `ready` — start-up logica  

**Utils & Helpers:**
- `birthdaySystem` & `birthdayScheduler` — verjaardagsmeldingen  
- `ticketSystem` & `ticketPanel` — ticketbeheer  
- `database.js` — database connectie  
- `colorValidator.js` — validatie van kleuren  
- `formatMessage.js` — nette berichtopmaak  
- `ack.js` — acknowledgment utility  

---
  
## Requirements

  * **Node.js** (latest version)
  * A Discord bot token
  * A Discord server

## Installation

1.  **Clone** the repository:
    ```bash
    git clone https://github.com/BardoXX/Bun-Discord-bot.git
    ```
2.  Navigate to the project folder:
    ```bash
    cd Bun-Discord-bot
    ```
3.  Install dependencies with **Bun**:
    ```bash
    bun install
    ```

## Configuration

1.  Rename `.env.example` to **`.env`**.
2.  Open the file and add your token and client ID:
    ```bash
    DISCORD_TOKEN=YOUR_BOT_TOKEN_HERE
    CLIENT_ID=YOUR_CLIENT_ID_HERE
    ```

## Getting Started

Run this command to start the bot:

```bash
bun start
```

## License

This project is licensed under the **MIT License**. Feel free to use, modify, and distribute the code, as long as you include the original copyright and license notice.

-----
