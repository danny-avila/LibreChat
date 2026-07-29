import os
import asyncio
from google import genai
from google.genai import types

MODEL = "models/gemini-3.1-flash-live-preview"

async def test():
    client = genai.Client(
        http_options={"api_version": "v1beta"},
        api_key=os.environ.get("GOOGLE_API_KEY"),
    )
    CONFIG = types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        history_config=types.HistoryConfig(initial_history_in_client_content=True)
    )
    print(f"Connecting to {MODEL} with history_config...")
    try:
        async with client.aio.live.connect(model=MODEL, config=CONFIG) as session:
            print("Successfully connected!")
            await session.send(input="hello", end_of_turn=True)
            print("Message sent successfully")
    except Exception as e:
        print(f"FAILED: {e}")

if __name__ == "__main__":
    asyncio.run(test())
