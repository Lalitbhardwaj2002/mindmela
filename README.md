# 🔮 Mindmela — the desi party game

**Pick a side. Guess who's with you.**

Mindmela is a free live party game for 2–12 players. The name means a *mela* (fair) of minds: everyone brings an opinion, and the fun is guessing who thinks like you. The game itself is in English; the questions are in desi Hinglish from Meerut and Bulandshahr. Friends join from any phone with a 4-letter room code or a QR scan, with no sign-up, and it installs on your phone like an app.

**Play now:** https://lalitbhardwaj2002.github.io/mindmela/

## How to play

1. A question appears with two answers, like *"Meerut se kya le jaaoge? 🍬 Gajak-revdi or 🏏 Cricket ka balla?"* Pick yours.
2. Guess how many people in the room picked the **same** answer as you. Count yourself.
3. If your guess is exactly right, you score **3 points**. If it's off by one, you score **1**.
4. Everyone then sees who picked what, and the arguing starts.

Choose a game length: **⚡ Quick (5)**, **🎯 Classic (10)**, **🔥 Long (20)** or **🏆 Marathon (50)**.

**Every round has a label** above the question, so you know what's coming: 🍛 Foodie Round, 🤪 Weird Round, ⭐ Cricketer Round, and so on.

**When someone reads the room perfectly**, Laddoo, the game's dancing mascot, pops up to cheer them by name.

**Every player has a live tag** next to their name that changes each round: 👑 Leader, 🔥 On fire ×3, 🎯 Bullseye, 🦄 Lone wolf, 🤏 So close, 🐑 With the crowd, 🌶️ Spicy pick, ⚖️ Split vote or 😴 Snoozed.

**At the end, every player gets their own tag card**, ranked with medals:

| Tag | Who gets it |
|---|---|
| 🎯 Mind Reader | Guessed the room exactly the most times |
| 🔥 Hot Streak | The longest run of perfect guesses |
| 🦄 Lone Wolf | Went against the crowd the most |
| 💞 Twin Soul | The two players who agreed most often |
| ⚡ Total Opposite | The two players who agreed least |
| 🐑 Crowd Favourite | Sided with the crowd the most |
| 🤏 Almost There | Missed by one the most |
| 🎲 Wild Guesser | Made the most bold guesses that missed |
| 🐢 Fashionably Late | Let the timer run out the most |

Anyone left over gets a fun one: 🌟 Steady Star, 😄 Good Vibes, 🍿 Entertainer, 🧘 Zen Master, 🎉 Party Starter and more.

## 11 sections, 11,713 questions

| Section | Questions |
|---|---|
| 🎲 Mix (everything) | 11,713 |
| 🏡 Family | 8,930 |
| 🌾 Desi Bulandshahr | 6,927 |
| 🌶️ Hot Takes | 6,638 |
| 🕰️ Meerut Side | 6,291 |
| 💸 Grown-ups | 3,671 |
| 💘 Pyaar-Vyaar | 2,189 |
| 🏫 School Days | 2,186 |
| 🎬 Bollywood Masala | 1,265 |
| 🤪 Ajeeb Dilemmas | 1,220 |
| 🏏 Cricket Crazy | 1,079 |

Questions come from two places in `questions.js`:

- **Hand-written questions (214)**, 20–30 per section. Examples: *"Har shaadi mein naraaz kaun hota hai? Phufa ji or Jija ji"*, *"Sabse khatarnaak villain kaun? Gabbar Singh or Mogambo"*, *"Pairon ki jagah… Skates or Spring"*.
- **A question generator (24 categories).** Each category has a round label, question frames and a pool of desi answers. The game pairs two answers from one pool under one frame, for example *"Shaadi ki daawat mein pehle kis stall pe? 🥙 Bedmi poori or 💧 Golgappe"*.

**No similar questions back to back.** The same category never comes up two rounds in a row, and no question or answer repeats within 4 rounds. A room never sees the same pair of answers twice until it has used up the section.

To add more questions, add answers to any pool in `questions.js`. Every new answer creates dozens of new questions.

## Install it as an app

- **Android (Chrome):** open the play link and tap **📲 Install the app**, or use Chrome's menu ⋮ → **Install app**.
- **iPhone (Safari):** tap **Share**, then **Add to Home Screen**.
- **Computer (Chrome or Edge):** click the install icon in the address bar.

## Getting found in search

"Mindmela" is a made-up word that no other website uses, so once search engines list the site, searching for it should bring up this game. The page includes:

- A search title, description and keywords, and a share preview image (`og-image.png`)
- Structured data that tells Google it's a free web game
- A "What is Mindmela?" section on the home page that search engines can read
- `sitemap.xml`, plus a Bing/IndexNow key file (`fa5abe8ca70029f6cf7b3495dd5bdf01.txt`)

**To get on Google faster (needs your Google account, about 5 minutes):**

1. Go to https://search.google.com/search-console and click **Add property** → **URL prefix**.
2. Enter `https://lalitbhardwaj2002.github.io/mindmela/`.
3. Choose the **HTML tag** method. Copy the `<meta name="google-site-verification" …>` tag and add it to `index.html` next to the other `<meta>` tags. Push the change, then click **Verify**.
4. Open **Sitemaps** and submit `sitemap.xml`.
5. Open **URL inspection**, paste the play link, and click **Request indexing**.

Google usually lists a new site within a few days to two weeks. Bing (which also powers DuckDuckGo and Yahoo results) can be told directly through IndexNow with the key file above.

## Run it on your own computer

Open a terminal in this folder and run:

```bash
python -m http.server 8000
```

Then open http://localhost:8000. When you host from your own computer, the QR code and invite link send friends to the public site (`PUBLIC_URL` in `game.js`), because a `localhost` link would point at their own phone.

## How the multiplayer works

- **The host's browser is the game server.** It holds everyone's answers in secret, runs the timer, picks the questions and does the scoring.
- **Players connect directly to the host** over WebRTC, using [PeerJS](https://peerjs.com). The room code is part of the host's connection id, so there's no backend to deploy or pay for.
- **Every screen stays in sync** because the host sends the full game state to every player whenever anything changes, and again every 2 seconds as a heartbeat. During a question, players only see *who* has locked in, never *what* they picked.
- **Dropped connections recover.** If a phone locks or someone refreshes, they rejoin as the same player with the same score.
- **It installs as an app** through `manifest.json` and the service worker `sw.js`, which saves the files so the game opens instantly.

## Known limits

- The host needs to keep the game open. If the host closes it for more than about 45 seconds, the game ends.
- Some strict school or office Wi-Fi networks block live peer connections. Switching to mobile data usually fixes this.
- The generator mixes answers people wrote; it isn't a live AI. A live AI would need a paid server and an API key.

## Project description (for your submission)

> **Mindmela** is a desi party game about how well you know your people. Each round asks a Hinglish dilemma straight from Meerut and Bulandshahr, like "Sarkari naukri kam tankhwah, ya private moti tankhwah?" or "Har shaadi mein naraaz kaun: Phufa ji ya Jija ji?" Everyone secretly picks a side, then guesses how many friends picked the same. Guess exactly and you score. Then the reveal puts everyone's names on screen, and the arguing begins. Eleven sections, from Bollywood Masala and Cricket Crazy to Ajeeb Dilemmas, hold over 11,000 questions, and no two rounds in a row are alike. When someone reads the room perfectly, Laddoo the dancing mascot cheers them on. Every player carries a live tag like "🔥 On fire ×3" and ends the game with a personal one like Mind Reader or Lone Wolf. Friends join from any phone with a 4-letter code, with no accounts, and it installs like an app.
