import logging
import os

from livekit.agents import (
    AutoSubscribe,
    JobContext,
    JobProcess,
    WorkerOptions,
    cli,
    Agent,
    RunContext,
    function_tool,
    RoomInputOptions,
)
from livekit.agents.voice import AgentSession
from livekit.plugins import google

logger = logging.getLogger("hstai-agent")
logging.basicConfig(level=logging.INFO)


class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions=(
                "You are a helpful AI voice assistant. The user is speaking to you via voice. "
                "Keep responses concise and conversational — you are speaking, not writing. "
                "Do not use markdown, bullet points, or formatting in your responses. "
                "If the user explicitly asks you to 'send to chat' or 'text it to me', use the "
                "'send_message_to_chat' tool to send the text message to the chat window. "
                "Do not repeat the content of the message verbally; simply confirm that you have sent it. "
                "You have access to Google Search to fetch real-time information from the internet when the user asks questions you don't know."
            ),
            tools=[google.tools.GoogleSearch()],
        )

    @function_tool()
    async def send_message_to_chat(
        self,
        context: RunContext,
        message: str,
    ) -> str:
        """Send a text message to the current chat window.
        Only call this when the user explicitly asks you to 'send to chat' or 'text it to me'.

        Args:
            message: The text message content to send to the chat.
        """
        try:
            await context.session.room_io.room.local_participant.send_text(message, topic="lk.chat")
            logger.info("Sent message to chat: %s", message)
            return "Successfully sent message to chat. Do not repeat the message content verbally; just say that you have sent it."
        except Exception as e:
            logger.error("Failed to send message to chat: %s", e)
            return f"Failed to send message: {e}"


def prewarm(proc: JobProcess):
    pass


async def entrypoint(ctx: JobContext) -> None:
    logger.info("Agent job started, room=%s", ctx.room.name)

    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    session = AgentSession(
        llm=google.realtime.RealtimeModel(
            model="gemini-3.1-flash-live-preview",
            voice="Zephyr",
        ),
    )

    await session.start(
        room=ctx.room,
        agent=Assistant(),
        room_input_options=RoomInputOptions(video_enabled=False),
    )

    logger.info("Agent pipeline started")

    # Generate initial greeting — disabled for gemini-3.1-flash-live-preview
    # because mutable_chat_context and async generate_reply are not yet supported.
    pass


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            ws_url=os.environ.get("LIVEKIT_URL", "ws://livekit:7880"),
            api_key=os.environ.get("LIVEKIT_API_KEY", "devkey"),
            api_secret=os.environ.get("LIVEKIT_API_SECRET", "devsecret"),
        )
    )
