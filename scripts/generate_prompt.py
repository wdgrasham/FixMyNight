"""Generate and preview all 6 prompt variants for Stellar HVAC.

Usage:
    python scripts/generate_prompt.py

Outputs the full prompt for each time window + emergency config combination.
No env vars needed — uses hardcoded Stellar HVAC values from seed data.
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class FakeClient:
    """Mimics the Client ORM model with Stellar HVAC seed values."""

    def __init__(self, **overrides):
        from datetime import time

        self.business_name = "Stellar HVAC"
        self.owner_name = "Dan"
        self.agent_name = "Sarah"
        self.industry = "hvac"
        self.industry_config = {
            "industry_label": "HVAC",
            "emergency_examples": [
                "No heat in freezing weather",
                "No cooling in extreme heat",
                "Water leaking from HVAC unit",
                "System completely non-functional",
                "Unusual burning smell from unit",
            ],
            "routine_examples": [
                "Scheduling maintenance",
                "Requesting a quote",
                "Filter replacement question",
                "Thermostat programming help",
            ],
            "agent_name": "Sarah",
            "service_noun": "HVAC service",
            "tech_title": "technician",
        }
        self.emergency_enabled = True
        self.emergency_fee = 150.00
        self.callback_expected_time = time(9, 0)
        self.business_hours_start = time(8, 0)
        self.business_hours_end = time(18, 0)
        self.business_days = [1, 2, 3, 4, 5]
        self.business_hours_emergency_dispatch = True
        self.sleep_window_start = time(22, 0)
        self.sleep_window_end = time(8, 0)
        self.timezone = "America/Chicago"
        self.twilio_number = "+19796525799"

        for k, v in overrides.items():
            setattr(self, k, v)


def main():
    from app.services.prompt_builder import build_sarah_prompt

    variants = [
        {
            "label": "Variant 1: Evening Window, No Fee, Emergency Enabled",
            "time_window": "evening",
            "overrides": {"emergency_fee": None},
        },
        {
            "label": "Variant 2: Evening Window, With Fee ($150), Emergency Enabled",
            "time_window": "evening",
            "overrides": {},
        },
        {
            "label": "Variant 3: Evening Window, Emergency Disabled",
            "time_window": "evening",
            "overrides": {"emergency_enabled": False, "emergency_fee": None},
        },
        {
            "label": "Variant 4: Business Hours, Emergency Dispatch ON",
            "time_window": "business_hours",
            "overrides": {},
        },
        {
            "label": "Variant 5: Business Hours, Emergency Dispatch OFF",
            "time_window": "business_hours",
            "overrides": {"business_hours_emergency_dispatch": False},
        },
        {
            "label": "Variant 6: Sleep Window (any config)",
            "time_window": "sleep",
            "overrides": {},
        },
    ]

    for v in variants:
        client = FakeClient(**v["overrides"])
        prompt = build_sarah_prompt(client, v["time_window"])
        print("=" * 80)
        print(f"  {v['label']}")
        print(f"  Time window: {v['time_window']}")
        print("=" * 80)
        print(prompt)
        print()
        print(f"  [Token estimate: ~{len(prompt.split())} words]")
        print()


if __name__ == "__main__":
    main()
