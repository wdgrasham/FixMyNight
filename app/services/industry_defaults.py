"""Shipped industry-specific defaults for the AI voice agent."""

INDUSTRY_DEFAULTS = {
    "hvac": {
        "industry_label": "HVAC",
        "emergency_examples": [
            "AC not working",
            "No heat",
            "Furnace failure",
            "Refrigerant leak",
        ],
        "routine_examples": [
            "Scheduling maintenance",
            "Requesting a quote",
            "Filter replacement question",
            "Thermostat programming help",
        ],
        "agent_name": "Sarah",
        "service_noun": "HVAC service",
        "tech_title": "HVAC technician",
    },
    "plumbing": {
        "industry_label": "Plumbing",
        "emergency_examples": [
            "Burst pipe",
            "Sewage backup",
            "Flooding",
            "No water",
            "Water heater leaking",
            "Overflowing toilet",
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
            "Sparking outlet",
            "Burning smell from panel",
            "Power outage in part of house",
            "Exposed wires",
            "Breaker won't reset",
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
            "Locked out of house",
            "Locked out of car",
            "Broken lock",
            "Break-in damage to door or lock",
            "Lost all keys",
            "Child or pet locked in car",
        ],
        "routine_examples": [
            "Rekey locks",
            "Install new deadbolt",
            "Make spare keys",
            "Lock upgrade",
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
            "Structural damage",
            "Roof collapse",
            "Storm damage",
            "Flooding from construction defect",
            "Broken window or door leaving home unsecured",
        ],
        "routine_examples": [
            "Renovation quote",
            "Repair estimate",
            "Inspection",
            "Project follow-up",
        ],
        "agent_name": "Sarah",
        "service_noun": "contractor service",
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
            "Urgent situation requiring immediate after-hours service",
        ],
        "routine_examples": [
            "Service request",
            "Quote",
            "Appointment scheduling",
            "General inquiry",
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
