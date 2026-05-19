import json
import os
import pathlib
from datetime import datetime, timezone

import dotenv
from pymongo import MongoClient, UpdateOne

dotenv.load_dotenv(override=True)

BASE_DIR = pathlib.Path(__file__).parent.parent

MONGO_URI = os.getenv("MONGO_URI")

client = MongoClient(MONGO_URI)

with open(BASE_DIR / "json" / "custom-credits.json", "r") as f:
    custom_credits = json.load(f)


def main():
    now = datetime.now(timezone.utc)

    # Weekly reset of credits
    token_credits_threshold = int(5e6)

    balances_lower_than_token_credits_threshold = list(
        client.LibreChat.balances.find({"tokenCredits": {"$lt": token_credits_threshold}})
    )
    client.LibreChat.balances.update_many(
        {"_id": {"$in": [balance["_id"] for balance in balances_lower_than_token_credits_threshold]}},
        {"$set": {"tokenCredits": token_credits_threshold, "lastRefill": now}},
    )

    # Custom users to update
    users = list(
        client.LibreChat.users.find(
            {"username": {"$in": list(custom_credits.keys())}},
            {"_id": 1, "username": 1},  # traz apenas o que precisamos
        )
    )

    operations = []
    for user in users:
        user_id = user["_id"]  # já é ObjectId
        username = user["username"]
        token_credits = custom_credits[username]  # valor específico para este usuário

        # filtro na coleção `balances` (campo `user` aponta para o _id do usuário)
        operations.append(
            UpdateOne(
                {"user": user_id},  # filtro individual
                {"$set": {"tokenCredits": token_credits, "lastRefill": now}},
            )
        )

    if operations:  # evita bulk_write vazio
        result = client.LibreChat.balances.bulk_write(operations)

        # -------------------------------------------------
        # 4️⃣  Verificação rápida do resultado
        # -------------------------------------------------
        print(f"Matched: {result.matched_count}")
        print(f"Modified: {result.modified_count}")
    else:
        print("Nenhuma operação a ser executada.")


if __name__ == "__main__":
    main()
