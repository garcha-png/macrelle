# Macrelle — Nutrition Tracker

Mobile-first macro/nutrition tracking web app. Single `index.html` file, vanilla HTML/CSS/JS, all data in localStorage. No backend, no build step required. Served via Vite dev server.

## Project Structure
- `index.html` — entire app (HTML + CSS + JS in one file)
- `public/logo.png` — Macrelle brand logo
- `.claude/launch.json` — dev server config (`npm run dev`, port 5173)
- `package.json` — Vite deps

## Brand
- Name: **Macrelle**
- Tagline: "Track Your Macros"
- Target users: teens aged 10–18

## Design System
| Token | Value | Use |
|-------|-------|-----|
| `--bg` | `#080808` | Page background |
| `--surface` | `#111111` | Cards |
| `--surface2` | `#1a1a1a` | Inputs |
| `--border` | `#2a2a2a` | Dividers |
| `--text` | `#ffffff` | Primary text |
| `--text2` | `#888888` | Secondary text |
| `--c-cal` | `#ef4444` | Calories (red) |
| `--c-protein` | `#a855f7` | Protein (purple) |
| `--c-carbs` | `#3b82f6` | Carbs (blue) |
| `--c-fat` | `#f59e0b` | Fat (amber) |
| `--c-water` | `#06b6d4` | Water (cyan) |
| `--radius` | `16px` | Border radius |

- Min font: 16px. Min tap target: 48px. Dark mode only.
- Icons: inline Lucide SVG via `icon(name, size)` helper — paths in `ICONS` object.

## App Flow
1. **Cover screen** (`#view-cover`) — logo, tagline, Continue button
2. **Onboarding modal** (first launch, steps 0–3):
   - Step 0: Name, Age, Units toggle, Sex toggle
   - Step 1: Height, Weight (metric or imperial)
   - Step 2: Activity level (4 colored pills)
   - Step 3: Goal (5 colored pills) + training day toggle
3. **Logging page** (default after onboarding)
4. **Stats page** and **Settings page** via bottom nav

## Pages / Views
### Logging (`#view-log`)
Order: Training day toggle (✕/✓) → Macro summary bars (Cal/P/C/F) → 4 meal cards (Breakfast/Lunch/Dinner/Snack) → Water tracker (+250ml/+500ml/custom)

### Stats (`#view-stats`)
Order: Macro progress bars → TDEE card (with today's goal + "Change?" link) → Weight chart (bar chart, 6 time ranges) → Log weight input

### Settings (`#view-settings`)
Full page: Name → Age → Units → Sex → Height → Weight → Activity pills → Goal pills → Training day toggle → **Computed targets grid** (live updates on input change)

## TDEE / BMR Calculation
**Mifflin-St Jeor BMR:**
- Male: `(10 × weight_kg) + (6.25 × height_cm) − (5 × age) + 5`
- Female: `(10 × weight_kg) + (6.25 × height_cm) − (5 × age) − 161`

**Activity multipliers:**
| Level | Multiplier |
|-------|------------|
| low | 1.2 |
| light | 1.375 |
| moderate | 1.55 |
| high | 1.725 |

**Goal adjustments:**
| Goal | kcal/day |
|------|----------|
| std_deficit | −500 |
| small_deficit | −250 |
| maintain | 0 |
| small_surplus | +250 |
| std_surplus | +500 |

**Safety floors:** 1500 kcal (male), 1200 kcal (female)

**Training day:** +150 kcal, +500ml water (when `track_training_days` enabled)

**Macro targets:**
- Protein: activity-tiered (low=1.4g/kg, light=1.6g/kg, moderate=1.8g/kg, high=2.0g/kg)
- Fat: 25% of base calorie goal ÷ 9
- Carbs: remaining calories ÷ 4
- Water: `35 × weight_kg` ml (+ 500ml on training days)

## localStorage Keys
| Key | Type | Contents |
|-----|------|----------|
| `profile` | JSON | `{name, age, sex, height_cm, weight_kg, units, activity, goal, track_training_days}` |
| `log_YYYY-MM-DD` | JSON | `{breakfast:[], lunch:[], dinner:[], snack:[]}` each item: `{id, name, cals, protein_g, carbs_g, fat_g}` |
| `weight_log` | JSON | `[{date:'YYYY-MM-DD', kg:number}]` newest first |
| `water_YYYY-MM-DD` | string | integer ml |
| `last_week_calc` | string | `'YYYY-MM-DD'` of last Monday weight recalc |

## Profile Migration
`loadProfile()` auto-migrates old schema:
- `weight` → `weight_kg`, `height` → `height_cm`
- Old activity strings (Sedentary/Lightly Active/…) → new enum (low/light/moderate/high)
- Old goal strings → new enum (std_deficit/small_deficit/maintain/…)

## Food Log Migration
`calcTotals()` checks both old `{calories, protein, carbs, fat}` and new `{cals, protein_g, carbs_g, fat_g}` item schemas. `getDayLog()` migrates `snacks` → `snack`.

## Food Database
- 80+ offline entries in `FOOD_DB` array (South Asian, African, Middle Eastern, SE Asian, Latin American, Caribbean, Western)
- Schema: `{name, cals, protein_g, carbs_g, fat_g}`
- `lookupFood(query)` — 3-tier fuzzy: exact → substring → word-based

## Key JS Functions
| Function | Purpose |
|----------|---------|
| `calcBMR(p)` | Mifflin-St Jeor BMR |
| `calcTargets(p, isTrain)` | All macro/water targets |
| `loadProfile()` | Load + migrate old profile schema |
| `renderStats()` | Stats page |
| `renderFoodLog()` | All meal cards |
| `renderWeightChart(range)` | SVG bar chart weight graph |
| `submitFood(meal)` | Add food via fuzzy lookup |
| `adjustWater(delta)` | +/- water intake |
| `switchView(v)` | Navigate log/stats/settings |
| `checkWeeklyRecalc()` | Auto-update weight weekly |
| `icon(name, size)` | Render inline Lucide SVG |

## Weight Chart
SVG bar chart (replacing old bezier line). Time range filters: 2w / 1m / 3m / 6m / 1y / ALL. Tap bar for tooltip.

## Pending / Next Features
- Natural language food lookup (e.g. "3 eggs and a piece of toast") — Nutritionix API primary, Claude Haiku fallback
- lb/kg unit toggle (UI in Settings, not yet wired to all displays)
- Food portion size adjustment
