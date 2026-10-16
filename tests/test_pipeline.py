"""Unit tests that run without ClickHouse, Kafka or an API key.

    pytest -q
"""

import asyncio

import pytest

from jevpipe import strategies
from jevpipe.jev import MOCK_MODEL, decide_tickets
from jevpipe.questions import (ALL_INTENTS, GROUP_QUESTION_ID, INTENT_GROUPS,
                               INTENT_TO_GROUP, QUESTION_VERSION, SUBGROUP_PREFIX,
                               build_questions)


def test_every_intent_belongs_to_exactly_one_group():
    flat = [i for g in INTENT_GROUPS.values() for i in g]
    assert len(flat) == len(set(flat)) == 77
    assert set(INTENT_TO_GROUP) == set(ALL_INTENTS)


def test_one_request_carries_flat_group_and_every_subgroup_question():
    qs = build_questions()
    assert len(qs) == 2 + len(INTENT_GROUPS)
    assert all(SUBGROUP_PREFIX + g in qs for g in INTENT_GROUPS)


def test_question_version_is_stable():
    assert len(QUESTION_VERSION) == 12 and QUESTION_VERSION == QUESTION_VERSION.lower()


@pytest.mark.parametrize("probs,expected", [((0.6, 0.3, 0.1), 0.4), ((0.6, 0.2, 0.2), 0.4), ((1 / 3,) * 3, 0.0)])
def test_choice_confidence_matches_typesafe_docs(probs, expected):
    assert strategies.choice_confidence(max(probs), len(probs)) == pytest.approx(expected)


def _answers(group_probs, within):
    a = {GROUP_QUESTION_ID: {"probabilities": group_probs}}
    for g in INTENT_GROUPS:
        a[SUBGROUP_PREFIX + g] = {"probabilities": within.get(g, {})}
    return a


def test_fanout_multiplies_group_and_within_group_probabilities():
    a = _answers({"card_delivery": 0.8, "top_up": 0.2},
                 {"card_delivery": {"card_arrival": 0.5, "activate_my_card": 0.5},
                  "top_up": {"top_up_failed": 1.0}})
    d = strategies.fanout(a)
    assert d["intent"] in {"card_arrival", "activate_my_card"}
    assert d["p_intent"] == pytest.approx(0.4)
    assert d["p_second"] == pytest.approx(0.4)


def test_mock_run_goes_through_real_sdk_and_is_labelled_mock():
    text = "I still have not received my new card"
    [r] = asyncio.run(decide_tickets([("e1", text)], mock=True, truth={text: "card_arrival"}))
    assert r.ok, r.error
    assert r.model_served == MOCK_MODEL           # never mistaken for Jev
    assert r.request_id.startswith("mock-")       # header captured via transport
    assert set(r.answers) == set(build_questions())
    for ans in r.answers.values():
        assert sum(ans["probabilities"].values()) == pytest.approx(1.0)
