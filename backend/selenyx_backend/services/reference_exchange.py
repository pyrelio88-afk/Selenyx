"""Safe local import/export for Selenyx reference-library records.

JSON is the lossless interchange format. BibTeX and RIS intentionally map the
portable bibliographic subset, while carrying a Selenyx local id so a file
exported by this app can be imported repeatedly without creating duplicates.
"""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Iterable


MAX_EXCHANGE_RECORDS = 10_000

_BIB_TO_ITEM = {
    "article": "journalArticle",
    "book": "book",
    "booklet": "book",
    "inbook": "bookSection",
    "incollection": "bookSection",
    "inproceedings": "conferencePaper",
    "conference": "conferencePaper",
    "phdthesis": "thesis",
    "mastersthesis": "thesis",
    "techreport": "report",
    "manual": "report",
    "online": "webpage",
    "unpublished": "preprint",
    "dataset": "dataset",
    "software": "software",
    "patent": "patent",
    "standard": "standard",
    "misc": "webpage",
}
_ITEM_TO_BIB = {
    "journalArticle": "article",
    "book": "book",
    "bookSection": "incollection",
    "conferencePaper": "inproceedings",
    "thesis": "phdthesis",
    "report": "techreport",
    "webpage": "online",
    "preprint": "unpublished",
    "dataset": "dataset",
    "software": "software",
    "patent": "patent",
    "standard": "standard",
    "magazineArticle": "article",
    "newspaperArticle": "article",
}
_RIS_TO_ITEM = {
    "JOUR": "journalArticle",
    "BOOK": "book",
    "CHAP": "bookSection",
    "CONF": "conferencePaper",
    "CPAPER": "conferencePaper",
    "THES": "thesis",
    "RPRT": "report",
    "ELEC": "webpage",
    "GEN": "webpage",
    "UNPB": "preprint",
    "DATA": "dataset",
    "COMP": "software",
    "PAT": "patent",
    "STAND": "standard",
    "MGZN": "magazineArticle",
    "NEWS": "newspaperArticle",
}
_ITEM_TO_RIS = {value: key for key, value in _RIS_TO_ITEM.items()}
_ITEM_TO_RIS.update({"conferencePaper": "CONF", "webpage": "ELEC"})


class ReferenceExchangeError(ValueError):
    """The supplied exchange document is malformed or unsupported."""


def normalize_format(value: str) -> str:
    normalized = value.strip().lower().replace("-", "")
    aliases = {"json": "json", "bib": "bibtex", "bibtex": "bibtex", "ris": "ris"}
    if normalized not in aliases:
        raise ReferenceExchangeError("Supported formats are json, bibtex, and ris")
    return aliases[normalized]


def parse_exchange(format_name: str, data: str) -> list[dict[str, Any]]:
    format_name = normalize_format(format_name)
    if not data.strip():
        raise ReferenceExchangeError("Import data is empty")
    if format_name == "json":
        records = _parse_json(data)
    elif format_name == "bibtex":
        records = _parse_bibtex(data)
    else:
        records = _parse_ris(data)
    if not records:
        raise ReferenceExchangeError(f"No valid {format_name} references were found")
    if len(records) > MAX_EXCHANGE_RECORDS:
        raise ReferenceExchangeError(f"Import exceeds the {MAX_EXCHANGE_RECORDS} reference limit")
    return records


def render_exchange(format_name: str, records: Iterable[dict[str, Any]]) -> str:
    format_name = normalize_format(format_name)
    rows = list(records)
    if format_name == "json":
        internal_fields = {"payload_json", "payload_version", "creators_json", "collections_json", "tags_json"}
        portable_rows = [{key: value for key, value in row.items() if key not in internal_fields} for row in rows]
        return json.dumps(
            {"format": "selenyx-reference-library", "version": 1, "references": portable_rows},
            ensure_ascii=False,
            indent=2,
        ) + "\n"
    if format_name == "bibtex":
        return "\n\n".join(_to_bibtex(row) for row in rows) + ("\n" if rows else "")
    return "\n\n".join(_to_ris(row) for row in rows) + ("\n" if rows else "")


def _parse_json(data: str) -> list[dict[str, Any]]:
    try:
        decoded = json.loads(data)
    except json.JSONDecodeError as exc:
        raise ReferenceExchangeError(f"Invalid JSON at line {exc.lineno}, column {exc.colno}") from exc
    if isinstance(decoded, dict):
        decoded = decoded.get("references")
    if not isinstance(decoded, list):
        raise ReferenceExchangeError("JSON must be an array or an object with a references array")
    if not all(isinstance(row, dict) for row in decoded):
        raise ReferenceExchangeError("Every JSON reference must be an object")
    records: list[dict[str, Any]] = []
    for index, source in enumerate(decoded):
        row = dict(source)
        if not row.get("citeKey") and isinstance(row.get("cite_key"), str):
            row["citeKey"] = row["cite_key"]
        if not row.get("id"):
            if not any(row.get(field) for field in ("doi", "pmid", "citeKey", "title")):
                raise ReferenceExchangeError(f"JSON reference {index + 1} has no id or bibliographic identity")
            row["id"] = _stable_id("json", row)
        records.append(row)
    return records


def _stable_id(format_name: str, payload: dict[str, Any], explicit: str = "") -> str:
    if explicit and re.fullmatch(r"[A-Za-z0-9._:-]{1,160}", explicit):
        return explicit
    identity = (
        str(payload.get("doi") or "").lower().removeprefix("https://doi.org/")
        or str(payload.get("pmid") or "").lower()
        or str(payload.get("citeKey") or "").lower()
        or f"{payload.get('title', '')}|{payload.get('year', '')}".lower()
    )
    digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:24]
    return f"import-{format_name}-{digest}"


def _creator(name: str, order: int, role: str = "author") -> dict[str, Any]:
    name = name.strip()
    if "," in name:
        last, first = (part.strip() for part in name.split(",", 1))
    else:
        parts = name.split()
        first, last = (" ".join(parts[:-1]), parts[-1]) if len(parts) > 1 else ("", name)
    return {"id": f"exchange-{role}-{order}", "firstName": first, "lastName": last, "type": role, "order": order}


def _authors(value: str, role: str, offset: int = 0) -> list[dict[str, Any]]:
    return [
        _creator(name, offset + index, role)
        for index, name in enumerate(re.split(r"\s+and\s+", value, flags=re.IGNORECASE))
        if name.strip()
    ]


def _bib_entries(data: str) -> list[tuple[str, str]]:
    entries: list[tuple[str, str]] = []
    cursor = 0
    while True:
        match = re.search(r"@([A-Za-z]+)\s*([{(])", data[cursor:])
        if not match:
            break
        entry_type = match.group(1).lower()
        start = cursor + match.end()
        open_char = match.group(2)
        close_char = "}" if open_char == "{" else ")"
        depth, quoted, escaped, pos = 1, False, False, start
        while pos < len(data) and depth:
            char = data[pos]
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                quoted = not quoted
            elif not quoted and char == open_char:
                depth += 1
            elif not quoted and char == close_char:
                depth -= 1
            pos += 1
        if depth:
            raise ReferenceExchangeError(f"Unclosed BibTeX entry @{entry_type}")
        if entry_type not in {"comment", "preamble", "string"}:
            entries.append((entry_type, data[start : pos - 1]))
        cursor = pos
    return entries


def _top_level_split(value: str, separator: str = ",") -> list[str]:
    parts: list[str] = []
    start = 0
    depth = 0
    quoted = False
    escaped = False
    for index, char in enumerate(value):
        if escaped:
            escaped = False
            continue
        if char == "\\":
            escaped = True
        elif char == '"':
            quoted = not quoted
        elif not quoted and char == "{":
            depth += 1
        elif not quoted and char == "}":
            depth = max(depth - 1, 0)
        elif not quoted and depth == 0 and char == separator:
            parts.append(value[start:index])
            start = index + 1
    parts.append(value[start:])
    return parts


def _bib_value(value: str) -> str:
    value = value.strip()
    if (value.startswith("{") and value.endswith("}")) or (value.startswith('"') and value.endswith('"')):
        value = value[1:-1]
    # Remove case-protection braces but retain escaped literal braces.
    value = value.replace("\\{", "\0").replace("\\}", "\1")
    value = value.replace("{", "").replace("}", "")
    return value.replace("\0", "{").replace("\1", "}").strip()


def _parse_bibtex(data: str) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for entry_type, body in _bib_entries(data):
        parts = _top_level_split(body)
        cite_key = parts[0].strip()
        fields: dict[str, str] = {}
        for part in parts[1:]:
            if "=" not in part:
                continue
            name, value = part.split("=", 1)
            fields[name.strip().lower()] = _bib_value(value)
        if not cite_key and not fields.get("title"):
            continue
        author_creators = _authors(fields.get("author", ""), "author")
        creators = author_creators + _authors(fields.get("editor", ""), "editor", len(author_creators))
        payload: dict[str, Any] = {
            "citeKey": cite_key,
            "type": _BIB_TO_ITEM.get(entry_type, "journalArticle"),
            "title": fields.get("title", ""),
            "abstract": fields.get("abstract", ""),
            "creators": creators,
            "publication": fields.get("journal") or fields.get("journaltitle") or fields.get("booktitle", ""),
            "volume": fields.get("volume", ""),
            "issue": fields.get("number") or fields.get("issue", ""),
            "pages": fields.get("pages", "").replace("--", "–"),
            "publisher": fields.get("publisher", ""),
            "place": fields.get("address") or fields.get("location", ""),
            "year": fields.get("year") or fields.get("date", "")[:4],
            "date": fields.get("date", ""),
            "doi": re.sub(r"^https?://doi\.org/", "", fields.get("doi", ""), flags=re.IGNORECASE),
            "isbn": fields.get("isbn", ""),
            "issn": fields.get("issn", ""),
            "url": fields.get("url", ""),
            "language": fields.get("language", ""),
            "notes": fields.get("note") or fields.get("annote", ""),
            "tags": [tag.strip() for tag in re.split(r"[,;]", fields.get("keywords") or fields.get("keyword", "")) if tag.strip()],
            "source": "bibtex-import",
        }
        payload["id"] = _stable_id("bibtex", payload, fields.get("selenyxid", ""))
        records.append(payload)
    return records


def _parse_ris(data: str) -> list[dict[str, Any]]:
    entries: list[tuple[str, dict[str, list[str]]]] = []
    current_type = ""
    tags: dict[str, list[str]] = {}
    last_tag = ""
    for line in data.removeprefix("\ufeff").splitlines():
        match = re.match(r"^([A-Z][A-Z0-9]) {2}- ?(.*)$", line)
        if not match:
            if last_tag and line[:1].isspace() and line.strip() and tags.get(last_tag):
                tags[last_tag][-1] += " " + line.strip()
            continue
        tag, value = match.group(1), match.group(2).strip()
        last_tag = tag
        if tag == "TY":
            if current_type or tags:
                raise ReferenceExchangeError("RIS entry started before the previous ER marker")
            current_type = value.upper()
        elif tag == "ER":
            if current_type:
                entries.append((current_type, tags))
            current_type, tags, last_tag = "", {}, ""
        elif current_type:
            tags.setdefault(tag, []).append(value)
    if current_type:
        entries.append((current_type, tags))

    records: list[dict[str, Any]] = []
    for entry_type, fields in entries:
        first = lambda *names: next((fields[name][0] for name in names if fields.get(name)), "")
        authors = fields.get("A1") or fields.get("AU") or []
        editors = fields.get("A2") or fields.get("ED") or []
        creators = [_creator(name, index, "author") for index, name in enumerate(authors)]
        creators += [_creator(name, len(creators) + index, "editor") for index, name in enumerate(editors)]
        date = first("Y1", "DA", "PY")
        year_match = re.search(r"\d{4}", date)
        start_page, end_page = first("SP"), first("EP")
        payload: dict[str, Any] = {
            "type": _RIS_TO_ITEM.get(entry_type, "journalArticle"),
            "title": first("TI", "T1"),
            "abstract": first("AB", "N2"),
            "creators": creators,
            "publication": first("JO", "JF", "T2", "BT"),
            "volume": first("VL"),
            "issue": first("IS"),
            "pages": f"{start_page}–{end_page}" if start_page and end_page else start_page or end_page,
            "publisher": first("PB"),
            "place": first("CY"),
            "year": year_match.group(0) if year_match else "",
            "date": date,
            "doi": re.sub(r"^https?://doi\.org/", "", first("DO"), flags=re.IGNORECASE),
            "pmid": first("AN") if first("DB").lower() == "pubmed" else "",
            "url": first("UR"),
            "language": first("LA"),
            "notes": first("N1"),
            "tags": [keyword.strip() for value in fields.get("KW", []) for keyword in re.split(r"[,;]", value) if keyword.strip()],
            "source": "ris-import",
        }
        if not payload["title"] and not payload["doi"]:
            continue
        payload["id"] = _stable_id("ris", payload, first("ID"))
        records.append(payload)
    return records


def _creators(row: dict[str, Any], role: str) -> list[dict[str, Any]]:
    creators = row.get("creators")
    if not isinstance(creators, list):
        return []
    return [creator for creator in creators if isinstance(creator, dict) and creator.get("type", "author") == role]


def _creator_name(creator: dict[str, Any]) -> str:
    first = str(creator.get("firstName") or "").strip()
    last = str(creator.get("lastName") or "").strip()
    return f"{last}, {first}" if first else last


def _bib_escape(value: Any) -> str:
    return str(value or "").replace("{", "\\{").replace("}", "\\}")


def _ris_value(value: Any) -> str:
    return re.sub(r"[\r\n]+", " ", str(value)).strip()


def _to_bibtex(row: dict[str, Any]) -> str:
    entry_type = _ITEM_TO_BIB.get(str(row.get("type") or ""), "misc")
    key = str(row.get("citeKey") or "").strip()
    if not key:
        first_author = _creators(row, "author")
        key = f"{first_author[0].get('lastName', 'ref') if first_author else 'ref'}{row.get('year', '')}"
    key = re.sub(r"[^A-Za-z0-9._:+/-]+", "_", key).strip("_")[:160] or "ref"
    fields: list[tuple[str, Any]] = [
        ("selenyxid", row.get("id")),
        ("title", row.get("title")),
        ("author", " and ".join(_creator_name(c) for c in _creators(row, "author"))),
        ("editor", " and ".join(_creator_name(c) for c in _creators(row, "editor"))),
        ("year", row.get("year")),
        ("journal" if entry_type == "article" else "booktitle", row.get("publication")),
        ("volume", row.get("volume")),
        ("number", row.get("issue")),
        ("pages", str(row.get("pages") or "").replace("–", "--")),
        ("publisher", row.get("publisher")),
        ("address", row.get("place")),
        ("doi", row.get("doi")),
        ("isbn", row.get("isbn")),
        ("issn", row.get("issn")),
        ("url", row.get("url")),
        ("abstract", row.get("abstract")),
        ("language", row.get("language")),
        ("keywords", ", ".join(row.get("tags") or []) if isinstance(row.get("tags"), list) else ""),
        ("note", row.get("notes")),
    ]
    rendered = [f"  {name} = {{{_bib_escape(value)}}}," for name, value in fields if value not in (None, "", [])]
    return f"@{entry_type}{{{key},\n" + "\n".join(rendered) + "\n}"


def _to_ris(row: dict[str, Any]) -> str:
    lines = [f"TY  - {_ITEM_TO_RIS.get(str(row.get('type') or ''), 'GEN')}"]
    values: list[tuple[str, Any]] = [
        ("ID", row.get("id")),
        ("TI", row.get("title")),
        *[("AU", _creator_name(c)) for c in _creators(row, "author")],
        *[("ED", _creator_name(c)) for c in _creators(row, "editor")],
        ("PY", row.get("year")),
        ("DA", row.get("date")),
        ("JO", row.get("publication")),
        ("VL", row.get("volume")),
        ("IS", row.get("issue")),
        ("PB", row.get("publisher")),
        ("CY", row.get("place")),
        ("DO", row.get("doi")),
        ("UR", row.get("url")),
        ("AB", row.get("abstract")),
        ("LA", row.get("language")),
        ("N1", row.get("notes")),
        *[("KW", tag) for tag in row.get("tags", []) if isinstance(tag, str)],
    ]
    pages = str(row.get("pages") or "")
    page_parts = re.split(r"\s*(?:--|–|—)\s*", pages, maxsplit=1)
    if pages:
        values.extend([("SP", page_parts[0]), ("EP", page_parts[1] if len(page_parts) > 1 else "")])
    lines.extend(
        f"{tag}  - {_ris_value(value)}"
        for tag, value in values
        if value not in (None, "", [])
    )
    lines.append("ER  - ")
    return "\n".join(lines)
