# LibreChat LiveKit voice agent

The worker behind LibreChat's realtime voice chat. It owns the **media plane only**.

## One brain, two ears

The worker has no model and no prompt. Its `voice.Agent` is constructed with
`instructions: ''` deliberately — do not "fix" it.

```
browser ──WebRTC──> LiveKit SFU ──> worker
  mic                              │  AgentSession: VAD → turn detection → STT
  speaker <──WebRTC── SFU <────────┤  LibreChatLLM ──HTTP──> POST /api/agents/chat
                                   │       ▲                        │
                                   │       └──── SSE stream ────────┘
                                   └─ streaming TTS ← text deltas
```

| Concern | Owner |
| --- | --- |
| WebRTC, VAD, turn detection, barge-in, streaming STT/TTS | LiveKit |
| Prompt, tools, MCP, memory, model params, moderation, ACLs, persistence, titles | LibreChat |

Every turn is an ordinary `POST /api/agents/chat/:endpoint`. That is the whole point: the
voice agent cannot drift from text chat, because there is no second copy of any of it. A
voice conversation is a normal conversation — it appears in the sidebar and can be continued
in text after hanging up.

This is also why the pipeline is STT → LLM → TTS rather than a realtime speech-to-speech
model. An S2S model *is* the LLM: it holds the context and calls its own tools, leaving no
seam to inject LibreChat's agent.

## Running

The worker is not an npm workspace; it installs and builds on its own.

```bash
npm run build:data-provider   # from the repo root — consumed via a file: dependency
cd livekit/agent
npm install
npm run dev                   # or: npm run build && npm start
```

With Docker, from the repo root (the build context must be the root):

```bash
docker compose -f docker-compose.yml -f docker-compose.livekit.yml up
```

## Environment

| Variable | Purpose |
| --- | --- |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Read by the LiveKit SDK itself |
| `LIVEKIT_AGENT_NAME` | Must match `speech.livekit.agentName`; without it LiveKit dispatches an agent into every room |
| `LIVEKIT_WORKER_SECRET` | Shared secret used to claim a session from LibreChat |
| `LIBRECHAT_API_URL` | Where the worker reaches LibreChat |
| Vendor keys (`DEEPGRAM_API_KEY`, `CARTESIA_API_KEY`, …) | Only for the providers named in `librechat.yaml` |

## Notes for contributors

- **Providers resolve by name** against the registry in `src/providers.ts`. Adding one is a
  registry entry, not a schema change. LiveKit Inference (`inference.STT`/`inference.TTS`) is
  Cloud-only despite the upstream quickstarts, so self-hosters need their own keys. The
  turn detector is the exception: `v1-mini` runs locally, in-process.
- **`src/speech.ts` is not cosmetic.** A code block read aloud is unusable, so non-speech
  content becomes a short spoken pointer while the rich original still lands in the message.
  It also maps spoken offsets back to source offsets, which barge-in needs: what was
  synthesized is a rewrite of the markdown, not a prefix of it.
- **The HITL bail is a correctness fix.** `hitlCapable` is hardcoded true in `AgentClient`
  with no per-request opt-out, so a voice turn can enter an approval state that has no
  representation in audio. Without the bail, the call deadlocks in silence.
- **1.5.x renamed `WorkerOptions`→`ServerOptions` and `Worker`→`AgentServer`.** The upstream
  README still shows the old names.
