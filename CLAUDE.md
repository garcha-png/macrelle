# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run both servers for development (two terminals)
npm run dev        # Vite frontend → http://localhost:5173
npm run server     # Express backend → http://localhost:3001

# Production build
npm run build      # tsc + vite build → dist/
npm run preview    # Preview built dist/
```

Both servers must be running during development. Vite proxies all `/api` requests to port 3001.

## Architecture

The app has two distinct layers:

**`index.html`** — the entire active app. One file containing all HTML, CSS, and vanilla JS. No framework, no build step required to run. This is what users interact with.

**`server.js`** — Express backend serving a single SQLite KV table (`macrelle.db`) via `better-sqlite3`. All app state is persisted here through a simple REST API:
- `GET /api/data/:key` — fetch a value
- `PUT /api/data/:key` — upsert a value (any JSON body)
- `DELETE /api/data/:key` — delete a key
- `GET /api/data?prefix=log_` — bulk fetch by key prefix

The `src/` directory and `react-app.html` are an unused prototype. All development happens in `index.html` and `server.js`.

## Backend Keys

| Key | Contents |
|-----|----------|
| `profile` | `{age, sex, height_cm, weight_kg, act_gym, act_cardio, act_steps, goal, track_training_days, cal_offset}` |
| `log_YYYY-MM-DD` | `{breakfast, lunch, dinner, snack, is_training_day}` — each meal is `[{id, name, cals, protein_g, carbs_g, fat_g}]` |
| `weight_log` | `[{date, kg}]` newest first |
| `water_YYYY-MM-DD` | integer ml |
| `repeats` | `[{id, name, items:[{name,cals,protein_g,carbs_g,fat_g}]}]` |

## TDEE Calculation

**BMR:** Mifflin-St Jeor — male: `(10×kg)+(6.25×cm)−(5×age)+5`, female: `…−161`

**Activity multiplier** (`calcActivityMult`): additive from three independent components:
- `act_gym` (0 / 1-2 / 3-4 / 5+): adds 0 / 0.07 / 0.14 / 0.21
- `act_cardio` (0 / 1-2 / 3-4 / 5+): adds 0 / 0.05 / 0.10 / 0.15
- `act_steps` (low / light / moderate / active): adds 0 / 0.04 / 0.08 / 0.13
- Base 1.2, capped at 1.9

**Goal adjustments:** std_deficit −500, small_deficit −250, maintain 0, small_surplus +250, std_surplus +500

**`cal_offset`:** user's manual fine-tune (±50 kcal steps, capped ±1000), applied on top of goal adjustment before the safety floor (1500 kcal male / 1200 kcal female).

**Training day:** +150 kcal, +500 ml water when `track_training_days` is on.

**Macro targets:** protein tiered by multiplier (<1.35→1.4g/kg, <1.50→1.6, <1.65→1.8, else→2.0); fat 25% of calories; carbs remainder; water 35ml/kg.

## Food Lookup

All food entries go straight to Gemini 2.5 Flash Lite — there is no local food database. `lookupFoodAI(text)` sends the raw user input and expects a JSON array of `{name, cals, protein_g, carbs_g, fat_g}`. The button shows `…` while awaiting the response.

API key is hardcoded as `GEMINI_KEY` in `index.html`. Model: `gemini-2.5-flash-lite-preview-06-17`.

## UI Structure

Two views, toggled via `switchView(v)`:

**Logging (`#view-log`):** training bar (hidden when `track_training_days` is off) → macro summary bars → meal sections (Breakfast/Lunch/Dinner/Snack) → water card → repeats panel (collapsible) → weight chart

**Settings (`#view-settings`):** three sections — *TDEE* (age, sex, height, weight, 3-part activity selectors), *Goal* (5 goal pills, training toggle, fine-tune offset stepper), *Computed Targets* (live 2×4 grid: BMR/TDEE/Goal base/Goal today/Protein/Fat/Carbs/Water)

`liveCompute()` recalculates and updates the Computed Targets grid on every input change, debouncing `autoSaveSettings()` by 700ms.

## Design Tokens

```css
--bg:#141414        --surface:#1e1e1e    --surface-el:#272727
--border:#333       --text:#e0e0e0       --text2:#6a6a6a
--radius:12px
--c-cal:#d94545     --c-protein:#4a9e4a  --c-carbs:#4a80c4
--c-fat:#d48020     --c-water:#9460c8
```

Meal colours: Breakfast `#f97316`, Lunch `#3b82f6`, Dinner `#a855f7`, Snack `#fbbf24`

## Profile Migration

`migrateProfile(p)` runs on every load. Handles: old field names (`weight`→`weight_kg`, `height`→`height_cm`), legacy activity strings (Sedentary/Lightly Active/…→new enum), legacy goal strings, and old single `activity` field → three-component `act_gym`/`act_cardio`/`act_steps`.
