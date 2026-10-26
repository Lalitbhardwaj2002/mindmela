# 🔮 Read the Room — desi party game

**Side chuno. Andaaza lagao kaun tumhare saath hai.**
*(Pick a side. Guess who's with you.)*

A live party game for 2–12 players, in Hinglish with a west UP (Bulandshahr) flavour. Friends join from any phone with a 4-letter room code or a QR scan. Nobody has to sign up, and you can install it on your phone like an app.

**Play now:** https://lalitbhardwaj2002.github.io/read-the-room/

## Kaise khelein (how to play)

1. A question appears with two answers, like *"Ganga nahaane kahaan chalein? 🌊 Anupshahr ghaat ya ⚡ Narora ghaat?"* Pick yours.
2. Guess how many people in the room picked the **same** answer as you. Count yourself.
3. If your guess is exactly right, you score **3 points**. If it's off by one, you score **1**.
4. Everyone then sees who picked what, and the arguing starts.

After 5, 8 or 12 questions, the player with the most points wins. Everyone also gets end-of-game awards:

| Award | Who gets it |
|---|---|
| 🎯 Mann Ka Jaasoos | Guessed the room exactly the most times |
| 🦁 Akela Sher | Went against the crowd the most |
| 🐑 Bheed Ka Saathi | Sided with the majority the most |
| 💞 Dil Se Jude | The two players who agreed most often |
| ⚡ Ulti Ganga | The two players who agreed least |

## Question packs (121 questions, all in Hinglish)

The host picks a pack in the lobby:

- 🎲 **Sab Mila Ke**: a bit of everything
- 🌾 **Desi Bulandshahr**: gaam, Ganga, Khurja aur desi swag. *Khurja gaye toh kya laaoge: chini mitti ke bartan ya khurchan? Har shaadi mein naraaz kaun: Phufa ji ya Jija ji?*
- 🏡 **Ghar-Parivaar**: for kids and grown-ups together. *Zyada daraavna kya: Mummy ki daant ya Papa ki chuppi?*
- 💸 **Badon Ki Baatein**: naukri, paisa, shaadi aur rishtedaar. *Sarkari naukri kam tankhwah ya private moti tankhwah?*
- 🌶️ **Garma Garam**: chai-pe-charcha debates. *Chai mein biscuit dubona: kala hai ya paap hai?*

A room won't repeat a question until it has used the whole pack. To add your own questions, edit `questions.js`. Each question is one line.

## Install it as an app

- **Android (Chrome):** open the play link and tap **📲 App install karo** on the home screen. You can also use Chrome's menu ⋮ → **Install app**. It gets its own icon and opens full-screen like a normal app.
- **iPhone (Safari):** open the play link, tap **Share**, then **Add to Home Screen**.
- **Computer (Chrome or Edge):** click the install icon in the address bar.

The app opens instantly, even on a slow connection, because it saves its files on the phone. Playing still needs internet, since the game connects players live.

## Why it works for every age

- **No typing, no trivia, no reflexes.** You just tap one of two answers and a number, so a 9-year-old and their Dadi play on equal terms.
- **It speaks like home.** The questions are in the Hinglish and west UP desi boli people actually use, about chaupal, kolhu, Khurja, Ganga snan and phufa ji.
- **The reveal starts conversations.** Every round ends with names on screen and a reason to argue.

## Put it online (GitHub Pages)

1. Create a **public repository** on github.com.
2. Upload `index.html`, `style.css`, `game.js`, `questions.js`, `manifest.json`, `sw.js` and the `icons` folder.
3. Open **Settings → Pages**, choose **Deploy from a branch**, then pick **main** and **/ (root)**, and click **Save**.

## Run it on your own computer

Open a terminal in this folder and run:

```bash
python -m http.server 8000
```

Then open http://localhost:8000. Open more browser tabs to play against yourself.

When you host from your own computer, the QR code and invite link send friends to the public site (`PUBLIC_URL` in `game.js`), because a `localhost` link would point at their own phone. Rooms connect the same way from either copy, so everyone ends up in your room. If you fork this repo, change `PUBLIC_URL` to your own GitHub Pages address.

## How the multiplayer works

- **The host's browser is the game server.** It holds everyone's answers in secret, runs the timer and does the scoring.
- **Players connect directly to the host** over WebRTC, using [PeerJS](https://peerjs.com). The room code is part of the host's connection id, so there's no backend to deploy or pay for.
- **Every screen stays in sync** because the host sends the full game state to every player whenever anything changes, and again every 2 seconds as a heartbeat. During a question, players only see *who* has locked in, never *what* they picked, until the reveal.
- **Dropped connections recover.** If a phone locks or someone refreshes, they rejoin as the same player with the same score. If the host refreshes, the room reopens and players reconnect automatically.
- **It installs as an app.** `manifest.json` gives it a name, icon and full-screen mode. `sw.js` (a service worker) saves the game's files so it opens instantly, while always fetching the newest version when online.

## Known limits

- The host needs to keep the game open. If the host closes it for more than about 45 seconds, the game ends.
- Some strict school or office Wi-Fi networks block live peer connections. Switching to mobile data usually fixes this.

## Project description (for your submission)

> **Read the Room** is a desi party game about how well you know your people, written in the Hinglish and west UP boli of Bulandshahr. Each round asks a dilemma like "Sarkari naukri kam tankhwah, ya private moti tankhwah?" or "Har shaadi mein naraaz kaun: Phufa ji ya Jija ji?" Everyone secretly picks a side, then guesses how many people picked the same. Guess exactly and you score. Then the reveal puts everyone's names on screen, and the behes begins. There's no typing, trivia or reflexes, so kids, parents and Dadi-Nani compete on equal terms. Friends join from any phone with a 4-letter code or a QR scan, with no accounts. It installs on the phone like an app, and every screen stays in sync in real time: a live "lock kiya" tracker, a shared countdown, an animated vote split, and end-of-game awards like Akela Sher and Ulti Ganga.
