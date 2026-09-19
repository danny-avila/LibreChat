# Storage, transport, and streaming audit

Audited LibreChat `ba006f3877cd62225a0111bc7a8cb4fdd71e669e`, using the installed/built `@librechat/api` and actual installed Axios **1.20.0** and Multer. Comparison merge base: `385c6f8a1a42b5facdea5a9de5d00dd5e428ce45`. This pass adds two reproduced findings and rejects a plausible third. It does not repeat the earlier derivative-deletion, tombstone, or retention findings.

Reproduction from the repository root:

```powershell
node docs/research/media-studio/audit/probes/storage-transport.cjs
```

Final run: **exit 0, 2.8 seconds**. The probe exercises a real local HTTP multipart disconnect, real Axios HTTP responses, and the actual cloud strategy adapter with a synthetic byte service. It creates and removes its own temporary directory, closes its sockets, and explicitly closes the leaked descriptor after measuring it. No paid API or cloud writes are involved. An exit of zero confirms the audited behavior; this diagnostic is not a regression test that will remain green after the defects are fixed.

## P2 — Upload cancellation leaves a staged file and an open write stream

When the client disconnects during a multipart upload, Multer rejects the request and destroys the input stream, but Media Studio's custom storage never handles that stream's error/close or the request's abort. Its error path is attached only to the byte counter and destination. Piping a source does not propagate its error or premature close to those destinations.

The [storage implementation](../../../../packages/api/src/media/staging.ts#L54) creates the destination and [listens only to counter/destination events](../../../../packages/api/src/media/staging.ts#L83). It supplies the staged path to Multer only on successful destination finish. Thus Multer's pending-file cleanup also has no path to remove. The [upload route](../../../../packages/api/src/media/http.ts#L322) rejects at `receive`; its later `finally` for a fully received file is never entered.

The probe starts a real HTTP POST, sends multipart headers and 65,536 bytes, waits until those bytes are physically staged, then destroys the client request.

| Observation after the request has failed | Result |
| --- | --- |
| Multer reports request failure | `Request aborted` |
| Incoming file stream destroyed | true |
| Custom storage callback invocations | **0** |
| Partial staged file remains | **65,536 bytes** |
| Destination write stream destroyed | **false** |
| Destination write stream finished | **false** |
| Destination file descriptor still open | **true** |

Controls: a completed upload calls back with the correct size and can be removed through the storage API. An upload exceeding the configured type-specific limit rejects with 413 and removes its partial file. The defect is the cancellation transition, not every upload or ordinary size rejection.

A normal browser cancellation or interrupted mobile connection can leave resources behind; repeated interruptions accumulate partial files and open descriptors. The periodic staging sweep is not a replacement for closing an active descriptor when its source ends prematurely. Use an abort-aware `pipeline` (already used by [canonical publication](../../../../packages/api/src/media/storage.ts#L260)) or equivalent coordinated destruction, settle exactly once, and remove partial bytes after destination close. Retain Multer's expected ownership of successful files and avoid competing callbacks. Add a real multipart cancellation test that checks the descriptor, file, and callback, including abort before directory creation finishes.

## P2 — Cloud video seeking downloads the whole prefix for every byte range

The content endpoint correctly returns 206, `Content-Range`, and the requested bytes. However, [cloud open](../../../../packages/api/src/media/objects.ts#L285) forwards only `signal` to the existing strategy and then [slices the full response in application code](../../../../packages/api/src/media/objects.ts#L102). Seeking near the end of a large video therefore first transfers all earlier bytes from object storage into the server. Each subsequent seek starts another full-prefix download.

The probe requests the final 32 bytes of an 8 MiB object through each actual adapter. Only the external byte service is synthetic; slicing and stream ownership are production code.

| Strategy | Bytes delivered to caller | Bytes read from cloud strategy | Range forwarded |
| --- | ---: | ---: | --- |
| S3 | 32 | **8,388,608** | no |
| CloudFront | 32 | **8,388,608** | no |
| Azure Blob | 32 | **8,388,608** | no |
| Firebase | 32 | **8,388,608** | no |

All four close the underlying stream when the requested range is finished and forward cancellation correctly; those are useful existing controls. Local storage already passes `start`/`end` into `createReadStream` directly.

The current host strategies match the observed contract: [S3 sends GetObject without Range](../../../../packages/api/src/storage/s3/crud.ts#L852); [Azure calls `download(0, undefined)`](../../../../api/server/services/Files/Azure/crud.js#L283); [Firebase sends a full GET](../../../../api/server/services/Files/Firebase/crud.js#L253). This is an integration gap introduced by presenting those full-download interfaces as media streaming, rather than a claim that their preexisting file-download behavior regressed. With the default 512 MiB media video allowance, seeking into a large original can have substantial latency and transfer cost. The measured fixture is 8 MiB; no live cloud latency or billing measurement was performed.

Extend the shared strategy read options with a typed inclusive range, implement native S3 Range, Azure offset/count, and appropriate HTTP Range forwarding, and use the same contract from Media Studio. Do not add separate provider clients or credentials inside media. Test both returned bytes and upstream bytes/requests, including suffix/open-ended ranges, cancellation, and a backend that ignores Range; silently applying both remote and local slicing would corrupt the result.

## Rejected hypothesis — Axios streaming responses bypass the byte limit

Reading `MediaTransport.stream` alone suggests it checks only `Content-Length`. That is incomplete for this branch's installed dependency: Axios **1.20.0** also enforces `maxContentLength` on streamed responses after decompression. A source-only warning here would be a false positive.

The probe serves a chunked 4,096-byte body and a gzip body with a 40-byte compressed `Content-Length` but 4,096 decompressed bytes. With `maxBytes: 1024`, **both fail** with `ERR_BAD_RESPONSE: maxContentLength size of 1024 exceeded`. A declared oversized body fails with 413 before consumption; the JSON response limit also rejects; the canonical publication `MediaByteCounter` independently rejects when the transport is allowed a higher limit.

Consequently, Sourceful and Runway's `finished(response.resume())` drains are not proven to bypass the limit in this installed runtime. No finding is retained for that hypothesis. Preserve an HTTP-boundary contract test for chunked and compressed streams so future Axios changes or a supplied transport implementation cannot silently weaken this property. A fake Axios adapter returning a raw readable does not exercise Axios's actual limit enforcement.

## Additional controls and limits

- Redirect handling delegates to the shared SSRF helper, which forces `maxRedirects: 0`; the manual redirect loop therefore remains active. This pass did not discover an automatic-redirect bypass.
- FFmpeg execution uses an argument array with `shell: false`, protocol restrictions, bounded threads, bounded output, a kill timeout, and coordinated child/pipeline completion. Image derivatives use byte limits and an abort deadline. Those mechanisms are present; no new FFmpeg exploit or concurrency defect is claimed, and no FFmpeg binary was executed in this pass.
- This pass traced originals/renditions and cloud adapters without repeating the lifecycle audit's already reproduced deletion defects. It did not validate actual S3, CloudFront, Azure, or Firebase credentials, nor claim a full provider-specific codec compatibility matrix.
- Only the diagnostic and this report were added. No production source changed, so typechecks and Lighthouse were not repeated; the new evidence comes from the targeted runtime probes above.
