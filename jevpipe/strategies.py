"""Turn raw Jev answers into one intent per ticket, two ways.

flat    One 77-way Choice. Jev picks directly.
fanout  P(intent) = P(group) * P(intent | group), using the group question and
        the nine within-group questions asked speculatively in the same call.
"""

from __future__ import annotations

from .questions import (ALL_INTENTS, FLAT_QUESTION_ID, GROUP_QUESTION_ID,
                        INTENT_GROUPS, SUBGROUP_PREFIX)

N_INTENTS = len(ALL_INTENTS)


def choice_confidence(p_max: float, n: int) -> float:
    """TypeSafe's documented Choice confidence: (p_max - 1/n) / (1 - 1/n)."""
    return max(0.0, (p_max - 1 / n) / (1 - 1 / n))


def _summarize(dist: dict[str, float]) -> tuple[str, float, float, float]:
    ranked = sorted(dist.items(), key=lambda kv: kv[1], reverse=True)
    top, p1 = ranked[0]
    p2 = ranked[1][1] if len(ranked) > 1 else 0.0
    return top, p1, p2, choice_confidence(p1, len(dist))


def flat(answers: dict[str, dict]) -> dict:
    a = answers[FLAT_QUESTION_ID]
    intent, p1, p2, _ = _summarize(a["probabilities"])
    # Use Jev's own confidence for flat; it should match the documented formula.
    return {"strategy": "flat", "intent": intent, "p_intent": p1, "p_second": p2,
            "confidence": float(a["confidence"])}


def fanout(answers: dict[str, dict]) -> dict:
    p_group = answers[GROUP_QUESTION_ID]["probabilities"]
    joint: dict[str, float] = {}
    for group, intents in INTENT_GROUPS.items():
        within = answers[SUBGROUP_PREFIX + group]["probabilities"]
        for intent in intents:
            joint[intent] = p_group.get(group, 0.0) * within.get(intent, 0.0)
    total = sum(joint.values()) or 1.0
    joint = {k: v / total for k, v in joint.items()}
    intent, p1, p2, conf = _summarize(joint)
    return {"strategy": "fanout", "intent": intent, "p_intent": p1, "p_second": p2,
            "confidence": conf}


STRATEGIES = (flat, fanout)
