# Push

A no-nonsense motivation app for two specific moments: when a craving hits, and when you need to get to the gym.

No backend, no accounts, no tracking — everything (your "why", streaks, badges) is stored in your browser's `localStorage`.

## Run it

Just open `index.html` in a browser, or serve the folder:

```
python3 -m http.server 8000
```

Then visit `http://localhost:8000`. On your phone, open it in the browser and use "Add to Home Screen" so it behaves like an app.

## What it does

- **Set your why** — one honest sentence about why you're doing this. It gets shown back to you at your weakest moments.
- **"I'm craving junk food"** — a random hard-truth quote, a concrete tip (drink water, brush teeth, walk away), and a 90-second timer to just wait it out.
- **"I need to work out"** — same idea, aimed at getting you moving: a quote, a tip to lower the barrier to starting, and a 10-minute "just start" timer.
- **Streaks** — separate streaks for workouts and clean eating, computed from your logged days.
- **Badges** — small wins (3/7/30-day streaks, cravings resisted, workouts logged) to keep it a little bit game-like.

## Deploying for free

Push this repo to GitHub and enable GitHub Pages (Settings → Pages → deploy from `main`) — it's static files, so no build step needed.

---

This repo also hosts **[Rig Plan](rigplan/)**, a separate livestream venue/cable/power/crew planner. See `rigplan/README.md`.
