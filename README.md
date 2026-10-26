# 🔮 Mindmela — the desi party game

**Pick a side. Guess who's with you.**

Mindmela is a free live party game for 2–12 players. The name means a *mela* (fair) of minds: everyone brings an opinion, and the fun is guessing who thinks like you. The game itself is in English; the questions are in desi Hinglish from Meerut and Bulandshahr. Friends join from any phone with a 4-letter room code or a QR scan, with no sign-up, and it installs on your phone like an app.

**Play now:** https://lalitbhardwaj2002.github.io/mindmela/

## How to play

1. A question appears with two answers, like *"Meerut se kya le jaaoge? 🍬 Gajak-revdi or 🏏 Cricket ka balla?"* Pick yours.
2. Guess how many people in the room picked the **same** answer as you. Count yourself.
3. If your guess is exactly right, you score **3 points**. If it's off by one, you score **1**.
4. Everyone then sees who picked what, and the arguing starts.

Play 5, 10 or 20 questions, or choose **∞ Endless** and keep going until the host ends it. At the end, players get awards:

| Award | Who gets it |
|---|---|
| 🎯 Mind Reader | Guessed the room exactly the most times |
| 🦄 The Rebel | Went against the crowd the most |
| 🐑 Crowd Pleaser | Sided with the majority the most |
| 💞 Twin Souls | The two players who agreed most often |
| ⚡ Total Opposites | The two players who agreed least |

## 9,236 questions, and they keep changing

Questions come from two places in `questions.js`:

- **Hand-written questions (116).** Examples: *"Har shaadi mein naraaz kaun hota hai? Phufa ji or Jija ji"*, *"Ganna mill ka season… Trolley se ganna kheencho or Na bhai, daant padegi"*.
- **A question generator (17 categories).** Each category has question frames and a pool of desi answers: khaana, meetha, shaadi, rishtedaar, sawaari, ilaaka (Ghanta Ghar, Abu Lane, Kala Aam, Khurja…), and more. The game pairs two answers from one pool under one frame, for example *"Shaadi ki daawat mein pehle kis stall pe? 🥙 Bedmi poori or 💧 Golgappe"*. That makes 9,236 different questions in the Mix pack.

**Champion rounds use the room's own answers.** When the room clearly picks one answer, that winner often comes back under the same question against a new challenger: *"🏆 Pichhla vijeta waapas! Har baat pe naraaz kaun hota hai? Mama ji or Tau ji"*. The result says whether it's *still the champion* or there's a *new champion*.

A room never sees the same pair of answers twice until it has used up the pack. To add more questions, add answers to any pool in `questions.js`. Every new answer creates dozens of new questions.

| Pack | Questions |
|---|---|
| 🎲 Mix | 9,236 |
| 🏡 Family | 7,370 |
| 🌾 Desi Bulandshahr | 6,928 |
| 🏏 Meerut Side | 6,019 |
| 🌶️ Hot Takes | 5,207 |
| 💸 Grown-ups | 3,398 |

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

> **Mindmela** is a desi party game about how well you know your people. Each round asks a Hinglish dilemma straight from Meerut and Bulandshahr, like "Sarkari naukri kam tankhwah, ya private moti tankhwah?" or "Har shaadi mein naraaz kaun: Phufa ji ya Jija ji?" Everyone secretly picks a side, then guesses how many friends picked the same. Guess exactly and you score. Then the reveal puts everyone's names on screen, and the arguing begins. A question generator builds over 9,000 questions from desi ingredients. Champion rounds bring back the room's last winning answer to face a new challenger, so every game plays differently. Friends join from any phone with a 4-letter code, with no accounts, and it installs like an app. Every screen stays in sync in real time, ending with awards like The Rebel and Twin Souls.
