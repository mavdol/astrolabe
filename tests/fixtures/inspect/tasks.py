"""Small Inspect tasks run against the mock model to produce the importer's test logs."""

from inspect_ai import Task, task
from inspect_ai.dataset import Sample
from inspect_ai.scorer import CORRECT, NOANSWER, PARTIAL, Score, accuracy, match, mean, model_graded_qa, scorer
from inspect_ai.solver import generate, solver


@solver
def answer_with_skill(skill: float):
    """Calls the model, then answers correctly on a fixed share of the samples, so that candidates differ."""

    async def solve(state, generate_fn):
        state = await generate_fn(state)
        number = int(str(state.sample_id).lstrip("q"))
        knows_it = (number * 7 + state.epoch * 3) % 10 < skill * 10
        state.output.completion = state.target.text if knows_it else "I am not sure"
        return state

    return solve


@task
def arithmetic(skill: float = 0.5):
    return Task(
        dataset=[Sample(id=f"q{n}", input=f"What is {n} + {n}?", target=str(2 * n)) for n in range(1, 7)],
        solver=answer_with_skill(skill),
        scorer=match(),
    )


@solver
def crashes_on_boom():
    async def solve(state, generate_fn):
        if state.sample_id == "boom":
            raise RuntimeError("tool crashed")
        return await generate_fn(state)

    return solve


@scorer(metrics=[accuracy()])
def graded():
    async def score(state, target):
        return Score(value={"q1": CORRECT, "q2": PARTIAL, "q3": NOANSWER}.get(state.sample_id, 0.25))

    return score


@scorer(metrics={"*": [mean()]})
def rubric():
    async def score(state, target):
        return Score(value={"helpful": 0.8, "safe": True})

    return score


@task
def edge_cases():
    """An errored sample, partial and missing answers, a scorer with several values, and a grader that cannot score."""
    return Task(
        dataset=[Sample(id=sample_id, input="hi", target="x") for sample_id in ["q1", "q2", "q3", "boom"]],
        solver=crashes_on_boom(),
        scorer=[graded(), rubric(), model_graded_qa()],
    )


@task
def limited():
    return Task(dataset=[Sample(id=1, input="hi", target="x")], solver=generate(), scorer=graded(), message_limit=1)
