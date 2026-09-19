# Native replay query amplification

This experimentally confirms finding 02 in the [first audit](../integration-audit.md) on LibreChat `ba006f3877cd62225a0111bc7a8cb4fdd71e669e` and its installed SDK artifact.

The [retained probe](probes/native-replay.cjs) creates a completed native response with 24 separate text chunks using the real Mongo recording methods. It then replays that response through the installed SDK's actual `NativeMediaSession.messages`, the actual host `createNativeMediaFactory().restore`, and the actual Mongo repository. The credential boundary returns a synthetic descriptor; no provider request occurs. Only during replay, a process-local wrapper counts Mongoose queries and optionally delays each by 250 ms.

| Injected latency per query | NativePart reads | Job reads | Thread reads | Maximum concurrent queries | Measured replay duration |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0 ms | 24 | 24 | 24 | 1 | 47 ms |
| 250 ms | 24 | 24 | 24 | 1 | 18,801 ms |

The output order and final thought signature are preserved in both controls. This measures 72 serial database reads before the next model request, with no image/object-store latency included. The first audit's 100-part / 75-second estimate remains an extrapolation, but its query-count and serialization assumptions are now directly observed.

The [host restore](../../../../packages/api/src/media/native.ts#L284) calls [the per-part repository method](../../../../packages/data-schemas/src/methods/mediaNative.ts#L516), which reloads the same job and thread for every part. SDK message conversion awaits that method within nested message/part loops. Simply parallelizing every part without a bound would trade the latency problem for an unbounded read burst.

Add a bounded batch continuation API, deduplicate job/thread authorization within one invocation, and restore bytes only for image parts that need them. Preserve owner, tenant, expiry, model, provider binding, signatures, and ordered content. Pass already-loaded source/configuration data through the host boundary. Validate full native conversation loading/continuation under injected latency; the ordinary Lighthouse fixture has media disabled and cannot measure this path.

```powershell
node docs/research/media-studio/audit/probes/native-replay.cjs
```

Exit 0 confirms the audited branch performs the 72 serial reads; it does not mean the performance invariant is fixed. The fixture creates and removes its own MongoDB, disables inherited search integration, restores the original Mongoose query method in `finally`, and makes no inference calls. During harness construction two incomplete synthetic connection descriptors failed before replay; the retained fixture supplies the actual required API/header/base-URL shape and the final run passes.
