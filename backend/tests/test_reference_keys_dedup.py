"""引用键生成（better-bibtex 模式）与多通路口径去重（Zotero 模式）测试。"""

import json

from sqlmodel import Session

from selenyx_backend.database import get_engine, init_db
from selenyx_backend.models import Reference
from selenyx_backend.services.citekeys import fold, make_cite_key
from selenyx_backend.services.dedup import find_duplicate_sets, normalize_string
from selenyx_backend.services.rate_limit import reset_rate_limits


def reset_backend(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("SELENYX_DATA_DIR", str(tmp_path))
    get_engine.cache_clear()
    reset_rate_limits()
    init_db()


def ref(**kwargs) -> Reference:
    return Reference(**kwargs)


# ---------------- cite key ----------------

def test_cite_key_author_year(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    with Session(get_engine()) as session:
        key = make_cite_key(session, [{"firstName": "Wei", "lastName": "Zhang"}], "2024", "Some title")
    assert key == "zhang2024"


def test_cite_key_collision_gets_letter_postfix(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    with Session(get_engine()) as session:
        session.add(Reference(cite_key="zhang2024", title="t1"))
        session.commit()
        key = make_cite_key(session, [{"lastName": "Zhang"}], "2024", "t2")
    assert key == "zhang2024a"


def test_cite_key_fallbacks_and_cjk(tmp_path, monkeypatch):
    reset_backend(tmp_path, monkeypatch)
    with Session(get_engine()) as session:
        # 中文姓保留（biber/BibLaTeX 可用）
        assert make_cite_key(session, [{"lastName": "王"}], "2025", "t") == "王2025"
        # 无作者 → 标题首个实词；无年份 → 省略
        assert make_cite_key(session, [], "", "The Delirium Prevention Study") == "delirium"
        # 全空 → ref
        assert make_cite_key(session, [], "", "") == "ref"
        # 重音折叠
        assert fold("Müller") == "muller"


# ---------------- dedup ----------------

def test_dedup_doi_merges_despite_year_mismatch():
    a = ref(title="Alpha", doi="10.1/X", year="2020")
    b = ref(title="Alpha", doi="10.1/x", year="2021")  # DOI 同人不同年也应并
    assert find_duplicate_sets([a, b]) == [[0, 1]]


def test_dedup_title_needs_year_or_creator():
    a = ref(title="Delirium care", year="2020", creators_json=json.dumps([{"lastName": "Zhang", "firstName": "W"}]))
    b = ref(title="delirium care", year="2020")  # 同题同年 → 并
    c = ref(title="Delirium care", year="2019")  # 同题异年、无作者交集 → 不并
    d = ref(title="DELIRIUM  CARE!", year="2021",
            creators_json=json.dumps([{"lastName": "zhang", "firstName": "Wei"}]))  # 同题异年但共享作者 → 并
    groups = find_duplicate_sets([a, b, c, d])
    # a/b/d 经传递归并成一组；c 不出现在任何重复组
    assert any(set(g) == {0, 1, 3} for g in groups)
    assert all(2 not in g for g in groups)


def test_dedup_transitive_via_doi_and_title():
    a = ref(title="Same", year="2020", doi="10.1/a")
    b = ref(title="Other", year="2020", doi="10.1/a")  # 与 a DOI 相同
    c = ref(title="Other", year="2020")  # 与 b 标题同年
    assert find_duplicate_sets([a, b, c]) == [[0, 1, 2]]


def test_normalize_string_punct_and_diacritics():
    assert normalize_string("L'Étude  des Soins!") == "l etude des soins"
    assert normalize_string("") == ""
