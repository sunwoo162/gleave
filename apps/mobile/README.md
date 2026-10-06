# Gleave Mobile

The Mobile target is a remote client, not a second EEEE runtime. It contains no
project database, Agent runtime, ClaimLatch engine, or secret provider tokens.

Startup flow:

1. The user displays a short-lived pairing code from the Desktop widget.
2. Mobile pairs through `POST /api/mobile/pair` and stores the returned device token
   in platform-secure storage.
3. Mobile sends assistant commands to `POST /api/mobile/assistant/route` with
   `X-Gleave-Bridge-Token`.
4. Mobile reads current state from `GET /api/mobile/state` and subscribes to
   `GET /api/mobile/events/stream` for live status, QA, review, and notification events.

The Desktop remains authoritative. Mobile can use the same EEEE secretary and
project capabilities by forwarding commands through the paired Desktop bridge.
This directory is the deployment boundary for a future standalone
`gleave-mobile` repository.
