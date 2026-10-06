# Iseol Production ChatGPT Playwright Driver Design

## 1. Purpose

Iseol already has a narrow `ChatGptBrowserDriver` contract and a production adapter shell, but no production browser implementation. This phase adds the authenticated browser capability required for real ChatGPT Web execution without bypassing the existing Harness or ChatGPT Web contracts.

The driver must automate `chatgpt.com` through a dedicated persistent browser profile, preserve durable conversation identity, return only bounded structured results, and fail closed whenever authentication or UI identity cannot be proven.

## 2. Scope

In scope:
- a Playwright-backed `ChatGptBrowserDriver` implementation;
- a dedicated persistent Chromium/Chrome user-data directory;
- new/open/resume conversation handling;
- prompt submission with prompt-SHA turn identity;
- structured assistant-result extraction;
- authentication/session-loss classification;
- production resolver/configuration and bridge bootstrap wiring;
- deterministic driver tests and a controlled live-smoke command.

Out of scope:
- storing ChatGPT cookies, access tokens, or credentials in Iseol data files;
- bypassing login, CAPTCHA, MFA, or anti-bot controls;
- coordinate-based clicking or unrestricted browser scripting;
- changing Idea Lab Campaign orchestration in this phase;
- treating fake-browser results as live success.
## 3. Approaches considered

### A. Dedicated persistent Playwright profile — selected

Launch Chromium/Chrome with a dedicated Iseol user-data directory. The user signs in interactively once; subsequent runs reuse the browser-owned session.

Advantages:
- isolated from the user's normal browsing profile;
- stable restart/recovery behavior;
- no explicit cookie/token export into Iseol stores;
- testable through a narrow injected browser-page boundary.

Trade-off: ChatGPT DOM changes can break selectors, so selectors must be conservative and fail closed.

### B. Attach to the user's normal Chrome through CDP

This avoids a second login but couples Iseol to an actively used browser, risks selecting the wrong tab/profile, and produces weaker restart guarantees. Rejected for production default.

### C. Screen-coordinate automation

This is fragile across viewport, localization, layout, and accessibility changes and cannot prove element identity. Rejected.

## 4. Architecture

```text
ChatGpt Web executor
  -> createProductionChatGptWebAdapter
    -> ChatGptBrowserDriver
      -> PlaywrightChatGptBrowserDriver
        -> dedicated persistent browser context
          -> chatgpt.com
```

The existing `ChatGptBrowserDriver` interface remains authoritative. The Playwright implementation must not expose raw Playwright Page/Context objects outside its module.
## 5. Configuration and ownership

Production configuration is opt-in:
- `ISEOL_CHATGPT_BROWSER_ENABLED=true` enables the concrete browser driver;
- `ISEOL_CHATGPT_BROWSER_PROFILE_ROOT` selects the dedicated user-data directory;
- `ISEOL_CHATGPT_BROWSER_EXECUTABLE` optionally selects a Chrome/Chromium executable;
- `ISEOL_CHATGPT_BROWSER_HEADLESS` defaults to `false` for authenticated use.

No credential value is accepted as configuration. The profile root must not live inside the repository, model root, run root, or web-served directories. The resolver rejects unsafe/missing profile configuration when enabled.

The driver owns one persistent browser context per process. It may reuse pages for known conversation references but must resolve conversation identity from the URL before mutation.

## 6. Conversation identity

Canonical conversation references use only the ChatGPT conversation identifier, not a full arbitrary URL. A resumed conversation must resolve to `https://chatgpt.com/c/<conversationRef>` and the resulting page URL must still identify the same reference before prompt submission.

For a new conversation, the driver opens the canonical ChatGPT start page and proves an authenticated composer exists. ChatGPT may not assign a canonical `/c/<id>` URL until the first prompt is submitted, so the open result may omit `conversationRef`; the first successful submit must capture the assigned canonical reference and return it to the adapter for immediate durable session persistence.

If the expected conversation cannot be proven, the driver throws `ChatGptWebSessionLostError`; it never silently creates a replacement conversation while resuming an existing one.

## 7. Authentication and UI safety

Authentication is proven by the authenticated chat surface, not by assuming that a non-login URL means success. Login/sign-up surfaces produce `ChatGptWebAuthenticationRequiredError`.

Selectors must prefer stable semantic/accessibility contracts: textarea/contenteditable composer role, send/stop controls, assistant message containers, and URL identity. Multiple ambiguous candidate elements, missing expected controls, or unexpected navigation are hard failures.

The driver must never:
- click arbitrary matching text outside the expected chat surface;
- solve or bypass CAPTCHA/MFA;
- inspect/export browser cookies into logs or Iseol state;
- log prompt bodies or complete assistant payloads on errors.
## 8. Turn submission and result extraction

`openOrResumeConversation` prepares and validates the page; it does not count a prompt as submitted. For a resumed conversation it returns the proven canonical reference; for a new conversation it may return no reference until ChatGPT assigns one. `submitPrompt` re-validates any existing identity, fills the authenticated composer, performs exactly one send action for the supplied prompt SHA, then captures and returns the canonical reference when the first submit creates it.

The driver keeps only bounded in-memory turn state needed to prevent accidental duplicate submission within the process. Durable duplicate/recovery guarantees remain owned by the existing ChatGPT Web session/run stores and prompt SHA contract.

`readStructuredResult` waits until the current assistant turn is complete. Completion requires a stable assistant message plus absence of a generating/stop state for a bounded settle window. Timeout is classified as session loss, not partial success.

Structured extraction accepts exactly one JSON value from the final assistant message. Markdown JSON fences may be stripped, but surrounding prose, multiple JSON values, malformed JSON, or oversized output are rejected. The parsed value is returned to the existing production adapter, which performs the domain-specific schema validation.

## 9. Probe and close behavior

`probeConversation` returns the existing browser-session probe states using URL identity and authenticated UI state:
- active when the exact conversation exists and authenticated chat controls are available;
- authentication-required when login is required;
- missing/session-lost when the conversation cannot be resolved safely.

`closeConversation` closes only the page/session owned for that conversation. It does not sign out, delete conversations, clear the persistent profile, or close unrelated browser pages.

## 10. Dependency boundary

Playwright is a production dependency because the concrete driver runs in the deployed/local Iseol process. Browser installation is not performed implicitly at runtime. The configured executable or an installed Playwright Chromium must be available before the driver is enabled.

Tests inject a narrow browser backend/fake page model where possible. Tests must not require a real ChatGPT account.

## 11. Bootstrap behavior

`src/index.ts` resolves the concrete driver only when both the existing ChatGPT Web bridge and the new browser driver are enabled. Missing/unsafe browser configuration causes startup of that capability to be rejected explicitly while unrelated Discord/Web services continue using the existing guarded bootstrap pattern.

The bridge never substitutes a fake driver in production.
## 12. Error model

The concrete driver maps browser failures into the established error contract:
- authenticated surface absent / login required -> `ChatGptWebAuthenticationRequiredError`;
- wrong or missing conversation, navigation drift, timeout, closed page/context, ambiguous UI -> `ChatGptWebSessionLostError`;
- malformed structured assistant output remains a bounded result-validation failure at the adapter/executor boundary.

Errors may include bounded operation names and conversation references, but never profile secrets, cookies, prompt text, or full page content.

## 13. Test strategy

TDD coverage is required for:
1. config defaults and unsafe profile-root rejection;
2. new conversation creation and canonical reference capture;
3. exact conversation resume without replacement;
4. login/authentication-required detection;
5. prompt submission exactly once for a turn;
6. conversation URL mismatch before mutation;
7. structured JSON extraction and markdown-fence handling;
8. prose/multiple/oversized structured-result rejection;
9. generation completion, timeout, and session-loss classification;
10. probe behavior and close isolation;
11. process restart/resume using the same conversation reference;
12. bootstrap selection of the real driver only when explicitly enabled.

Existing ChatGPT Web, Harness, Desktop Agent, Idea Lab, evaluation, Discord, and Web Control Plane suites must remain green.

## 14. Live smoke

A separate opt-in smoke command may launch the dedicated persistent profile and verify authentication plus one bounded structured turn. It must never auto-login or create credentials. If authentication/profile/browser capability is unavailable, smoke exits with the existing external-blocker semantics rather than reporting pass.

The smoke command must not be part of normal `npm test`.
## 15. Security invariants

- No ChatGPT credential/cookie/token is persisted by Iseol.
- Browser profile stays outside repository/project/run roots.
- Existing prompt/result redaction and durable-store validation remain authoritative.
- No arbitrary URL navigation from model output or assistant content.
- No DOM selector fallback that converts uncertainty into mutation.
- No fake browser may satisfy a live evaluation.
- Browser shutdown/restart cannot change the canonical Run or conversation identity silently.

## 16. Expected modules

Likely additions:
- `src/chatgpt-web/playwright-browser-driver.ts`
- `src/chatgpt-web/playwright-browser-config.ts`
- `src/chatgpt-web/playwright-browser-backend.ts` or equivalent narrow testable boundary
- `tests/chatgpt-web-playwright-driver.test.ts`
- `scripts/chatgpt-web-browser-smoke.ts`

Likely modifications:
- `src/config.ts`
- `src/index.ts`
- `.env.example`
- `package.json` / lockfile
- ChatGPT Web execution notes/evaluation live-blocker detection.

Exact filenames may change during implementation planning, but the driver contract, security invariants, and fail-closed behavior above are authoritative.

## 17. Success criteria

This phase is complete when a production-configured Iseol process can reuse a dedicated authenticated browser profile, safely open/resume an exact ChatGPT conversation, submit one bounded prompt turn, obtain one validated structured result, survive process restart without replacing the conversation, and fail closed on authentication/UI/session uncertainty.

Deterministic tests and the full repository suite must pass. Real ChatGPT smoke remains optional and may be `blocked-external` until the user has authenticated the dedicated profile. Idea Lab Campaign runtime wiring remains the next phase after this capability and a production proposal provider exist.