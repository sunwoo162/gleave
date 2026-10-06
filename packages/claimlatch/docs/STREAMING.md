# Buffered and verified streaming protocol

## Status

The proxy implements this protocol for Chat Completions streams. It accepts `stream: true`, buffers the upstream SSE response privately, verifies the reconstructed choices, and replays the complete stream only after `PASS`. Textual choices use ClaimLatch directly; tool-call and multimodal choices require an explicit `structuredOutputVerifier`.

## Safety invariant

No generated token, delta, or assistant message may be sent to the client before ClaimLatch has verified the complete textual response and the policy gate has returned `PASS`. A client must never observe a prefix that is later blocked.

## Lifecycle

1. Validate the request and reject unsupported content shapes before contacting the upstream provider.
2. Forward the request with streaming enabled and read the upstream SSE response internally.
3. Parse complete SSE frames, reconstruct every textual choice, and buffer the frames without writing any response bytes to the client.
4. Enforce maximum buffered bytes, maximum choices, maximum reconstructed text per choice, and the upstream request deadline. Abort and fail closed when a limit is exceeded or the deadline expires.
5. Require a clean terminal event and valid JSON for every non-terminal frame. Missing, duplicated, or malformed choice indexes are blocking errors.
6. Verify every reconstructed textual choice with ClaimLatch. For tool-call or multimodal choices, reconstruct the final choice from its deltas and pass it to the explicit structured-output verifier. Without that verifier, fail closed.
7. If any choice is blocked, return the structured ClaimLatch `422` response. Because no downstream headers or body bytes were sent, the status remains authoritative.
8. If every choice passes, replay the buffered stream to the client using the original SSE framing, then send the terminal `[DONE]` event. The replay may be burstier than the upstream stream; correctness takes precedence over latency.

## Required limits and cancellation

- The proxy has separate limits for request bytes, buffered upstream bytes, reconstructed choice payload bytes, choice count, and upstream duration. The upstream duration defaults to 120 seconds and can be disabled explicitly with `upstreamTimeoutMs: 0`.
- A disconnected client must abort the upstream request and release buffered memory.
- An upstream disconnect before a valid terminal event must not become a partial `PASS`.
- Each request must own its buffers; no stream data may be shared across requests.
- The proxy must not use `Content-Length` from the upstream when replaying an SSE response.

## Compatibility boundary

The current implementation supports textual Chat Completions choices and preserves the existing request/response header policy. It rejects or fails closed for:

- structured output without an explicit verifier;
- malformed tool-call or multimodal delta parts;
- multiple choices with missing or conflicting indexes;
- upstream SSE error events after ordinary deltas;
- providers that omit a terminal event or use non-standard event framing.

The downstream response should remain `text/event-stream` only after verification succeeds. Before that point, the proxy must not commit the response status or headers.

## Implementation acceptance criteria

- A blocked stream never exposes any assistant token to the client.
- A passing stream preserves the complete textual answer and verifies every choice.
- Malformed, truncated, over-limit, timed-out, or unverified structured streams fail closed.
- Client disconnects cancel upstream work and do not leave a live request behind.
- Tests cover frame parsing, choice reconstruction, limits, cancellation, blocked replay, passing replay, and upstream error propagation.
- The existing non-streaming path and its OpenAI-compatible header behavior remain unchanged.

The current implementation covers the textual path, complete `[DONE]` framing, blocked replay prevention, malformed/truncated streams, multiple choices, buffer and per-choice limits, upstream deadlines, client-disconnect cancellation, and explicit verifier hooks for reconstructed tool-call and multimodal choices. Structured streams without a verifier still fail closed.
