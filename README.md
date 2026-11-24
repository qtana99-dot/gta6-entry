# Solara Heat

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/qtana99-dot/gta6-entry/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard)
[![reward](https://make.fun/badge/gta6-01/qtana99-dot/gta6-entry/reward.svg)](https://make.fun/bounty/gta6-01)

Solara Heat is an original top-down open-world crime game set in Solara Bay, a fictional
sun-soaked coastal city. Walk the seven districts, steal cars, run jobs for fixer Nadia Cruz,
outrun a five-star police response, and finish a four-part story before the city opens up for
free roam. It is plain static files: canvas 2D, ES modules, no build step and no network access.

## Run it

Serve the game folder with any static HTTP server and open the page in desktop Chrome:

```
node serve.ts
# then open http://localhost:8080
```

Or with Python:

```
cd game && python3 -m http.server 8901
# then open http://127.0.0.1:8901/
```

## Controls

- **WASD / arrow keys** move on foot or drive a car; **Shift** sprints or handbrakes.
- **Mouse** aims, **left click** shoots, **F** punches, **Q** switches fists/pistol, **R** reloads.
- **E** enters or leaves a car and advances dialogue.
- **Esc** pauses and opens the save menu.

Progress saves to browser localStorage between jobs. See **BUILD.md** for the full systems map.
