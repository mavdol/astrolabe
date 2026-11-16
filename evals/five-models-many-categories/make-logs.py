"""Small Inspect tasks, one per category, run against the mock model to write this case's logs.

Each candidate answers correctly with a fixed probability that varies a little by category, so the
models differ by a few points overall and any one of them can lead a category by chance.
"""

import random

from inspect_ai import Task, task
from inspect_ai.dataset import Sample
from inspect_ai.scorer import match
from inspect_ai.solver import generate, solver

@solver
def answer_with_skill(skill: float, seed: int):
    async def solve(state, generate_fn):
        state = await generate_fn(state)
        draw = random.Random(f"{seed}-{state.sample_id}-{state.epoch}").random()
        state.output.completion = state.target.text if draw < skill else "I could not find that in our policies"
        return state

    return solve


def category_task(category: str, skill: float, seed: int) -> Task:
    return Task(
        dataset=[Sample(id=f"{category}-{n:02d}", input=f"{category} question {n}", target=f"answer {category} {n}") for n in range(1, 26)],
        solver=answer_with_skill(skill, seed),
        scorer=match(),
        name=category,
    )


@task
def billing(skill: float = 0.6, seed: int = 0):
    return category_task("billing", skill, seed)

@task
def shipping(skill: float = 0.6, seed: int = 0):
    return category_task("shipping", skill, seed)

@task
def returns(skill: float = 0.6, seed: int = 0):
    return category_task("returns", skill, seed)

@task
def accounts(skill: float = 0.6, seed: int = 0):
    return category_task("accounts", skill, seed)

@task
def warranty(skill: float = 0.6, seed: int = 0):
    return category_task("warranty", skill, seed)

@task
def privacy(skill: float = 0.6, seed: int = 0):
    return category_task("privacy", skill, seed)

@task
def outages(skill: float = 0.6, seed: int = 0):
    return category_task("outages", skill, seed)

@task
def pricing(skill: float = 0.6, seed: int = 0):
    return category_task("pricing", skill, seed)
