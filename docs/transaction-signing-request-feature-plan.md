# Transaction Signing Request QR Feature Plan (TDD-First)

## Goal

Implement a new request type that accepts a `sendcurrency` transaction template payload and produces a scannable wallet QR/deeplink for signing.

Primary focus is the logic pipeline (validation, envelope construction, serialization), not tab wiring or general UI scaffolding.

## Scope

In scope:

- Validate incoming template payload:
  - `hextx` (required hex string)
  - `outputtotals` (required object map of currency i-address to amount)
  - `feeamount` (required numeric)
- Convert the template into a wallet-compatible request payload.
- Serialize request to deeplink and QR data URL.
- Expose a dedicated API route in the same pattern as existing request generators.
- Add regression tests before implementation (Red -> Green -> Refactor).

Out of scope:

- Designing tab layout from scratch.
- Reworking global request routing infrastructure already established by prior commits.

## Existing Patterns To Reuse

Use these existing modules as implementation reference points:

- Request generation flow: `src/routes/requests/invoice.ts`
- Signed request flow and callback behavior: `src/routes/requests/serviceSigner.ts`
- Shared validation/signing helpers: `src/routes/utils.ts`
- API registration and route wiring: `src/server.ts`

This keeps behavior consistent with current endpoint contracts and error handling.

## Functional Requirements

1. Input contract

- Endpoint accepts JSON payload with:
  - `hextx: string`
  - `outputtotals: Record<string, number>`
  - `feeamount: number`
  - Optional: `signed: boolean`, `signingId: string`, `isTestnet: boolean`, `redirects`

2. Validation contract

- Reject missing or non-string `hextx`.
- Reject non-hex `hextx` or odd-length hex.
- Reject missing/non-object `outputtotals`.
- Reject empty `outputtotals`.
- Reject non-numeric, negative, or NaN amounts in `outputtotals`.
- Reject missing/non-positive `feeamount`.
- If `signed = true`, require `signingId`.
- Enforce fixed-point safety for all monetary inputs:
  - Parse incoming amounts/fees as decimal strings (or stringify immediately on ingest).
  - Convert to integer satoshis (`value * 10^8`) before validation/serialization logic.
  - Reject values with more than 8 decimal places.
  - Never rely on JS floating-point arithmetic for currency checks.

3. Serialization contract

- Decode `hextx` into bytes.
- Build a transaction-signing request object with explicit chain context (`VRSCTEST` by default).
- Serialize request using primitives-supported buffer serialization.
- Produce wallet deeplink string (expected URI protocol consistent with existing request outputs).
- Generate QR data URL from deeplink.

4. Response contract

- Success response:
  - `deeplink`
  - `qrDataUrl`
  - Optional debug fields only if already standard in project conventions
- Error response:
  - HTTP 400 for validation failures
  - HTTP 500 for unexpected/internal failures

## Architecture Plan

### 1) New request module

Add `src/routes/requests/txSigning.ts` (name can be adjusted to existing naming conventions).

Responsibilities:

- Parse/validate payload.
- Construct transaction signing request detail object.
- Wrap in generic request envelope if required by wallet format.
- Optionally sign when `signed = true` using existing `signRequest` helper flow.
- Return deeplink + QR data URL.

### 2) Primitive compatibility adapter

Because primitive APIs can vary by version, isolate constructor/serialization behind a small adapter:

- `buildTxSigningRequestFromTemplate(input, chainContext)`

Adapter strategy:

- First attempt a dedicated tx request primitive if present in installed `verus-typescript-primitives`.
- Fallback to generic VDXF envelope construction if dedicated class is unavailable.

This avoids spreading version checks throughout endpoint code.

### 3) Route wiring

- Export the new handler from route index.
- Register endpoint in `src/server.ts` under `/api/...` consistent with other request generators.

### 4) UI integration

- Minimal change: bind existing tab wiring pattern to call the new endpoint and render returned `deeplink` + `qrDataUrl`.
- Keep GUI work intentionally thin.

## TDD Workflow

## Phase 0: Baseline and fixture setup

Create fixtures from the provided template sample:

- Valid payload fixture (your provided `hextx`, `outputtotals`, `feeamount`).
- Invalid fixtures:
  - malformed hex
  - empty output map
  - negative fee
  - non-numeric output values

Proposed files:

- `__tests__/fixtures.js` (extend existing fixture helpers)
- `__tests__/txSigning.test.js` (new)

## Phase 1: Red tests for validation

Write failing tests first for endpoint-level validation:

1. rejects missing `hextx`
2. rejects malformed `hextx`
3. rejects missing `outputtotals`
4. rejects empty `outputtotals`
5. rejects invalid `feeamount`
6. requires `signingId` when `signed` is true
7. rejects `outputtotals` values with more than 8 decimal places
8. rejects precision-drift edge cases unless they normalize cleanly to integer satoshis

Expected assertions:

- HTTP status 400
- stable error message fragments (avoid brittle full-string matching)

## Phase 2: Red tests for serialization behavior

Add failing tests for core conversion path:

1. valid payload produces a deeplink string.
2. valid payload produces QR data URL prefix `data:image/png;base64,`.
3. deeplink can be parsed by the corresponding primitive decode path (roundtrip sanity).
4. request marks testnet context by default when testnet settings are active.
5. serialization path only accepts normalized integer-satoshi values from validation.

If direct decode is unavailable, assert deterministic serialization properties:

- deeplink non-empty
- stable protocol prefix
- no thrown errors during request object -> buffer conversion

## Phase 3: Green implementation

Implement minimal code to satisfy failing tests:

1. Add parsing + validation helpers for tx template payload.
2. Add adapter/wrapper that builds request detail object from raw tx buffer.
3. Generate deeplink and QR.
4. Add optional signing branch reusing existing `signRequest` workflow.
5. Wire endpoint in routes + server.

Run:

- `yarn test txSigning`
- `yarn test`

## Phase 4: Refactor with safety

Refactor only after green:

- Extract duplicated validation into shared helpers only when reused by at least two modules.
- Keep endpoint handler slim by moving transformation logic to pure helper functions.
- Preserve API response shape validated by tests.

Add/maintain regression tests for any refactor-induced edge case.

## Phase 5: Integration checks

1. Manual API smoke test with provided sample payload.
2. Confirm QR scans in Verus Mobile.
3. Confirm wallet behavior for:
  - supported chain mode (testnet vs mainnet mismatch)
  - expired template handling (if expiry already elapsed)
4. Treat the checked-in fixture payload as unit-test-only data. For real mobile scan validation, always generate a fresh `sendcurrency` template from local daemon so `expiryheight` is in the future.

## Test Matrix

Minimum matrix to keep long-term confidence:

1. Payload validation tests (required fields, types, boundaries).
2. Serialization tests (buffer conversion + deeplink generation).
3. Signing branch tests (`signed=true` with/without valid signing identity).
4. Compatibility tests for primitive adapter fallback behavior.
5. Regression test for the exact provided sample payload.

## Risk Register

1. Primitive API mismatch
- Mitigation: adapter with capability detection and dedicated tests per path.

2. Wallet deeplink incompatibility
- Mitigation: decode/roundtrip tests where possible plus manual mobile scan verification.

3. Numeric precision drift for amounts
- Mitigation: normalize numeric parsing and avoid floating arithmetic in serialization layer.

4. Chain-context mismatch
- Mitigation: explicit default to testnet system id and test assertion for this default.

## Acceptance Criteria

1. New API route exists and returns `deeplink` + `qrDataUrl` for valid tx template payload.
2. Route returns 400 for all invalid input classes listed above.
3. Route supports optional request signing using existing project signing flow.
4. New test suite passes locally and includes regression coverage for provided sample.
5. Existing tests remain green.

## Implementation Order Checklist

1. Add fixtures for valid/invalid tx templates.
2. Add failing validation tests.
3. Add failing serialization tests.
4. Implement tx template validator and request adapter.
5. Implement new endpoint handler.
6. Wire exports and server route.
7. Make tests pass.
8. Refactor safely with tests green.
9. Perform manual scan verification.

## Notes For Codex-5.3 Execution

- Prefer current repository patterns over introducing new framework abstractions.
- Keep request logic deterministic and side-effect-light for testability.
- If a dedicated tx request primitive is absent in current dependency pins, ship generic VDXF envelope fallback first, protected by tests.
- Preserve extensibility: this endpoint may later support additional tx-template metadata (for example destination currency hints or policy flags).