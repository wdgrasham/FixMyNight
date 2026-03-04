from datetime import datetime
from ..models import AuditLog


async def write_audit_log(
    db,
    event_type,
    actor_type,
    actor_id=None,
    resource_type=None,
    resource_id=None,
    client_id=None,
    metadata=None,
):
    log = AuditLog(
        created_at=datetime.utcnow(),
        event_type=event_type,
        actor_type=actor_type,
        actor_id=actor_id,
        resource_type=resource_type,
        resource_id=resource_id,
        client_id=client_id,
        metadata=metadata or {},
    )
    db.add(log)
    await db.commit()
