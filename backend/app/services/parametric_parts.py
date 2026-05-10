import ast
import re
from typing import Any


PART_ANNOTATION_RE = re.compile(r"^\s*//\s*@cadam_part\s+(.+)$", re.MULTILINE)
ARTICULATION_ANNOTATION_RE = re.compile(
    r"^\s*//\s*@cadam_articulation\s+(.+)$", re.MULTILINE
)
KEY_VALUE_RE = re.compile(
    r"([a-zA-Z_][a-zA-Z0-9_]*)=("
    r"\"(?:\\.|[^\"])*\"|"
    r"\[(?:[^\[\]]*)\]|"
    r"[^\s]+"
    r")"
)


def parse_parts(script: str) -> list[dict[str, Any]]:
    """Parse CADAM part annotations from generated OpenSCAD code."""

    parts: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for match in PART_ANNOTATION_RE.finditer(script):
        attrs = _parse_attrs(match.group(1))
        part_id = _clean_identifier(attrs.get("id"))
        module = _clean_identifier(attrs.get("module"))
        if not part_id or not module or part_id in seen_ids:
            continue

        part: dict[str, Any] = {
            "id": part_id,
            "name": str(attrs.get("name") or _display_name(part_id)),
            "module": module,
            "parentId": _normalize_parent(attrs.get("parent")),
        }
        color = attrs.get("color")
        if isinstance(color, str) and color:
            part["color"] = color
        role = attrs.get("role")
        if isinstance(role, str) and role:
            part["role"] = role
        parts.append(part)
        seen_ids.add(part_id)

    return parts


def parse_articulations(script: str) -> list[dict[str, Any]]:
    """Parse simple articulation metadata for downstream GLB/editor use."""

    articulations: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for match in ARTICULATION_ANNOTATION_RE.finditer(script):
        attrs = _parse_attrs(match.group(1))
        articulation_id = _clean_identifier(attrs.get("id"))
        part_id = _clean_identifier(attrs.get("part"))
        articulation_type = attrs.get("type")
        if (
            not articulation_id
            or not part_id
            or articulation_id in seen_ids
            or articulation_type not in {"hinge", "slider", "revolute", "prismatic"}
        ):
            continue

        articulation: dict[str, Any] = {
            "id": articulation_id,
            "partId": part_id,
            "type": articulation_type,
        }
        parent_id = _normalize_parent(attrs.get("parent"))
        if parent_id is not None:
            articulation["parentId"] = parent_id
        axis = _number_list(attrs.get("axis"), expected=3)
        if axis is not None:
            articulation["axis"] = axis
        origin = _number_list(attrs.get("origin"), expected=3)
        if origin is not None:
            articulation["origin"] = origin
        value_range = _number_list(attrs.get("range"), expected=2)
        if value_range is not None:
            articulation["range"] = value_range
        default_value = _number(attrs.get("default"))
        if default_value is not None:
            articulation["defaultValue"] = default_value

        articulations.append(articulation)
        seen_ids.add(articulation_id)

    return articulations


def _parse_attrs(raw: str) -> dict[str, Any]:
    attrs: dict[str, Any] = {}
    for key, value in KEY_VALUE_RE.findall(raw):
        attrs[key] = _parse_value(value)
    return attrs


def _parse_value(raw: str) -> Any:
    if raw.startswith('"') and raw.endswith('"'):
        try:
            return ast.literal_eval(raw)
        except (SyntaxError, ValueError):
            return raw[1:-1]
    if raw.startswith("[") and raw.endswith("]"):
        try:
            value = ast.literal_eval(raw)
            return value if isinstance(value, list) else raw
        except (SyntaxError, ValueError):
            return raw
    parsed_number = _number(raw)
    if parsed_number is not None:
        return parsed_number
    return raw


def _number(value: Any) -> int | float | None:
    if isinstance(value, (int, float)):
        return value
    if not isinstance(value, str):
        return None
    try:
        parsed = float(value)
    except ValueError:
        return None
    return int(parsed) if parsed.is_integer() else parsed


def _number_list(value: Any, expected: int) -> list[int | float] | None:
    if not isinstance(value, list) or len(value) != expected:
        return None
    numbers = [_number(item) for item in value]
    if any(item is None for item in numbers):
        return None
    return [item for item in numbers if item is not None]


def _clean_identifier(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", cleaned):
        return None
    return cleaned


def _normalize_parent(value: Any) -> str | None:
    parent = _clean_identifier(value)
    if parent in {None, "root", "none", "null"}:
        return None
    return parent


def _display_name(value: str) -> str:
    return " ".join(part[:1].upper() + part[1:] for part in value.split("_"))
