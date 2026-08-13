"""20-question RAG gold set: record hit@5 baseline for the hash hybrid retriever."""

from __future__ import annotations

import asyncio

from sqlmodel import Session

from selenyx_backend.database import get_engine, init_db
from selenyx_backend.models import DocumentChunk, Reference
from selenyx_backend.services.embeddings import HASH_BACKEND, hash_embed
from selenyx_backend.services.rag import semantic_search
from selenyx_backend.services.rate_limit import reset_rate_limits

GOLD: list[tuple[str, str, str]] = [
    ("g01", "集束化护理可降低 ICU 谵妄发生率。", "谵妄集束化护理的效果如何？"),
    ("g02", "PRISMA 2020 要求系统综述报告检索策略与筛选流程。", "PRISMA 报告规范要求写什么？"),
    ("g03", "CONSORT 用于随机对照试验的报告清单。", "随机对照试验该用哪份报告清单？"),
    ("g04", "STROBE 适用于观察性研究的报告。", "观察性研究报告规范是什么？"),
    ("g05", "OpenAlex 以作品、作者、机构构成学术知识图谱。", "OpenAlex 的核心实体有哪些？"),
    ("g06", "PubMed 通过 E-utilities 提供文献检索接口。", "怎样用接口检索 PubMed？"),
    ("g07", "Crossref 以 DOI 解析题录与参考文献。", "DOI 元数据通常从哪里取？"),
    ("g08", "arXiv 托管物理、数学与计算机预印本。", "预印本平台 arXiv 覆盖哪些学科？"),
    ("g09", "Zotero 用 CSL 样式生成参考文献格式。", "Zotero 如何格式化参考文献？"),
    ("g10", "Better BibTeX 按 [auth:lower][year] 生成引用键。", "Better BibTeX 的引用键规则是什么？"),
    ("g11", "GB/T 7714 是中国学术论著的著录规则。", "中文参考文献国标是哪一项？"),
    ("g12", "证据门要求 agent 写卡只能 pending，人裁决后才进成稿。", "Selenyx 的证据门怎么工作？"),
    ("g13", "混合检索把哈希向量与词法分打成加权分数。", "本地 RAG 默认如何打分？"),
    ("g14", "SQLite WAL 允许读写并发且崩溃后可恢复。", "为什么科研库要用 WAL？"),
    ("g15", "仙鹤伙伴在待裁决时头顶黄点静立。", "桌宠黄点代表什么？"),
    ("g16", "token 预算硬闸在累计用量超过上限时中止 run。", "agent 怎样防止一次跑爆额度？"),
    ("g17", "矛盾证据把同一 claim 的 supports 与 contradicts 并排。", "裁决队列如何展示互相打架的证据？"),
    ("g18", "成稿附录列出每条 [^e:id] 对应的卡、裁决人与时间。", "导出成稿时证据附录包含什么？"),
    ("g19", "丹顶鹤顶朱红是 Selenyx 唯一允许的彩色点睛。", "界面里唯一的强调色从哪来？"),
    ("g20", "本地优先意味着密钥与记忆永不离开本机。", "Selenyx 的数据边界是什么？"),
]


def _seed(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("SELENYX_DATA_DIR", str(tmp_path))
    get_engine.cache_clear()
    reset_rate_limits()
    init_db()
    with Session(get_engine()) as session:
        for ident, text, _question in GOLD:
            session.add(Reference(id=ident, title=ident, abstract=text, item_type="journalArticle"))
            session.add(
                DocumentChunk(
                    reference_id=ident,
                    source="metadata",
                    text=text,
                    embedding_json=__import__("json").dumps(hash_embed(text)),
                    embedding_backend=HASH_BACKEND,
                )
            )
        session.commit()


def test_rag_gold_hit_at_5(tmp_path, monkeypatch) -> None:
    _seed(tmp_path, monkeypatch)
    hits_at_5 = 0
    misses: list[str] = []
    with Session(get_engine()) as session:
        for ident, _text, question in GOLD:
            results = asyncio.run(semantic_search(session, question, top_k=5))
            ranked = [hit.reference_id for hit in results]
            if ident in ranked:
                hits_at_5 += 1
            else:
                misses.append(f"{ident}: {question} -> {ranked[:3]}")
    # Hash hybrid is a floor, not a ceiling.  Record the baseline; require a
    # majority so a silent retriever regression cannot hide behind "we tried".
    assert hits_at_5 >= 12, f"hit@5={hits_at_5}/20 misses={misses}"
    print(f"RAG_GOLD hit@5={hits_at_5}/20")
