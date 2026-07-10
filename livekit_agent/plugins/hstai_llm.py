"""
plugins/hstai_llm.py — LLM plugin wrapping HSTAI's OpenAI-compatible endpoint.

Injects hybrid video frames (base64 JPEG) into the last user message
before sending to the LLM. The LLM receives: text transcript + image frames only.
No audio is sent to the model.
"""
import os
import json
from typing import AsyncGenerator
import aiohttp
from openai import AsyncOpenAI
from livekit.agents import llm


HSTAI_API_URL = os.environ.get("HSTAI_API_URL", "http://api:3080")
HSTAI_SERVICE_TOKEN = os.environ.get("HSTAI_SERVICE_TOKEN", "")
HSTAI_MODEL = os.environ.get("HSTAI_MODEL", "unsloth")


class HSTAILlm(llm.LLM):
    """
    Wraps HSTAI /v1/chat/completions.
    Accepts a frame_buffer list (shared reference) so the agent
    can keep updating it while this plugin reads from it on each turn.
    """

    def __init__(self, frame_buffer: list[str]):
        super().__init__()
        self._frame_buffer = frame_buffer

    def chat(
        self,
        *,
        chat_ctx: llm.ChatContext,
        **kwargs,
    ) -> "HSTAILlmStream":
        return HSTAILlmStream(
            llm=self,
            chat_ctx=chat_ctx,
            frame_buffer=self._frame_buffer,
            **kwargs,
        )


class HSTAILlmStream(llm.LLMStream):
    def __init__(
        self,
        *,
        llm: llm.LLM,
        chat_ctx: llm.ChatContext,
        frame_buffer: list[str],
        **kwargs,
    ):
        from livekit.agents.types import APIConnectOptions
        conn_options = kwargs.get("conn_options", APIConnectOptions())
        tools = kwargs.get("tools", [])

        super().__init__(
            llm=llm,
            chat_ctx=chat_ctx,
            tools=tools,
            conn_options=conn_options,
        )
        self._frame_buffer = frame_buffer

    async def _run(self) -> None:
        messages = _build_messages(self._chat_ctx, self._frame_buffer)

        def _yield_delta(text: str):
            if text:
                self._event_ch.send_nowait(
                    llm.ChatChunk(
                        choices=[
                            llm.Choice(
                                delta=llm.ChoiceDelta(role="assistant", content=text)
                            )
                        ]
                    )
                )

        client = AsyncOpenAI(
            base_url=f"{HSTAI_API_URL}/v1",
            api_key=HSTAI_SERVICE_TOKEN or "dummy"
        )
        
        try:
            response = await client.chat.completions.create(
                model=HSTAI_MODEL,
                messages=messages,
                stream=True
            )
            
            buffer = ""
            in_think = False
            
            async for chunk in response:
                delta = chunk.choices[0].delta.content
                if delta:
                    buffer += delta
                    
                    while True:
                        if not in_think:
                            think_idx = buffer.find("<think>")
                            if think_idx != -1:
                                if think_idx > 0:
                                    _yield_delta(buffer[:think_idx])
                                buffer = buffer[think_idx + 7:]
                                in_think = True
                            else:
                                last_lt = buffer.rfind("<")
                                if last_lt != -1:
                                    if last_lt > 0:
                                        _yield_delta(buffer[:last_lt])
                                    buffer = buffer[last_lt:]
                                else:
                                    _yield_delta(buffer)
                                    buffer = ""
                                break
                        else:
                            end_think_idx = buffer.find("</think>")
                            if end_think_idx != -1:
                                buffer = buffer[end_think_idx + 8:]
                                in_think = False
                            else:
                                if len(buffer) > 7:
                                    buffer = buffer[-7:]
                                break
            
            # Flush remaining buffer if not in think
            if buffer and not in_think:
                _yield_delta(buffer)
                
        except Exception as e:
            logger.error("HSTAI OpenAI API Error: %s", e)
            raise e


def _build_messages(chat_ctx: llm.ChatContext, frame_buffer: list[str]) -> list[dict]:
    """
    Convert ChatContext to OpenAI message format.
    Inject hybrid frames into the last user message as image_url content parts.
    """
    from utils.frames import pick_frames

    messages = []
    messages_list = chat_ctx.messages() if callable(chat_ctx.messages) else chat_ctx.messages
    for msg in messages_list:
        if msg.role == "system":
            messages.append({"role": "system", "content": msg.content})
        elif msg.role == "user":
            messages.append({"role": "user", "content": msg.content})
        elif msg.role == "assistant":
            messages.append({"role": "assistant", "content": msg.content})

    # Inject ONE most recent frame into last user message
    frames = pick_frames(frame_buffer, n_recent=1, n_spread=0)
    if frames and messages:
        last_user_idx = next(
            (i for i in reversed(range(len(messages))) if messages[i]["role"] == "user"),
            None,
        )
        if last_user_idx is not None:
            text = messages[last_user_idx]["content"].strip()
            if not text:
                text = "What do you see in this image?"
            
            messages[last_user_idx]["content"] = [
                {"type": "text", "text": text},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{frames[0]}"}},
            ]

    return messages
