from types import SimpleNamespace

from app.services.chat import (
    PLACEHOLDER_CODE,
    build_placeholder_content,
    format_branch_for_model,
)
from app.services.parametric_parameters import parse_parameters


def main() -> None:
    script = """// Main dimensions
width = 40; // [10:1:120]
enabled = true;
/* [Appearance] */
// Color choice
body_color = "SteelBlue"; // [SteelBlue:Steel Blue,Tomato:Tomato]
module box() { cube([width, width, width]); }
ignored = 5;
"""
    parameters = parse_parameters(script)
    names = [parameter["name"] for parameter in parameters]

    assert names == ["width", "enabled", "body_color"], names
    assert parameters[0]["range"] == {"min": 10, "max": 120, "step": 1}
    assert parameters[1]["type"] == "boolean"
    assert parameters[2]["group"] == "Appearance"
    assert parameters[2]["description"] == "Color choice"
    assert parameters[2]["options"] == [
        {"value": "SteelBlue", "label": "Steel Blue"},
        {"value": "Tomato", "label": "Tomato"},
    ]

    placeholder_parameters = build_placeholder_content("fast", step=2)["artifact"][
        "parameters"
    ]
    placeholder_names = {parameter["name"] for parameter in placeholder_parameters}
    assert {"width", "depth", "height", "body_color", "$fn"} <= placeholder_names
    assert parse_parameters(PLACEHOLDER_CODE) == placeholder_parameters

    context = format_branch_for_model(
        [
            SimpleNamespace(role="user", content={"text": "make a box"}),
            SimpleNamespace(
                role="assistant",
                content={"artifact": {"code": PLACEHOLDER_CODE}},
            ),
        ]
    )
    assert context[0] == {"role": "user", "content": "make a box"}
    assert context[1] == {"role": "assistant", "content": PLACEHOLDER_CODE}


if __name__ == "__main__":
    main()
