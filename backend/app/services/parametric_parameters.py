import re
from typing import Any


def parse_parameters(script: str) -> list[dict[str, Any]]:
    """Parse CADAM/OpenSCAD customizer parameters from top-level assignments.

    This is a Python port of supabase/functions/_shared/parseParameter.ts. It
    intentionally keeps the same regex-based scope: only assignments before the
    first top-level module/function declaration are parameter candidates.
    """

    script = re.split(
        r"^(module |function )", script, maxsplit=1, flags=re.MULTILINE
    )[0]

    parameters: dict[str, dict[str, Any]] = {}
    parameter_regex = re.compile(
        r"^([a-z0-9A-Z_$]+)\s*=\s*([^;]+);[\t\f\x0b ]*(//[^\n]*)?",
        re.MULTILINE,
    )
    group_regex = re.compile(r"^/\*\s*\[([^\]]+)\]\s*\*/", re.MULTILINE)

    group_sections: list[tuple[str, str]] = []
    matches = list(group_regex.finditer(script))
    if matches:
        group_sections.append(("", script[: matches[0].start()]))
        for index, match in enumerate(matches):
            end = (
                matches[index + 1].start()
                if index + 1 < len(matches)
                else len(script)
            )
            group_sections.append(
                (match.group(1).strip(), script[match.start() : end])
            )
    else:
        group_sections.append(("", script))

    for group, code in group_sections:
        for match in parameter_regex.finditer(code):
            name = match.group(1)
            raw_value = match.group(2)
            type_and_value = _convert_type(raw_value)
            if type_and_value is None:
                continue

            if (
                raw_value not in {"true", "false"}
                and (re.match(r"^[a-zA-Z_]", raw_value) or len(raw_value.split("\n")) > 1)
            ):
                continue

            description: str | None = None
            options: list[dict[str, str | int | float]] = []
            value_range: dict[str, int | float] = {}

            raw_comment_match = match.group(3)
            if raw_comment_match:
                raw_comment = re.sub(r"^//\s*", "", raw_comment_match).strip()
                cleaned = re.sub(r"^\[+|\]+$", "", raw_comment)

                if _is_js_number(raw_comment):
                    if type_and_value["type"] == "string":
                        value_range = {"max": _parse_js_number(cleaned)}
                    else:
                        value_range = {"step": _parse_js_number(cleaned)}
                elif raw_comment.startswith("[") and "," in cleaned:
                    for option in cleaned.strip().split(","):
                        parts = option.strip().split(":")
                        option_value: str | int | float = parts[0]
                        label = parts[1] if len(parts) > 1 else None
                        if type_and_value["type"] == "number":
                            option_value = _parse_js_number(option_value)
                        parsed_option: dict[str, str | int | float] = {"value": option_value}
                        if label is not None:
                            parsed_option["label"] = label
                        options.append(parsed_option)
                elif re.search(r"([0-9]+:?)+", cleaned):
                    range_parts = cleaned.strip().split(":")
                    min_value = range_parts[0] if len(range_parts) > 0 else ""
                    max_or_step = range_parts[1] if len(range_parts) > 1 else ""
                    max_value = range_parts[2] if len(range_parts) > 2 else ""

                    if min_value and (max_or_step or max_value):
                        value_range = {"min": _parse_js_number(min_value)}
                    if max_value or max_or_step or min_value:
                        value_range = {
                            **value_range,
                            "max": _parse_js_number(max_value or max_or_step or min_value),
                        }
                    if max_value and max_or_step:
                        value_range = {**value_range, "step": _parse_js_number(max_or_step)}

            above = re.split(
                f"^{re.escape(match.group(0))}",
                script,
                maxsplit=1,
                flags=re.MULTILINE,
            )[0]
            if above.endswith("\n"):
                above = above[:-1]
            last_line_before_definition = above.split("\n")[-1]
            if last_line_before_definition.strip().startswith("//"):
                description = re.sub(r"^///*\s*", "", last_line_before_definition)
                if len(description) == 0:
                    description = None

            display_name = _display_name(name)
            if name == "$fn":
                display_name = "Resolution"

            parameters[name] = {
                "description": description,
                "group": group,
                "name": name,
                "displayName": display_name,
                "defaultValue": type_and_value["value"],
                "range": value_range,
                "options": options,
                **type_and_value,
            }

    return list(parameters.values())


def _convert_type(raw_value: str) -> dict[str, Any] | None:
    if re.match(r"^-?\d+(\.\d+)?$", raw_value):
        return {"value": _parse_js_number(raw_value), "type": "number"}
    if raw_value in {"true", "false"}:
        return {"value": raw_value == "true", "type": "boolean"}
    if re.match(r'^".*"$', raw_value):
        return {"value": re.sub(r'^"(.*)"$', r"\1", raw_value), "type": "string"}
    if raw_value.startswith("[") and raw_value.endswith("]"):
        array_value = [item.strip() for item in raw_value[1:-1].split(",")]
        if len(array_value) > 0 and all(
            re.match(r"^\d+(\.\d+)?$", item) for item in array_value
        ):
            return {
                "value": [_parse_js_number(item) for item in array_value],
                "type": "number[]",
            }
        if len(array_value) > 0 and all(re.match(r'^".*"$', item) for item in array_value):
            return {"value": [item[1:-1] for item in array_value], "type": "string[]"}
        if len(array_value) > 0 and all(item in {"true", "false"} for item in array_value):
            return {"value": [item == "true" for item in array_value], "type": "boolean[]"}
        return None
    return None


def _display_name(name: str) -> str:
    words = name.replace("_", " ").split(" ")
    return " ".join(word[:1].upper() + word[1:] for word in words)


def _is_js_number(value: str) -> bool:
    try:
        _parse_js_number(value)
    except ValueError:
        return False
    return value.strip() != ""


def _parse_js_number(value: str) -> int | float:
    parsed = float(value)
    if parsed.is_integer():
        return int(parsed)
    return parsed
