"""Small, dependency-free parser for the five-field cron form used by automations.

The scheduler deliberately does not pull in ``croniter``.  Selenyx only needs
the conventional minute/hour/day-of-month/month/day-of-week form, and keeping
this parser local avoids bringing ``python-dateutil`` into the desktop
sidecar.  Supported field fragments are ``*``, ``*/n``, a number, ``a-b``,
``a-b/n`` and comma-separated combinations of them.
"""

from __future__ import annotations

from datetime import datetime, time, timedelta
from typing import TypeAlias

CronFields: TypeAlias = tuple[set[int], set[int], set[int], set[int], set[int]]

_FIELD_RANGES = (
    (0, 59),   # minute
    (0, 23),   # hour
    (1, 31),   # day of month
    (1, 12),   # month
    (0, 7),    # day of week (0/7 are Sunday)
)


def _parse_field(spec: str, lo: int, hi: int) -> set[int] | None:
    """Return the finite set selected by one cron field, or ``None`` if invalid."""
    values: set[int] = set()
    for raw_part in spec.split(","):
        part = raw_part.strip()
        if not part:
            return None

        step = 1
        if "/" in part:
            base, separator, step_text = part.partition("/")
            # A second slash is never a valid five-field cron fragment.
            if not separator or "/" in step_text or (base != "*" and "-" not in base):
                return None
            try:
                step = int(step_text)
            except ValueError:
                return None
            if step < 1:
                return None
            part = base

        if part == "*":
            start, end = lo, hi
        elif "-" in part:
            start_text, separator, end_text = part.partition("-")
            if not separator or "-" in end_text:
                return None
            try:
                start, end = int(start_text), int(end_text)
            except ValueError:
                return None
            if start > end:
                return None
        else:
            try:
                start = end = int(part)
            except ValueError:
                return None

        if start < lo or end > hi:
            return None
        values.update(range(start, end + 1, step))
    return values or None


def parse_cron(expr: str) -> CronFields | None:
    """Parse a five-field cron expression; return ``None`` for invalid input.

    Day-of-week follows common cron convention: both ``0`` and ``7`` mean
    Sunday.  The returned fields are intentionally plain sets so callers can
    perform fast membership checks without another dependency.
    """
    fields = (expr or "").split()
    if len(fields) != 5:
        return None
    parsed = [_parse_field(field, *field_range) for field, field_range in zip(fields, _FIELD_RANGES)]
    if any(field is None for field in parsed):
        return None

    minutes, hours, doms, months, raw_dows = parsed
    # The ``any`` guard above narrows this for runtime; the explicit copies
    # keep the result independent from any intermediate parser state.
    if minutes is None or hours is None or doms is None or months is None or raw_dows is None:
        return None
    dows = set(raw_dows)
    if 7 in dows:
        dows.discard(7)
        dows.add(0)
    return set(minutes), set(hours), set(doms), set(months), dows


def _date_matches(fields: CronFields, value: datetime) -> bool:
    """Check the date portion, including cron's DOM/DOW OR rule."""
    _minutes, _hours, doms, months, dows = fields
    if value.month not in months:
        return False
    dom_restricted = doms != set(range(1, 32))
    dow_restricted = dows != set(range(0, 7))
    dom_hit = value.day in doms
    # datetime.weekday() is Monday=0; cron is Sunday=0.
    dow_hit = ((value.weekday() + 1) % 7) in dows
    if dom_restricted and dow_restricted:
        return dom_hit or dow_hit
    return dom_hit and dow_hit


def _matches_fields(fields: CronFields, value: datetime) -> bool:
    minutes, hours, _doms, _months, _dows = fields
    return value.minute in minutes and value.hour in hours and _date_matches(fields, value)


def cron_matches(expr: str, value: datetime) -> bool:
    """Whether ``value`` matches ``expr`` at minute precision."""
    fields = parse_cron(expr)
    return fields is not None and _matches_fields(fields, value)


def prev_fire(
    expr: str,
    now: datetime,
    after: datetime | None = None,
    max_lookback_days: int = 1462,
) -> datetime | None:
    """Return the latest scheduled minute between ``after`` and ``now``.

    ``after`` is an inclusive lower boundary; callers checking for a *missed*
    run should compare the result to their actual last-run timestamp. A
    four-year default covers every possible schedule expressible without a
    year field (including February 29), while the date-first search avoids
    scanning hundreds of thousands of minutes on startup.
    """
    fields = parse_cron(expr)
    if fields is None or max_lookback_days < 0:
        return None

    cursor = now.replace(second=0, microsecond=0)
    floor = cursor - timedelta(days=max_lookback_days)
    if after is not None and after > floor:
        # Cron has minute precision, so retain the boundary's minute.  This
        # lets the scheduler make the stricter "missed after last run" check
        # using the original timestamp (which may include seconds).
        floor = after.replace(second=0, microsecond=0)

    minutes, hours, _doms, _months, _dows = fields
    ordered_hours = sorted(hours, reverse=True)
    ordered_minutes = sorted(minutes, reverse=True)
    day = cursor.date()
    floor_day = floor.date()

    while day >= floor_day:
        probe = datetime.combine(day, time.min, tzinfo=now.tzinfo)
        if _date_matches(fields, probe):
            for hour in ordered_hours:
                for minute in ordered_minutes:
                    candidate = datetime.combine(day, time(hour, minute), tzinfo=now.tzinfo)
                    if candidate > cursor:
                        continue
                    if candidate < floor:
                        # Earlier candidates, hours, and days cannot clear the
                        # lower boundary, so the search is complete.
                        return None
                    return candidate
        day -= timedelta(days=1)
    return None


__all__ = ["CronFields", "parse_cron", "cron_matches", "prev_fire"]
