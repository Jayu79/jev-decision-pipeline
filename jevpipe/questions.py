"""Every question sent to Jev, and every threshold applied to its answers.

TypeSafe's docs recommend keeping questions and thresholds in one file so they
are easy to review. This is that file. Changing anything here changes
QUESTION_VERSION, so old and new decisions never mix in the warehouse.
"""

from __future__ import annotations

import hashlib
import json

from typesafe_sdk import Choice

# ---------------------------------------------------------------------------
# Banking77 intents, grouped for the fan-out strategy.
# Keys are the dataset's exact label strings (including its odd casing).
# ---------------------------------------------------------------------------
INTENT_GROUPS: dict[str, dict[str, str]] = {
    "card_delivery": {
        "card_arrival": "Asking where their new card is or when it will arrive",
        "card_delivery_estimate": "Asking how long card delivery usually takes",
        "get_physical_card": "Wants a physical card when they only have a virtual one",
        "order_physical_card": "Wants to order a physical card, including fees or options",
        "getting_spare_card": "Wants an additional or spare card on the account",
        "card_about_to_expire": "Card is expiring soon; asking about replacement",
        "activate_my_card": "Needs to activate a card they received",
        "card_linking": "Wants to link or add an existing card to the app",
    },
    "card_problems": {
        "card_not_working": "Physical card stopped working in general",
        "contactless_not_working": "Contactless payments specifically are failing",
        "card_acceptance": "Asking where or whether the card is accepted",
        "card_swallowed": "An ATM kept or swallowed their card",
        "lost_or_stolen_card": "Card was lost or stolen",
        "compromised_card": "Suspects card details were compromised or used by someone else",
        "pin_blocked": "PIN is blocked after wrong attempts",
        "change_pin": "Wants to change their PIN",
        "passcode_forgotten": "Forgot the app passcode",
        "lost_or_stolen_phone": "Phone with the app was lost or stolen",
    },
    "virtual_cards_and_wallets": {
        "getting_virtual_card": "Wants a virtual card",
        "get_disposable_virtual_card": "Wants a disposable (single-use) virtual card",
        "disposable_card_limits": "Asking about limits on disposable virtual cards",
        "virtual_card_not_working": "Virtual card is not working",
        "visa_or_mastercard": "Asking whether the card is Visa or Mastercard",
        "supported_cards_and_currencies": "Asking which cards or currencies are supported",
        "apple_pay_or_google_pay": "Asking about Apple Pay or Google Pay",
    },
    "card_payments": {
        "card_payment_fee_charged": "Was charged a fee on a card payment",
        "card_payment_not_recognised": "Does not recognise a card payment on the account",
        "card_payment_wrong_exchange_rate": "A card payment used the wrong exchange rate",
        "pending_card_payment": "A card payment is still pending",
        "declined_card_payment": "A card payment was declined",
        "reverted_card_payment?": "A card payment was reverted or returned",
        "transaction_charged_twice": "The same transaction was charged twice",
        "extra_charge_on_statement": "An unexpected extra charge appears on the statement",
        "direct_debit_payment_not_recognised": "Does not recognise a direct debit",
        "request_refund": "Wants to request a refund for a purchase",
        "Refund_not_showing_up": "A refund they expected has not appeared",
    },
    "cash_and_atm": {
        "atm_support": "Asking where or which ATMs they can use",
        "pending_cash_withdrawal": "A cash withdrawal is still pending",
        "declined_cash_withdrawal": "A cash withdrawal was declined",
        "wrong_amount_of_cash_received": "ATM gave the wrong amount of cash",
        "cash_withdrawal_charge": "Was charged a fee for withdrawing cash",
        "cash_withdrawal_not_recognised": "Does not recognise a cash withdrawal",
        "wrong_exchange_rate_for_cash_withdrawal": "Cash withdrawal used the wrong exchange rate",
    },
    "top_up": {
        "automatic_top_up": "Asking about automatic top-ups",
        "top_up_by_bank_transfer_charge": "Asking about fees for topping up by bank transfer",
        "pending_top_up": "A top-up is still pending",
        "top_up_limits": "Asking about top-up limits",
        "top_up_reverted": "A top-up was reverted",
        "topping_up_by_card": "Asking how to top up with a card",
        "top_up_by_cash_or_cheque": "Asking about topping up with cash or a cheque",
        "top_up_failed": "A top-up failed",
        "top_up_by_card_charge": "Was charged a fee for topping up by card",
        "verify_top_up": "Asked to verify a top-up, e.g. a verification code",
        "balance_not_updated_after_cheque_or_cash_deposit": "Balance did not update after a cash or cheque deposit",
    },
    "transfers": {
        "cancel_transfer": "Wants to cancel a transfer",
        "transfer_not_received_by_recipient": "Sent a transfer the recipient has not received",
        "declined_transfer": "A transfer was declined",
        "pending_transfer": "A transfer is still pending",
        "transfer_timing": "Asking how long transfers take",
        "beneficiary_not_allowed": "Cannot add or pay a beneficiary",
        "transfer_fee_charged": "Was charged a fee on a transfer",
        "receiving_money": "Asking how to receive money into the account",
        "failed_transfer": "A transfer failed",
        "transfer_into_account": "Asking how to transfer money into their own account",
        "balance_not_updated_after_bank_transfer": "Balance did not update after a bank transfer arrived",
    },
    "currency_exchange": {
        "exchange_rate": "Asking what exchange rate is used",
        "exchange_via_app": "Wants to exchange currency in the app",
        "exchange_charge": "Was charged a fee for currency exchange",
        "fiat_currency_support": "Asking which currencies can be held or exchanged",
        "country_support": "Asking which countries the service supports",
    },
    "account_and_identity": {
        "age_limit": "Asking about minimum age requirements",
        "edit_personal_details": "Wants to change personal details",
        "why_verify_identity": "Asking why identity verification is needed",
        "unable_to_verify_identity": "Identity verification is failing",
        "verify_my_identity": "Asking how to verify their identity",
        "verify_source_of_funds": "Asked to verify the source of their funds",
        "terminate_account": "Wants to close their account",
    },
}

GROUP_DESCRIPTIONS: dict[str, str] = {
    "card_delivery": "Getting, ordering, activating or linking a card",
    "card_problems": "A physical card, PIN, passcode or phone has a problem",
    "virtual_cards_and_wallets": "Virtual or disposable cards, card networks, mobile wallets",
    "card_payments": "Purchases made with the card, their fees, disputes and refunds",
    "cash_and_atm": "Withdrawing cash and using ATMs",
    "top_up": "Adding money to the account (top-ups, deposits)",
    "transfers": "Sending or receiving bank transfers",
    "currency_exchange": "Exchange rates, currencies and supported countries",
    "account_and_identity": "Account details, identity checks, age, closing the account",
}

ALL_INTENTS: dict[str, str] = {k: v for g in INTENT_GROUPS.values() for k, v in g.items()}
INTENT_TO_GROUP: dict[str, str] = {i: g for g, intents in INTENT_GROUPS.items() for i in intents}

_INSTRUCTIONS = {
    "question": "Which intent best describes `message`?",
    "context": "A customer message sent to a digital bank's support channel.",
}

FLAT_QUESTION_ID = "intent_flat"
GROUP_QUESTION_ID = "group"
SUBGROUP_PREFIX = "intent_in__"


def build_questions() -> dict[str, Choice]:
    """All questions for one ticket. They run in parallel, in one request."""
    questions: dict[str, Choice] = {
        FLAT_QUESTION_ID: Choice(instructions=_INSTRUCTIONS, criteria=ALL_INTENTS),
        GROUP_QUESTION_ID: Choice(
            instructions={**_INSTRUCTIONS, "question": "Which area does `message` belong to?"},
            criteria=GROUP_DESCRIPTIONS,
        ),
    }
    # Speculative fan-out: ask the within-group question for every group up
    # front, so the hierarchy costs no extra round trip.
    for group, intents in INTENT_GROUPS.items():
        questions[SUBGROUP_PREFIX + group] = Choice(
            instructions={
                **_INSTRUCTIONS,
                "assume": f"The message is about: {GROUP_DESCRIPTIONS[group]}.",
            },
            criteria=intents,
        )
    return questions


def _version() -> str:
    spec = {
        "instructions": _INSTRUCTIONS,
        "groups": INTENT_GROUPS,
        "group_descriptions": GROUP_DESCRIPTIONS,
    }
    return hashlib.sha256(json.dumps(spec, sort_keys=True).encode()).hexdigest()[:12]


QUESTION_VERSION = _version()

# ---------------------------------------------------------------------------
# Thresholds. Report tables show what each one buys.
# ---------------------------------------------------------------------------
ACCURACY_TARGETS = (0.90, 0.95, 0.98)   # report: confidence needed to reach each
CALIBRATION_BINS = 10

assert len(ALL_INTENTS) == 77, len(ALL_INTENTS)
