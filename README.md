# 🔮 Read the Room

**Pick a side. Guess who's with you.**

A live party game for 2–12 players. Friends join from any phone or laptop with a 4-letter room code or a QR scan. Nobody has to sign up or install anything.

## How to play

1. A question appears with two answers, like *"Would you rather have a rewind button or a pause button for life?"* Pick yours.
2. Guess how many people in the room picked the **same** answer as you. Count yourself.
3. If your guess is exactly right, you score **3 points**. If it's off by one, you score **1**.
4. Everyone then sees who picked what, and the arguing starts.

After 5, 8 or 12 questions, the player with the most points wins. Everyone also gets end-of-game awards:

| Award | Who gets it |
|---|---|
| 🎯 Mind Reader | Guessed the room exactly the most times |
| 🦄 The Rebel | Went against the crowd the most |
| 🐑 Crowd Pleaser | Sided with the majority the most |
| 💞 Twin Souls | The two players who agreed most often |
| ⚡ Total Opposites | The two players who agreed least |

## Question packs (98 questions)

The host picks a pack in the lobby:

- 🎲 **Mix**: a bit of everything
- 🎈 **Family**: fun dilemmas for every age (flying or invisibility? cats or dogs?)
- 🍷 **Grown-ups**: money, work, dating and adult life (dream job on low pay or a boring job with huge pay?). Clean, but made for adults.
- 🌶️ **Hot takes**: settle the great debates (pineapple on pizza? is a hot dog a sandwich?)

A room won't repeat a question until it has used the whole pack. To add your own questions, edit `questions.js`. Each question is one line.

## Why it works for every age

- **No typing, no trivia, no reflexes.** You just tap one of two answers and a number, so a 9-year-old and a grandparent are on equal footing.
- **It's about the people, not the questions.** You're really scoring points for knowing your friends and family, which is why adults keep playing.
- **The reveal starts conversations.** "Wait, *you'd* rather elope?" Every round ends with names on screen and a reason to argue.

## Put it online (free, about 5 minutes, GitHub Pages)

1. Sign in at github.com and create a **new public repository**, for example `read-the-room`.
2. Click **Add file → Upload files** and drag in `index.html`, `style.css`, `game.js` and `questions.js`. Then click **Commit changes**.
3. Open **Settings → Pages**. Under "Build and deployment", choose **Deploy from a branch**, then pick **main** and **/ (root)**, and click **Save**.
4. After about a minute, your game is live at `https://<your-username>.github.io/read-the-room/`.

## Run it on your own computer

Open a terminal in this folder and run:

```bash
python -m http.server 8000
```

Then open http://localhost:8000. Open more browser tabs to play against yourself.

## How the multiplayer works

- **The host's browser is the game server.** It holds everyone's answers in secret, runs the timer and does the scoring.
- **Players connect directly to the host** over WebRTC, using [PeerJS](https://peerjs.com). The room code is part of the host's connection id, so there's no backend to deploy or pay for.
- **Every screen stays in sync** because the host sends the full game state to every player whenever anything changes, and again every 2 seconds as a heartbeat. During a question, players only see *who* has locked in, never *what* they picked, until the reveal.
- **Dropped connections recover.** If a phone locks or someone refreshes, they rejoin as the same player with the same score. If the host refreshes, the room reopens and players reconnect automatically.

## Known limits

- The host needs to keep the game open. If the host closes the tab for more than about 45 seconds, the game ends.
- Some strict school or office Wi-Fi networks block live peer connections. Switching to mobile data usually fixes this.

## Project description (for your submission)

> **Read the Room** is a party game about how well you know your people. Each round asks a would-you-rather or a hot take, like "dream job on low pay, or a boring job with huge pay?" Everyone secretly picks a side, then guesses how many friends picked the same. Guess exactly and you score. Then the reveal puts everyone's names on screen, and the arguing begins. There's no typing, trivia or reflexes, so kids, parents and grandparents compete on equal terms. The Grown-ups pack (money, work, dating, adult life) makes it a hit at adult get-togethers. Friends join from any phone with a 4-letter code or a QR scan, with no accounts or installs. Every screen stays in sync in real time: a live "locked in" tracker, a shared countdown, an animated vote split, and end-of-game awards like The Rebel and Twin Souls.
