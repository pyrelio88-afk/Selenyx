"""临床数据路由 — NANDA / 检验值 / 统计分布临界值 / 术语表。"""

from __future__ import annotations

import math

from fastapi import APIRouter, HTTPException, Query

router = APIRouter()

_EPS = 1e-14
_TINY = 1e-300


@router.get("/nanda")
async def list_nanda(domain: str | None = None):
    """NANDA-I 护理诊断列表"""
    return []


@router.get("/labs")
async def list_labs(category: str | None = None):
    """检验值参考范围"""
    return []


@router.get("/stat/{table_type}")
async def stat_table(
    table_type: str,
    df: int | None = Query(default=None),
    df2: int | None = Query(default=None),
    alpha: float = Query(default=0.05),
):
    """统计分布临界值精确计算（z / t 双侧临界值；chi2 / f 右尾临界值）。"""
    kind = (table_type or "").strip().lower()
    if kind not in {"z", "t", "chi2", "f"}:
        raise HTTPException(400, f"未知分布类型：{table_type}（仅支持 z / t / chi2 / f）")
    if not math.isfinite(alpha) or alpha <= 0.0 or alpha >= 1.0:
        raise HTTPException(400, "alpha 必须在 (0, 1) 开区间内。")

    if kind == "z":
        if df is not None and df < 1:
            raise HTTPException(400, "df 必须为正整数（>= 1）。")
        z = _inv_normal_cdf(1.0 - alpha / 2.0)
        return {"criticalValue": round(z, 4), "type": "z", "alpha": alpha}

    if df is None or df < 1:
        raise HTTPException(400, "df 必须为正整数（>= 1）。")

    if kind == "t":
        val = _inv_t_two_sided(df, alpha)
        return {"criticalValue": round(val, 4), "type": "t", "df": df, "alpha": alpha}

    if kind == "chi2":
        val = _inv_chi2_upper(df, alpha)
        return {"criticalValue": round(val, 4), "type": "chi2", "df": df, "alpha": alpha}

    # kind == "f"
    denom_df = df if df2 is None else df2
    if denom_df < 1:
        raise HTTPException(400, "df2 必须为正整数（>= 1）。")
    val = _inv_f_upper(df, denom_df, alpha)
    return {
        "criticalValue": round(val, 4),
        "type": "f",
        "df": df,
        "df2": denom_df,
        "alpha": alpha,
    }


@router.get("/glossary")
async def search_glossary(q: str | None = None):
    """术语表搜索"""
    return []


def _inv_normal_cdf(p: float) -> float:
    """标准正态分布逆 CDF（Beasley-Springer-Moro 初值 + Halley 精化至双精度极限）。"""
    if not math.isfinite(p) or p <= 0.0 or p >= 1.0:
        raise ValueError("p must be in (0, 1)")
    a = [
        -3.969683028665376e01,
        2.209460984245205e02,
        -2.759285104469687e02,
        1.383577518672690e02,
        -3.066479806614716e01,
        2.506628277459239e00,
    ]
    b = [
        -5.447609879822406e01,
        1.615858368580409e02,
        -1.556989798598866e02,
        6.680131188771972e01,
        -1.328068155288572e01,
    ]
    c = [
        -7.784894002430293e-03,
        -3.223964580411365e-01,
        -2.400758277161838e00,
        -2.549732539343734e00,
        4.374664141464968e00,
        2.938163982698783e00,
    ]
    d = [
        7.784695709041462e-03,
        3.224671290700398e-01,
        2.445134137142996e00,
        3.754408661907416e00,
    ]
    p_low = 0.02425
    p_high = 1.0 - p_low
    if p < p_low:
        q = math.sqrt(-2.0 * math.log(p))
        x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / (
            (((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1.0
        )
    elif p <= p_high:
        q = p - 0.5
        r = q * q
        x = (
            (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5])
            * q
            / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1.0)
        )
    else:
        q = math.sqrt(-2.0 * math.log(1.0 - p))
        x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / (
            (((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1.0
        )
    inv_sqrt_2pi = 1.0 / math.sqrt(2.0 * math.pi)
    sqrt2 = math.sqrt(2.0)
    for _ in range(2):
        cdf = 0.5 * math.erfc(-x / sqrt2)
        err = cdf - p
        pdf = inv_sqrt_2pi * math.exp(-0.5 * x * x)
        if pdf > 0.0:
            u = err / pdf
            x -= u / (1.0 + 0.5 * x * u)
    return x


def _betacf(a: float, b: float, x: float) -> float:
    """Lentz continued fraction for the incomplete beta function (NIST DLMF 8.17.22)."""
    qab = a + b
    qap = a + 1.0
    qam = a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < _TINY:
        d = _TINY
    d = 1.0 / d
    h = d
    for m in range(1, 250):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < _TINY:
            d = _TINY
        c = 1.0 + aa / c
        if abs(c) < _TINY:
            c = _TINY
        d = 1.0 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < _TINY:
            d = _TINY
        c = 1.0 + aa / c
        if abs(c) < _TINY:
            c = _TINY
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < _EPS:
            break
    return h


def _reg_incomplete_beta(a: float, b: float, x: float) -> float:
    """Regularized incomplete beta function I_x(a, b) for x in [0, 1]."""
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    log_bt = (
        math.lgamma(a + b)
        - math.lgamma(a)
        - math.lgamma(b)
        + a * math.log(x)
        + b * math.log1p(-x)
    )
    bt = math.exp(log_bt) if log_bt > -745.0 else 0.0
    if x < (a + 1.0) / (a + b + 2.0):
        return bt * _betacf(a, b, x) / a
    return 1.0 - bt * _betacf(b, a, 1.0 - x) / b


def _inv_reg_incomplete_beta(a: float, b: float, target: float) -> float:
    """Invert strictly increasing I_x(a, b) = target for x in (0, 1)."""
    lo, hi = 0.0, 1.0
    x = a / (a + b)
    log_beta = math.lgamma(a) + math.lgamma(b) - math.lgamma(a + b)
    for _ in range(80):
        val = _reg_incomplete_beta(a, b, x)
        diff = val - target
        if abs(diff) <= 1e-13 * max(1.0, target):
            break
        if diff < 0.0:
            lo = x
        else:
            hi = x
        if 0.0 < x < 1.0:
            log_pdf = (a - 1.0) * math.log(x) + (b - 1.0) * math.log1p(-x) - log_beta
            pdf = math.exp(log_pdf) if log_pdf > -700.0 else 0.0
            if pdf > 0.0:
                candidate = x - diff / pdf
                if lo < candidate < hi:
                    x = candidate
                    continue
        x = 0.5 * (lo + hi)
        if hi - lo <= 1e-15 * max(1.0, x):
            break
    return x


def _inv_t_two_sided(df: int, alpha: float) -> float:
    """Two-sided Student's t critical value t_{1 - alpha/2, df}."""
    if df > 10_000_000:
        z = _inv_normal_cdf(1.0 - alpha / 2.0)
        return z + (z**3 + z) / (4.0 * df)
    x = _inv_reg_incomplete_beta(0.5 * df, 0.5, alpha)
    return math.sqrt(df * (1.0 - x) / x)


def _inv_f_upper(df1: int, df2: int, alpha: float) -> float:
    """Upper-tail F critical value F_{1 - alpha}(df1, df2)."""
    x = _inv_reg_incomplete_beta(0.5 * df2, 0.5 * df1, alpha)
    return (df2 * (1.0 - x)) / (df1 * x)


def _reg_gamma_q(a: float, x: float) -> float:
    """Upper regularized incomplete gamma Q(a, x) = 1 - P(a, x)."""
    if x <= 0.0:
        return 1.0
    if x < a + 1.0:
        ap = a
        term = 1.0 / a
        total = term
        for _ in range(300):
            ap += 1.0
            term *= x / ap
            total += term
            if abs(term) < abs(total) * _EPS:
                break
        log_pref = -x + a * math.log(x) - math.lgamma(a)
        p = total * math.exp(log_pref) if log_pref > -745.0 else 0.0
        return max(0.0, 1.0 - p)
    b = x + 1.0 - a
    c = 1.0 / _TINY
    d = 1.0 / b
    h = d
    for i in range(1, 300):
        an = -i * (i - a)
        b += 2.0
        d = an * d + b
        if abs(d) < _TINY:
            d = _TINY
        c = b + an / c
        if abs(c) < _TINY:
            c = _TINY
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < _EPS:
            break
    log_pref = -x + a * math.log(x) - math.lgamma(a)
    return h * math.exp(log_pref) if log_pref > -745.0 else 0.0


def _inv_chi2_upper(df: int, alpha: float) -> float:
    """Upper-tail chi-square critical value chi2_{1 - alpha, df}."""
    a = 0.5 * df
    z = _inv_normal_cdf(1.0 - alpha)
    wh = 1.0 - 2.0 / (9.0 * df) + z * math.sqrt(2.0 / (9.0 * df))
    y = max(1e-6, a * (wh**3) if wh > 0.05 else 0.5 * (z**2 if df == 1 else a))
    lo = 0.0
    hi = max(y * 2.0, a + 10.0)
    while _reg_gamma_q(a, hi) > alpha:
        lo = hi
        hi *= 2.0
    y = min(max(y, lo + 1e-12), hi * 0.999999)
    lg = math.lgamma(a)
    for _ in range(80):
        q = _reg_gamma_q(a, y)
        diff = q - alpha  # Q(a, y) is strictly decreasing in y
        if abs(diff) <= 1e-13 * max(1.0, alpha):
            break
        if diff > 0.0:
            lo = y
        else:
            hi = y
        if y > 0.0:
            log_pdf = (a - 1.0) * math.log(y) - y - lg
            pdf = math.exp(log_pdf) if log_pdf > -700.0 else 0.0
            if pdf > 0.0:
                candidate = y + diff / pdf  # dQ/dy = -pdf
                if lo < candidate < hi:
                    y = candidate
                    continue
        y = 0.5 * (lo + hi)
        if hi - lo <= 1e-14 * max(1.0, y):
            break
    return 2.0 * y
