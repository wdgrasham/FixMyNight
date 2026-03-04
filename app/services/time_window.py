from datetime import datetime
import pytz


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

    # 2. Business hours — only on configured business days
    if (
        client.business_hours_start is not None
        and client.business_hours_end is not None
        and current_day in (client.business_days or [])
    ):
        if client.business_hours_start <= current_time < client.business_hours_end:
            return "business_hours"

    # 3. Evening window — default
    return "evening"
