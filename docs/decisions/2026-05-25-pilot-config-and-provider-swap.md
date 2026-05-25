# 2026-05-25 — Pilot config tuning and primary LLM provider swap

## Context

The 6-persona SPE pilot was scheduled to go live with Groq as the primary LLM provider. On 2026-05-25, two things forced a reshuffle:

1. **Groq's free tier was a bottleneck.** The free tier caps at ~100K tokens/day, which would be exhausted within a few hours of normal pilot use. The natural next step was upgrading to Groq's Dev tier, but at the time of the decision the Dev tier upgrade flow was unavailable on Groq's billing page (we could not give them money even if we wanted to).
2. **Six operational questions surfaced during pilot readiness review.** The pilot needs a primary provider with predictable capacity, session lifetimes that don't have personas re-logging-in every 15 minutes, and rate limits that don't lock out a 6-persona burst at startup.

Constraints:
- Internal sandbox, no public traffic — the threat model is bounded.
- No engineering capacity on the SPE side to implement refresh-token handling before the pilot.
- Total LLM spend should be predictable and capped.

## Decision

1. **Primary LLM provider: Groq → Together AI.**
   Together AI's prepaid model gives us a hard ceiling. Funded with $20 prepaid credit, auto-recharge off, so the worst case is service stops, not a surprise bill.
2. **Default model: `meta-llama/Llama-3.3-70B-Instruct-Turbo` (Together).**
   Same model family as the prior default (`llama-3.3-70b-versatile` on Groq), different provider variant. Behavior should be substantially equivalent for SPE's use case.
3. **Groq retained as backup endpoint** in [librechat.yaml](../../librechat.yaml). Still useful as a free-tier fallback during dev/debug.
4. **`SESSION_EXPIRY`: 15 min → 24 h** (`86400000` ms in `.env`).
5. **`LOGIN_MAX`: 7 → 20** per 5 min window.
6. **`REGISTER_MAX`: 5 → 20** per 60 min window.

All four config changes are in [.env](../../.env) on the EC2 host (gitignored locally).

## Reasoning

| Change | Why |
|---|---|
| Provider swap to Together | Removes the 100K-TPD ceiling that would've blocked the pilot. Prepaid hard-cap is a better risk profile than free-tier rate limits during an unknown-load pilot. |
| Default model `Llama-3.3-70B-Instruct-Turbo` | Closest analogue to the prior Groq default. Minimizes behavioral drift in persona prompts that were tuned against the 70B Llama 3.3 family. |
| `SESSION_EXPIRY` to 24 h | SPE personas don't yet implement refresh-token handling, so a 15-min session means re-login storms. 24 h is enough that the pilot can run a full day per login. |
| Higher login/register limits | Six personas starting in parallel against the default `LOGIN_MAX=7/5min` would partially lock out on first contact. 20 gives headroom for the pilot without being so loose it's pointless. |

## Trade-offs

These were taken knowingly:

- **Together is ~$0.88 per million tokens** vs Groq's ~$0.65 (approximate, check current pricing). We accept a slightly higher per-token rate in exchange for a hard prepaid ceiling and predictable capacity.
- **24-hour sessions mean leaked tokens are valid longer.** Acceptable for an internal sandbox with no public traffic. Not acceptable for production exposure — revisit before opening up.
- **Higher login limits weaken brute-force protection.** Same reasoning — internal sandbox, bounded threat model. The fail-shut alternative (lower limit, personas locked out) is worse than the fail-open one (higher limit, plausible brute-force window) for this audience.
- **Same-IP rate limiting still applies.** If SPE eventually NATs all personas behind one egress IP, even 20/5min will be too low — see follow-ups.

## Follow-ups

In rough priority order:

1. **SPE: implement refresh-token handling in the persona client.** Once done, revert `SESSION_EXPIRY` to the 15-min default. The current setting is a workaround for a missing SPE feature, not a deliberate security posture.
2. **Set up automated MongoDB backups.** Before the pilot accumulates real persona conversation data worth losing. `mongodump` + a cron job + S3 with lifecycle rules is the cheapest viable answer.
3. **Watch Together credit balance weekly** until usage patterns stabilize. Calendar reminder, not a paging alert. When the burn rate is predictable, raise the prepaid amount or move to a billed plan.
4. **Re-size login limits for production.** At 180 personas, `LOGIN_MAX=20/5min` is too tight. Target ~100/5min for production scale, but only after observing real pilot login behavior.
5. **Re-check Groq's Dev tier availability.** If their billing page reopens and the pricing is meaningfully better than Together, consider swapping primary back. Together → Groq is a one-line `librechat.yaml` reorder plus a config-only deploy.
6. **Bus factor: get Lex AWS console access** at minimum, so a Pato-unavailable incident isn't a hard outage.
