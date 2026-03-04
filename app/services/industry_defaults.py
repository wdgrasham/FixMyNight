"""Shipped industry-specific defaults for the AI voice agent."""

INDUSTRY_DEFAULTS = {
    "hvac": {
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
    },
    "plumbing": {
        "industry_label": "Plumbing",
        "emergency_examples": [
            "Burst pipe",
            "No water to building",
            "Sewage backup",
            "Water heater failure",
            "Major water leak",
        ],
        "routine_examples": [
            "Scheduling repair",
            "Dripping faucet",
            "Slow drain",
            "Requesting a quote",
        ],
        "agent_name": "Sarah",
        "service_noun": "plumbing service",
        "tech_title": "plumber",
    },
    "electrical": {
        "industry_label": "Electrical",
        "emergency_examples": [
            "Sparking from panel",
            "Burning smell from wiring",
            "Total power loss",
            "Exposed wiring",
            "Electrical fire risk",
        ],
        "routine_examples": [
            "Scheduling inspection",
            "Outlet not working",
            "Light fixture installation",
            "Requesting a quote",
        ],
        "agent_name": "Sarah",
        "service_noun": "electrical service",
        "tech_title": "electrician",
    },
    "locksmith": {
        "industry_label": "Locksmith",
        "emergency_examples": [
            "Locked out of home or business",
            "Broken lock",
            "Security breach",
            "Car lockout",
        ],
        "routine_examples": [
            "Key duplication",
            "Lock rekey scheduling",
            "New lock installation",
            "Requesting a quote",
        ],
        "agent_name": "Sarah",
        "service_noun": "locksmith service",
        "tech_title": "locksmith",
    },
    "pest_control": {
        "industry_label": "Pest Control",
        "emergency_examples": [
            "Active infestation",
            "Venomous spider or snake inside",
            "Bee or wasp nest blocking entry",
            "Rodent infestation causing damage",
        ],
        "routine_examples": [
            "Scheduling treatment",
            "Inspection question",
            "Preventive treatment",
            "Requesting a quote",
        ],
        "agent_name": "Sarah",
        "service_noun": "pest control service",
        "tech_title": "technician",
    },
    "roofing": {
        "industry_label": "Roofing",
        "emergency_examples": [
            "Active roof leak during rain",
            "Storm damage",
            "Tree on roof",
            "Structural collapse risk",
        ],
        "routine_examples": [
            "Scheduling inspection",
            "Repair quote",
            "Gutter cleaning",
            "Requesting a quote",
        ],
        "agent_name": "Sarah",
        "service_noun": "roofing service",
        "tech_title": "technician",
    },
    "appliance_repair": {
        "industry_label": "Appliance Repair",
        "emergency_examples": [
            "Refrigerator dead with food spoiling",
            "Washing machine flooding",
            "Oven won't turn off",
            "Gas appliance leak",
        ],
        "routine_examples": [
            "Scheduling repair",
            "Dishwasher question",
            "Dryer not heating",
            "Requesting a quote",
        ],
        "agent_name": "Sarah",
        "service_noun": "appliance repair service",
        "tech_title": "technician",
    },
    "general_contractor": {
        "industry_label": "General Contractor",
        "emergency_examples": [
            "Water damage requiring immediate repair",
            "Structural concern",
            "Fallen tree on structure",
            "Storm damage",
        ],
        "routine_examples": [
            "Project consultation",
            "Bid request",
            "Scheduling walkthrough",
            "Requesting a quote",
        ],
        "agent_name": "Sarah",
        "service_noun": "contracting service",
        "tech_title": "contractor",
    },
    "property_management": {
        "industry_label": "Property Management",
        "emergency_examples": [
            "Tenant locked out",
            "Major water leak",
            "No heat or cooling",
            "Fire alarm issue",
        ],
        "routine_examples": [
            "Maintenance request",
            "Lease inquiry",
            "Parking question",
            "Requesting information",
        ],
        "agent_name": "Sarah",
        "service_noun": "property management service",
        "tech_title": "maintenance technician",
    },
    "general": {
        "industry_label": "General",
        "emergency_examples": [
            "Caller explicitly states emergency or safety concern",
            "Immediate risk to property or safety",
        ],
        "routine_examples": [
            "Scheduling service",
            "Requesting a quote",
            "General question",
        ],
        "agent_name": "Sarah",
        "service_noun": "service",
        "tech_title": "technician",
    },
}


def get_industry_config(industry: str, overrides: dict = None) -> dict:
    """Get industry config with client overrides merged on top of defaults.
    If industry is not recognized, falls back to 'general'.
    """
    defaults = INDUSTRY_DEFAULTS.get(industry, INDUSTRY_DEFAULTS["general"]).copy()
    if overrides:
        defaults.update(overrides)
    return defaults
