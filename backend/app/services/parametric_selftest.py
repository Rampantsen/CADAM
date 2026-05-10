from types import SimpleNamespace

from app.services.chat import (
    PLACEHOLDER_CODE,
    build_placeholder_content,
    format_branch_for_model,
)
from app.services.parametric_parameters import parse_parameters
from app.services.parametric_parts import parse_articulations, parse_parts


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
    assert all(
        parameter["name"] != "cadam_export_part"
        for parameter in parse_parameters('cadam_export_part = "assembly";\n')
    )

    part_script = """cadam_export_part = "assembly";
// @cadam_part id=body name="Body" module=part_body parent=root color=body_color role=shell
module part_body() { cube([10, 10, 10]); }
// @cadam_part id=left_door name="Left Door" module=part_left_door parent=body color=door_color role=door
module part_left_door() { cube([4, 1, 9]); }
// @cadam_articulation id=left_door_hinge part=left_door parent=body type=hinge axis=[0,0,1] origin=[-5,-5,0] range=[0,110] default=0
module cadam_assembly() { part_body(); part_left_door(); }
module cadam_render_part(part_id) {
  if (part_id == "body") part_body();
  else if (part_id == "left_door") part_left_door();
  else cadam_assembly();
}
cadam_render_part(cadam_export_part);
"""
    parts = parse_parts(part_script)
    assert [part["id"] for part in parts] == ["body", "left_door"]
    assert parts[1]["parentId"] == "body"
    assert parts[1]["module"] == "part_left_door"
    articulations = parse_articulations(part_script)
    assert articulations == [
        {
            "id": "left_door_hinge",
            "partId": "left_door",
            "type": "hinge",
            "parentId": "body",
            "axis": [0, 0, 1],
            "origin": [-5, -5, 0],
            "range": [0, 110],
            "defaultValue": 0,
        }
    ]

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
