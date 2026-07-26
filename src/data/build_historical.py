#!/usr/bin/env python3
"""
build_historical.py — regenerate src/data/historicalReturns.json (spec §4.5).

Source (public, citable):
  Robert J. Shiller, "Irrational Exuberance" dataset (ie_data.xls), sheet "Data".
  Primary URL:   http://www.econ.yale.edu/~shiller/data/ie_data.xls
  Mirror used:   https://shillerdata.com/ (links the maintained workbook)
  The raw .xls is NOT committed (≈1.6 MB, third-party redistribution);
  re-run this script to download and rebuild.

Method:
  Equity nominal TR_t = (P_t + D_t/12) / P_{t-1} - 1      (D = annual dividend rate)
  Equity real    TR_t = (1 + nominal TR_t) / (CPI_t / CPI_{t-1}) - 1
  (Verified to reproduce Shiller's own "Real Total Return Price" column to <1e-15.)
  Bond real TR_t = Shiller "Monthly Total Bond Returns" (10-yr Treasury nominal
  gross total return, derived by Shiller from GS10) / (CPI_t / CPI_{t-1}) - 1.

Output contract (frozen with Agent 2):
  { _meta: {...}, blocks: number[], bondBlocks: number[], annualReturns: {...} }
  blocks      = flat Float32Array-quantized array of blockCount x 12 real monthly
                equity returns; block i occupies [i*12, i*12+12) and covers
                months [i, i+11] (overlapping, stride 1).
  bondBlocks  = same layout, 10-yr Treasury real returns, aligned month windows.
  blockCount (= monthCount - 11) must be <= BOOTSTRAP_BLOCKS_MAX (4096).

Usage:  python3 build_historical.py [--input path/to/ie_data.xls]
Deps:   pandas, numpy, xlrd (reads .xls). No scipy required.
"""
import argparse
import datetime
import hashlib
import io
import json
import os
import sys
import urllib.request

import numpy as np
import pandas as pd

PRIMARY_URL = "http://www.econ.yale.edu/~shiller/data/ie_data.xls"
# shillerdata.com hosts the actively-maintained copy of the same workbook.
MIRROR_URL = (
    "https://img1.wsimg.com/blobby/go/e5e77e0b-59d1-44d9-ab25-4763ac982e53/"
    "downloads/165d8a6e-26bf-44ec-a26c-a35f7f993480/ie_data.xls"
)
BLOCK_LEN = 12
BLOCKS_MAX = 4096  # BOOTSTRAP_BLOCKS_MAX (Agent 2 buffer contract)
START = 1926.01    # first return month (needs 1925-12 as base)


def download() -> bytes:
    for url in (MIRROR_URL, PRIMARY_URL):
        try:
            print(f"downloading {url} ...")
            with urllib.request.urlopen(url, timeout=120) as r:
                data = r.read()
            if len(data) < 100_000:
                raise ValueError("suspiciously small file")
            return data
        except Exception as e:  # noqa: BLE001 — fall through to next mirror
            print(f"  failed: {e}")
    sys.exit("ERROR: could not download ie_data.xls from any known source. "
             "Pass --input with a manually downloaded copy.")


def kurtosis_excess(x: np.ndarray) -> float:
    m = x.mean()
    s2 = ((x - m) ** 2).mean()
    return float(((x - m) ** 4).mean() / s2**2 - 3.0)


def ann_stats(r: np.ndarray) -> dict:
    n = len(r)
    return {
        "n": n,
        "arith": r.mean() * 12,
        "geo": (1 + r).prod() ** (12 / n) - 1,
        "vol": r.std(ddof=1) * np.sqrt(12),
        "min": r.min(),
        "max": r.max(),
        "xs_kurt": kurtosis_excess(r),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", help="local ie_data.xls (skip download)")
    ap.add_argument("--output", default=os.path.join(os.path.dirname(__file__),
                                                     "historicalReturns.json"))
    args = ap.parse_args()

    raw = open(args.input, "rb").read() if args.input else download()
    sha = hashlib.sha256(raw).hexdigest()
    print(f"source bytes: {len(raw):,}  sha256: {sha}")

    # Header row of the "Data" sheet is Excel row 8 (0-indexed 7).
    df = pd.read_excel(io.BytesIO(raw), sheet_name="Data", header=7)
    df = df.rename(columns=lambda c: str(c).strip())
    # Column map (workbook of 2026-07): Date, P, D, E, CPI, Fraction,
    # "Rate GS10", "Price"(real), "Dividend"(real), "Price.1"(real TR price),
    # ..., "Yield"(excess CAPE yield), "Returns"(monthly total bond returns).
    df = df[pd.to_numeric(df["Date"], errors="coerce").notna()].copy()
    for col in ("Date", "P", "D", "CPI", "Price.1", "Returns"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["P", "D", "CPI"]).reset_index(drop=True)

    nom = (df["P"] + df["D"] / 12) / df["P"].shift(1) - 1
    infl = df["CPI"] / df["CPI"].shift(1)
    eq_real = ((1 + nom) / infl - 1).to_numpy()
    bond_real = (df["Returns"] / infl - 1).to_numpy()

    # Cross-check equity series against Shiller's own real TR index.
    shiller_trp = (df["Price.1"] / df["Price.1"].shift(1) - 1).to_numpy()
    chk = np.nanmax(np.abs(eq_real - shiller_trp))
    assert chk < 1e-12, f"equity real TR mismatch vs workbook index: {chk}"
    print(f"cross-check vs Shiller 'Real Total Return Price': max |diff| = {chk:.2e}")

    dates = df["Date"].to_numpy()
    keep = (dates >= START) & ~np.isnan(eq_real) & ~np.isnan(bond_real)
    dates, eq_real, bond_real = dates[keep], eq_real[keep], bond_real[keep]
    assert len(dates) > 1000, "series unexpectedly short"

    def fmt(d: float) -> str:
        y = int(d)
        return f"{y:04d}-{int(round((d - y) * 100)):02d}"

    # ---- sanity checks (printed, and hard-asserted on the big ones) --------
    es, bs = ann_stats(eq_real), ann_stats(bond_real)
    print("\n=== sanity checks (1926-01 .. latest) ===")
    for name, stt in (("EQUITY real TR", es), ("10Y BOND real TR", bs)):
        print(f"{name}: n={stt['n']} arith={stt['arith']*100:.2f}%/yr "
              f"geo={stt['geo']*100:.2f}%/yr vol={stt['vol']*100:.2f}%/yr "
              f"min={stt['min']*100:.1f}% max={stt['max']*100:.1f}% "
              f"xsKurt={stt['xs_kurt']:.2f}")
    cum = np.cumprod(1 + eq_real)
    dd = cum / np.maximum.accumulate(cum) - 1
    trough = int(np.argmin(dd))
    print(f"worst real equity drawdown: {dd.min()*100:.1f}% "
          f"(trough {fmt(dates[trough])})")
    w2008 = eq_real[(dates >= 2008.09) & (dates <= 2009.02)]
    print("2008-09..2009-02 monthly real:", [f"{x*100:.1f}%" for x in w2008])
    worst_m = int(np.argmin(eq_real))
    print(f"worst month: {fmt(dates[worst_m])} = {eq_real[worst_m]*100:.1f}%")
    assert 0.05 < es["arith"] < 0.11, "equity arithmetic mean outside 5-11%/yr"
    assert 0.13 < es["vol"] < 0.22, "equity vol outside 13-22%/yr"
    assert dd.min() < -0.6, "Great Depression drawdown not visible"
    assert eq_real[(dates == 2008.10)][0] < -0.15, "2008-10 crash not visible"

    # ---- build overlapping blocks (stride 1) --------------------------------
    eq32, bd32 = eq_real.astype(np.float32), bond_real.astype(np.float32)
    nblocks = len(eq32) - BLOCK_LEN + 1
    assert nblocks <= BLOCKS_MAX, f"blockCount {nblocks} exceeds {BLOCKS_MAX}"
    blocks_eq = np.concatenate([eq32[i:i + BLOCK_LEN] for i in range(nblocks)])
    blocks_bd = np.concatenate([bd32[i:i + BLOCK_LEN] for i in range(nblocks)])

    ser = lambda a: [float(f"{v:.8g}") for v in a]  # noqa: E731

    years = sorted({int(d) for d in dates if (d % 1) < 0.13})
    annual = {}
    for y in years:
        m = (dates >= y + 0.005) & (dates < y + 0.125)
        if m.sum() == 12 and y < int(dates[-1]):
            annual[str(y)] = float(f"{(1 + eq_real[m]).prod() - 1:.6g}")

    today = datetime.date.today().isoformat()
    payload = {
        "_meta": {
            "status": "FINAL — Agent 5 (spec §1.5, §4.5). Consumed by Agent 2's "
                      "bootstrapBlocks storage buffer.",
            "contract": "Flat array of overlapping 12-month blocks of monthly REAL "
                        "total returns, serializable to Float32Array; block i occupies "
                        "indices [i*12, i*12+12); block i covers months [i, i+11] of "
                        "the underlying monthly series. JSON numbers are "
                        "float32-quantized (load directly into Float32Array).",
            "asset": "US equities: S&P Composite total return (price + reinvested "
                     "dividends), deflated by CPI; REAL simple monthly returns.",
            "blockCount": int(nblocks),
            "blockLength": BLOCK_LEN,
            "monthCount": int(len(eq32)),
            "startDate": fmt(dates[0]),
            "endDate": fmt(dates[-1]),
            "generatedAt": today,
            "source": "Robert J. Shiller, 'Irrational Exuberance' dataset "
                      "(ie_data.xls), Data sheet, columns P (S&P Composite price), "
                      "D (dividend, annual rate), CPI, GS10, Monthly Total Bond "
                      "Returns. Downloaded " + today + " from https://shillerdata.com/ "
                      "(maintained mirror of "
                      "http://www.econ.yale.edu/~shiller/data/ie_data.xls). "
                      "Source file SHA-256: " + sha,
            "method": "Equity nominal TR_t = (P_t + D_t/12)/P_{t-1} - 1; real TR_t = "
                      "(1+nominal)/(CPI_t/CPI_{t-1}) - 1. Reproduces Shiller's 'Real "
                      "Total Return Price' column to <1e-12. Bonds: Shiller's "
                      "'Monthly Total Bond Returns' (10-yr Treasury nominal gross TR, "
                      "derived from GS10) deflated by CPI identically.",
            "sanityCheck": f"Equity real TR {fmt(dates[0])}..{fmt(dates[-1])}: "
                           f"arithmetic mean {es['arith']*100:.2f}%/yr, geometric "
                           f"{es['geo']*100:.2f}%/yr, vol {es['vol']*100:.2f}%/yr, "
                           f"worst month {eq32.min()*100:.1f}% "
                           f"({fmt(dates[worst_m])}), worst real drawdown "
                           f"{dd.min()*100:.1f}% (trough {fmt(dates[trough])}), "
                           f"2008-10 = "
                           f"{eq_real[(dates == 2008.10)][0]*100:.1f}%. "
                           f"Bond real TR: arithmetic {bs['arith']*100:.2f}%/yr, "
                           f"vol {bs['vol']*100:.2f}%/yr.",
            "extensions": {
                "bondBlocks": "Same block layout as 'blocks' but 10-year US Treasury "
                              "REAL total returns (identical month windows — index i "
                              "aligns with blocks[i]); for allocation mixing (60/40). "
                              "Additive to the frozen contract; equity-only consumers "
                              "may ignore it.",
                "annualReturns": "Calendar-year real equity TR (through last full "
                                 "calendar year), for UI display/calibration "
                                 "reference. Not consumed by the GPU kernel.",
            },
        },
        "blocks": ser(blocks_eq),
        "bondBlocks": ser(blocks_bd),
        "annualReturns": annual,
    }
    with open(args.output, "w") as f:
        json.dump(payload, f, separators=(",", ":"))
    print(f"\nwrote {args.output} "
          f"({os.path.getsize(args.output)/1024:.0f} KB), "
          f"blockCount={nblocks}, months={len(eq32)} "
          f"({fmt(dates[0])}..{fmt(dates[-1])})")


if __name__ == "__main__":
    main()
