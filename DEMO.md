# DEMO.md — Five Client Conversations with the GPU Monte Carlo Lab

**For the advisor.** No statistics background needed. Every preset number below
was produced by the actual 100,000-path CPU reference engine with seed 42.
Robustness Frontier evidence uses its disclosed 10,000-path analysis basis with
the same seed. Physical-GPU parity and timing remain an explicit measurement
protocol, not a published performance claim.

**How to read the screen (10-second version for you, not the client):**
the glowing cone is 100,000+ simulated futures of the client's money, fanning
out year by year. Bright core = typical outcomes. Dim embers near the bottom =
futures where the money ran out. The right rail reads the same simulation:
**Probability of success**, **terminal-wealth percentiles** (P5/P50/P95),
**worst-decile drawdown**, **safe withdrawal rate**, **median failure year**.

**Universal moves used below:** presets load from the scenario picker; sliders
change the committed plan; the **CALC SAFE WR** button computes the monthly
spending the selected engine supported at the 90% target; switching
**Bootstrap ↔ GBM ↔ Fat-tail** changes the primary market engine. In advisor
view, **Robustness Frontier** runs those three engines plus the separate
Regime-t lens and shows where the answer depends on the model.

---

## Scenario 1 — "Early retiree 35-yr": *Can I stop working at 50?*

**The client:** Age 50, $1.5M saved, wants to retire *today* and spend
$5,500/month (today's dollars) for 35 years. That's a 4.4% initial withdrawal
rate — just above the famous "4% rule," which was designed for 30 years, not 35.

**Setup (clicks):** Preset picker → **"Early retiree 35-yr"**. Done — the sim
loads $1.5M, $5,500/mo, 35-year horizon, historical-bootstrap engine.

**What to say:**
> "We're stress-testing your plan against every market regime since 1926 — the
> Depression, the 1970s, 2008 — replayed in 12-month chunks a hundred thousand
> times. Watch the number that matters."

**What the client sees:** Probability of success lands at **83.45%**. The cone
fans wide: median outcome **$6.710M** left at 85, best-decile outcomes reach
**$68.234M** — but a visible band of embers at the bottom: 1 in 6 futures runs
out, median failure in **year 22** (client age ~72).

**The move:** press **CALC SAFE WR**. The app binary-searches the sim and
answers **≈ $4,576/month** (3.6% initial rate). Now drag the withdrawal slider
from 5,500 toward the measured result and watch the current simulation show the ember band thinning.

**The one insight:** *At 4.4% over 35 years, your plan works 5 times out of 6 —
good odds, but "ran out at 72" is the failure mode. Spending ~$1,000 less per
month buys you from 83% to 90%+ certainty. The 4% rule wasn't built for a
35-year retirement; the safe number for yours is about $4,500.*

---

## Scenario 2 — "Pre-retiree 10-yr glidepath": *Should I de-risk as I approach retirement?*

**The client:** Age 55, $650k saved, investing $2,500/month, retiring at 65,
then spending $4,500/month. Conventional wisdom says glide from 90% stocks down
to 60% over the working decade.

**Setup (clicks):** Preset picker → **"Pre-retiree 10-yr glidepath"**
(bootstrap engine, glidepath 90% → 60% already set).

**What to say:**
> "This is your current plan against a century of real market history. Then
> we'll poke it."

**What the client sees:** Success **95.73%**, median legacy **$2.592M**,
worst-decile drawdown **90.6%** — the conditional mean of the deepest 10%.

**The moves (two of them):**
1. Raise the contribution and read the newly computed range rather than a memorized point estimate.
2. Compare the 90→60 glidepath with a flat allocation; the triangulation card separates model disagreement from plan choices.

**The one insight:** *The glidepath is not a free safety switch. It changes the
trade-off among survival, ending wealth, and drawdown. Read those three outputs
together, then compare a contribution change with an allocation change on the
current engine rather than relying on a memorized rule.*

---

## Scenario 3 — "Robustness Frontier": *Which answer survives the assumptions?*

**The plan:** $1.0M today, $2,000/month contributions, $5,000/month real
spending, 30 years, and an 80%→60% equity glidepath. This is the fixed
validation fixture: 10,000 paths per model, seed 42.

**Setup (clicks):** Advisor view → **Robustness Frontier** → **RUN 4-MODEL
ANALYSIS**. The primary model remains the one selected in the controls; the
analysis evaluates GBM, historical bootstrap, Student-t(5), and Regime-t on
the same captured plan and seed.

**What to say:**
> "A success percentage is not the answer. It is an answer conditional on a
> market model. Let's find the spending level that survives all four lenses."

**What the advisor sees (measured production evidence):**

| Lens | Current-plan success | 90% monthly capacity |
|---|---:|---:|
| GBM | 51.49% | $3,632.81 |
| Historical bootstrap | 60.31% | $3,476.56 |
| Student-t(5) | 51.58% | $3,632.81 |
| Regime-t | 64.91% | $3,984.38 |

The current plan spans **51.49%–64.91%**, a **13.42 percentage-point** model
range. The robust floor is the minimum tested 90% capacity: **$3,476.56 per
month**, set by historical bootstrap in this fixture. Every capacity is an
actually evaluated curve point within the declared 90% ±0.5pp tolerance.

**The honest interpretation:** Regime-t is the most optimistic lens here. It
is not a hidden "stress case" and it is not a recommendation. It adds persistent
calm/stress volatility with joint equity-bond Student-t innovations calibrated
to 1,206 real months through 2026-06; it deliberately ignores the μ/σ sliders.
Its two states share one mean and covariance shape, so this version does **not**
claim that equity-bond correlation changes across regimes.

**The one insight:** *The model ranking is less important than the decision
boundary. At $5,000/month every lens dislikes the plan, but they disagree by
13.42 points about how much. The spending curve turns that disagreement into an
actionable question: what monthly commitment clears the 90% bar under every
tested assumption? Here, the answer is $3,476.56 — not because one model is
"right," but because that is the lowest capacity any of the four measured.*

---

## Scenario 4 — "High-withdrawal cautionary": *The $8,000/month conversation*

**The client:** $1.2M, insists on $8,000/month — an 8% initial withdrawal
rate. Double the classic rule. This meeting is about changing a number, not
explaining a model.

**Setup (clicks):** Preset picker → **"High-withdrawal cautionary"**. Let the
cone build; don't say anything for a beat.

**What to say:**
> "This is every 30-year stretch since 1926, replayed against your exact
> plan. The embers at the bottom are the futures where the money's gone.
> Tell me when you think it runs out."

**What the client sees:** Success **47.05%** — a literal coin flip. Median
terminal wealth **$0**. Median failure year **15.9** — half the failing
histories are broke before year 16. Worst-decile drawdown **100.0%**. The cone
is visibly bottom-heavy with embers across the second half of the horizon.

**The move:** press **CALC SAFE WR** → **≈ $3,958/month**. Then drag the
withdrawal slider from 8,000 toward that result and let the current simulation—not a scripted number—show the ember band thinning.

**The one insight:** *At $8,000 you're flipping a coin on running out with a
third of your retirement still ahead. History's answer for "what would have
worked 90% of the time" is about $4,000. Every dollar between those numbers
is a bet, not a plan — and now you've seen the bet.*

---

## Scenario 5 — "Accumulation only": *The 30-year-old starting from $25k*

**The client:** Young saver, $25k invested, contributing $1,500/month, 30-year
runway, no withdrawals. The question isn't survival — it's "what could this
become?"

**Setup (clicks):** Preset picker → **"Accumulation only"**. Success rate will
read 100% (you can't "fail" while only saving) — the story is the *spread*.

**What to say:**
> "Same habit, a hundred thousand different market histories. Watch where the
> money lands — and what changes it."

**What the client sees:** Median outcome **$2.184M**; bad-luck 5th percentile
still **$646.6k**; lucky 95th percentile **$7.976M**. The cone is wide and
entirely above zero.

**The move:** change the contribution and read the new distribution directly; the current engine owns every displayed number.

**The one insight:** *Thirty years out, the same saving habit spans $646.6k to
$7.976M across the measured distribution. You cannot control which market
history arrives; contribution is the lever you can change. Move it on screen
and let the current engine quantify the new range.*

---

## Appendix — demo hygiene

- **Numbers drift by design:** the sim defaults to seed 42 for reproducibility.
  Changing the seed re-rolls the 100k futures; at 100k paths the success rate
  moves by ≲0.4pp between seeds. If a client asks "will I get the same answer
  tomorrow?" — yes; show them the seed field and re-run it.
- **Separate precision from honesty:** normal simulation can use 100k or 1M
  paths on WebGPU. The Frontier intentionally discloses its own 10k CPU basis
  in fallback mode; its capacities are tested curve points, not interpolated
  promises.
- **If the badge says CPU mode:** you're on a non-WebGPU browser; everything
  above still works on the disclosed 10,000-path basis, with more estimator
  noise than the larger GPU runs; the cone is the one thing that's missing.
  Demo scenarios 1–5 are fully usable in CPU mode.
- **Regime-t is a fourth lens, not a fourth primary control:** it appears only
  in Robustness Frontier, is calibrated through 2026-06, and ignores μ/σ.
  Do not describe it as necessarily conservative; in the fixed fixture it is
  the most optimistic model.
- **Calibration defense:** every default (μ=7%, σ=15%, block length 12, ν=5,
  the 6%-withdrawal opening screen) is justified against the underlying
  Shiller dataset in `docs/calibration.md` — the page to open if a client
  (or compliance) asks "why these assumptions?"
