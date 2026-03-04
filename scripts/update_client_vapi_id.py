"""Update Stellar HVAC's vapi_assistant_id and vapi_phone_number_id in the database.

Usage:
    python scripts/update_client_vapi_id.py <VAPI_ASSISTANT_ID> [VAPI_PHONE_NUMBER_ID]

Requires env var: DATABASE_URL

Connects to the database and updates the Stellar HVAC client record
(ID: 49855f38-6fa3-4202-ab19-a242028ec369) with the provided Vapi IDs.
"""

import sys
import os
import asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

STELLAR_HVAC_ID = "49855f38-6fa3-4202-ab19-a242028ec369"


async def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/update_client_vapi_id.py <VAPI_ASSISTANT_ID> [VAPI_PHONE_NUMBER_ID]")
        print()
        print("Updates Stellar HVAC client record with Vapi IDs.")
        print("Requires DATABASE_URL env var.")
        sys.exit(1)

    vapi_assistant_id = sys.argv[1]
    vapi_phone_number_id = sys.argv[2] if len(sys.argv) > 2 else None

    if not os.environ.get("DATABASE_URL"):
        print("ERROR: DATABASE_URL environment variable not set.")
        sys.exit(1)

    from sqlalchemy import update, select
    from app.database import AsyncSessionLocal
    from app.models import Client

    async with AsyncSessionLocal() as db:
        # Verify client exists
        result = await db.execute(
            select(Client).where(Client.id == STELLAR_HVAC_ID)
        )
        client = result.scalar_one_or_none()
        if not client:
            print(f"ERROR: Stellar HVAC client not found (ID: {STELLAR_HVAC_ID})")
            print("Has the seed data been inserted?")
            sys.exit(1)

        print(f"Found client: {client.business_name}")
        print(f"  Current vapi_assistant_id: {client.vapi_assistant_id}")
        print(f"  Current vapi_phone_number_id: {client.vapi_phone_number_id}")
        print()

        updates = {"vapi_assistant_id": vapi_assistant_id}
        if vapi_phone_number_id:
            updates["vapi_phone_number_id"] = vapi_phone_number_id

        await db.execute(
            update(Client).where(Client.id == STELLAR_HVAC_ID).values(**updates)
        )
        await db.commit()

        # Verify
        result = await db.execute(
            select(Client).where(Client.id == STELLAR_HVAC_ID)
        )
        client = result.scalar_one()
        print(f"Updated:")
        print(f"  vapi_assistant_id: {client.vapi_assistant_id}")
        print(f"  vapi_phone_number_id: {client.vapi_phone_number_id}")
        print()
        print("Done! Client record updated.")


if __name__ == "__main__":
    asyncio.run(main())
