from datetime import datetime, time as dt_time
import pytz

# Maps isoweekday() -> schedule key
_ISO_TO_DAY = {
    1: "monday", 2: "tuesday", 3: "wednesday", 4: "thursday",
    5: "friday", 6: "saturday", 7: "sunday",
}


def _parse_time(s: str) -> dt_time:
    """Parse 'HH:MM' to a time object."""
    parts = s.split(":")
    return dt_time(int(parts[0]), int(parts[1]))


def get_time_window(client) -> str:
    """
    Returns 'sleep', 'business_hours', or 'evening'.
    Call this at the start of every webhook to determine the agent's behavior context.
    Priority: sleep > business_hours > evening (default).
    """
    tz = pytz.timezone(client.timezone)
    now = datetime.now(tz)
    current_time = now.time()
    current_day = now.isoweekday()  # 1=Monday, 7=Sunday (ISO)

    # 1. Sleep window — highest priority, applies every day
    if client.sleep_window_start is not None and client.sleep_window_end is not None:
        start = client.sleep_window_start
        end = client.sleep_window_end
        # Overnight window crosses midnight (e.g. 22:00 to 08:00)
        if start > end:
            if current_time >= start or current_time < end:
                return "sleep"
        else:
            if start <= current_time < end:
                return "sleep"

    # 2. Business hours — check per-day schedule first, fall back to old fields
    schedule = client.business_hours_schedule
    if schedule:
        day_key = _ISO_TO_DAY.get(current_day)
        day_config = schedule.get(day_key, {})
        if day_config.get("enabled") and day_config.get("start") and day_config.get("end"):
            day_start = _parse_time(day_config["start"])
            day_end = _parse_time(day_config["end"])
            if day_start <= current_time < day_end:
                return "business_hours"
    elif (
        client.business_hours_start is not None
        and client.business_hours_end is not None
        and current_day in (client.business_days or [])
    ):
        if client.business_hours_start <= current_time < client.business_hours_end:
            return "business_hours"

    # 3. Evening window — default
    return "evening"


def get_next_open_info(client) -> dict | None:
    """Return info about the next time the business opens.

    Returns {"day_name": "Monday", "start": "8:00 AM"} or None.
    Used by the prompt builder so Sarah can tell callers when the business reopens.
    """
    schedule = client.business_hours_schedule
    if not schedule:
        if client.business_hours_start:
            return {
                "day_name": None,
                "start": _format_12h(client.business_hours_start),
            }
        return None

    tz = pytz.timezone(client.timezone)
    now = datetime.now(tz)
    current_day = now.isoweekday()

    # Check tomorrow first, then cycle through the week
    for offset in range(1, 8):
        check_day = ((current_day - 1 + offset) % 7) + 1
        day_key = _ISO_TO_DAY[check_day]
        day_config = schedule.get(day_key, {})
        if day_config.get("enabled") and day_config.get("start"):
            return {
                "day_name": day_key.capitalize(),
                "start": _format_12h(_parse_time(day_config["start"])),
            }
    return None


def _format_12h(t: dt_time) -> str:
    """Format time as '9:00 AM'."""
    hour = t.hour % 12 or 12
    minute = f"{t.minute:02d}"
    ampm = "AM" if t.hour < 12 else "PM"
    return f"{hour}:{minute} {ampm}"
