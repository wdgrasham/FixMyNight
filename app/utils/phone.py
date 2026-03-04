import re

E164_PATTERN = re.compile(r"^\+[1-9]\d{1,14}$")


def is_valid_e164(phone: str) -> bool:
    """Validate E.164 phone number format."""
    return bool(E164_PATTERN.match(phone))


def normalize_phone(phone: str) -> str:
    """Strip common formatting and attempt E.164 normalization.
    Returns the phone as-is if it already starts with +.
    Prepends +1 for 10-digit US numbers.
    """
    digits = re.sub(r"[^\d+]", "", phone)
    if digits.startswith("+"):
        return digits
    if len(digits) == 10:
        return f"+1{digits}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"
    return phone
