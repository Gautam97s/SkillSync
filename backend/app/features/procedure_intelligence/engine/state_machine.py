_current_step = "step_1"


STEP_FLOW = {
    "step_1": "step_2",
    "step_2": "step_3",
    "step_3": "completed",
    "completed": "completed",
}


def next_step(*, valid: bool) -> str:
    global _current_step
    if valid:
        _current_step = STEP_FLOW[_current_step]
    return _current_step
