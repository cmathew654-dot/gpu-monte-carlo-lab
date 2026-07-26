# DEMO.md — Five Client Conversations with the GPU Monte Carlo Lab

**For the advisor.** No statistics background needed. Every number below was
produced by the actual simulation engine (100,000-path CPU reference run of each
preset, seed 42; on the GPU at 1M paths the same numbers land within ~±0.2pp).
If the screen in front of you shows something slightly different in the last
decimal, that's the simulation being honest, not broken.

**How to read the screen (10-second version for you, not the client):**
the glowing cone is 100,000+ simulated futures of the client's money, fanning
out year by year. Bright core = typical outcomes. Dim embers near the bottom =
futures where the money ran out. The right rail reads the same simulation:
**Probability of success**, **terminal-wealth percentiles** (P5/P50/P95),
**worst-decile drawdown**, **safe withdrawal rate**, **median failure year**.

**Universal moves used below:** presets load from the scenario picker; sliders
withdrawal / contribution / allocation / μ / σ update the sim live (~1 frame on
GPU); the **CALC SAFE WR** button computes the monthly spending that history
would have supported 90% of the time; switching the return model
(Bootstrap ↔ GBM ↔ Fat-tail) swaps the market engine under the same plan.

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

**The one insight:** *De-risking into retirement didn't change this plan's
survival odds — it changed what you give up and how bumpy it feels. Keeping
90% stocks doubles the median legacy but asks for nerves through 27%
drawdowns. And if you want more safety, $1,000/month more saving does more
than any allocation tweak.*

---

## Scenario 3 — "Fat-tail stress": *"Markets always come back… right?"*

**The client:** Prudent plan — $1.25M, $4,200/month (a textbook 4.0% rate),
30 years — but skeptical of crash risk, or convinced Gaussian models hide it.

**Setup (clicks):** Preset picker → **"Fat-tail stress"**. Then toggle the
return model between **Bootstrap**, **GBM**, and **Fat-tail** — same plan,
three engines.

**What to say:**
> "Let's run your exact plan through three different versions of how markets
> behave, and see which assumption actually matters."

**What the client sees (real measured numbers):**

| Engine | Success | Median outcome | P95 | Worst-decile DD | Median failure |
|---|---|---|---|---|---|
| GBM (smooth Gaussian) | 90.7% | $2.93M | $17.4M | 31.7% | yr 23.7 |
| Fat-tail (crash-prone months) | 90.7% | $2.93M | $17.2M | 31.0% | yr 23.8 |
| Bootstrap (real history, whole years replayed) | 89.1% | $4.72M | $37.8M | 36.5% | yr 21.4 |

**The one insight (this is the meeting's "wow"):** *Making individual months
more crash-prone barely moves a 30-year plan — over 360 months, wild months
average out. What actually threatens you isn't the shape of one bad month;
it's bad years that come in clusters — the Depression, the 1970s. That's why
the historical engine shows a deeper worst case (36.5% drawdown) even though
it also shows the richest upside. Crash-shape risk is overrated; sequence
risk is the real enemy — and that's what your withdrawal strategy insures
against.*

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

**The one insight:** *Thirty years out, the difference between luck and no
luck is the difference between $646.6k and $7.976M — but the difference between
$750 and $3,000 a month is the difference between $1.2M and $4.2M* at the
median. *You can't control which market history you live through. You can
almost completely control the contribution. Time in the market, fed steadily,
beats timing the market.*

---

## Appendix — demo hygiene

- **Numbers drift by design:** the sim defaults to seed 42 for reproducibility.
  Changing the seed re-rolls the 100k futures; at 100k paths the success rate
  moves by ≲0.4pp between seeds. If a client asks "will I get the same answer
  tomorrow?" — yes; show them the seed field and re-run it.
- **Run fat-tail demos at 100k+ paths:** at the 10k CPU fallback, tail stats
  carry ±5% estimator noise on medians (measured; REPORT.md FINDING-2). The
  GPU's 1M paths is not a luxury for this scenario — it's the point.
- **If the badge says CPU mode:** you're on a non-WebGPU browser; everything
  above still works at 10,000 paths (stats within ~1pp), the cone is the one
  thing that's missing. Demo scenarios 1–5 are fully valid in CPU mode.
- **Calibration defense:** every default (μ=7%, σ=15%, block length 12, ν=5,
  the 6%-withdrawal opening screen) is justified against the underlying
  Shiller dataset in `docs/calibration.md` — the page to open if a client
  (or compliance) asks "why these assumptions?"
