"""
临床数据路由 — NANDA / 检验值 / 统计表 / 术语表
"""

from fastapi import APIRouter, Query
import math

router = APIRouter()


@router.get("/nanda")
async def list_nanda(domain: str | None = None):
    """NANDA-I 护理诊断列表（254 条 × 13 领域）"""
    # TODO: 从数据库/静态数据加载
    return []


@router.get("/labs")
async def list_labs(category: str | None = None):
    """检验值参考范围（110+ 项 × 15 分类）"""
    # TODO: 从数据库/静态数据加载
    return []


@router.get("/stat/{table_type}")
async def stat_table(table_type: str, df: int = Query(...), alpha: float = Query(0.05)):
    """统计分布临界值查询"""
    if table_type == "z":
        # Z 分布: 临界值 = Φ^(-1)(1 - α/2)
        z = _inv_normal_cdf(1 - alpha / 2)
        return {"criticalValue": round(z, 4), "type": "z", "alpha": alpha}
    elif table_type == "t":
        # TODO: t 分布临界值表（需 scipy 或预计算表）
        return {"criticalValue": 0, "type": "t", "df": df, "alpha": alpha, "note": "待实现"}
    elif table_type == "chi2":
        return {"criticalValue": 0, "type": "chi2", "df": df, "alpha": alpha, "note": "待实现"}
    elif table_type == "f":
        return {"criticalValue": 0, "type": "f", "df": df, "alpha": alpha, "note": "待实现"}
    return {"error": "未知分布类型"}


@router.get("/glossary")
async def search_glossary(q: str | None = None):
    """术语表搜索"""
    # TODO: 从数据库加载
    return []


def _inv_normal_cdf(p: float) -> float:
    """标准正态分布逆 CDF (Beasley-Springer-Moro 算法)"""
    if p <= 0 or p >= 1:
        raise ValueError("p must be in (0, 1)")
    # rational approximation
    a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00]
    b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01]
    c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00]
    d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00]
    p_low = 0.02425
    p_high = 1 - p_low
    if p < p_low:
        q = math.sqrt(-2 * math.log(p))
        return (((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) / ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1)
    elif p <= p_high:
        q = p - 0.5
        r = q * q
        return (((((a[0]*r + a[1])*r + a[2])*r + a[3])*r + a[4])*r + a[5]) * q / (((((b[0]*r + b[1])*r + b[2])*r + b[3])*r + b[4])*r + 1)
    else:
        q = math.sqrt(-2 * math.log(1 - p))
        return -(((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) / ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1)
