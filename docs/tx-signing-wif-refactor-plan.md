# Tx Signing WIF Refactor Plan (TDD-First)

## Objective

Fix wallet signature verification failures for transaction-signing requests by switching the signed path from RPC signData signing to WIF-based GenericRequest signing, reusing the existing Service Signer WIF configuration, and making signed mode default-on in the UI.

## Why This Change

- Current signed tx-signing flow uses RPC signData and can fail wallet verification due to mismatched signing semantics.
- Service signer flow already uses a WIF-based signing path that is proven in this codebase.
- Unsigned tx-signing requests can be rejected by wallet policy for requiring a signature.

## Scope

In scope:

- Backend: tx-signing signed branch refactor to WIF-based signing, reusing Service Signer config.
- Frontend: set Tx Signing signed mode default-on and align UX messaging.
- Tests: add/update regression tests for both backend signing path and UI defaults.
- Docs: update status/progress and verification notes.

Out of scope:

- Creating new cryptographic primitives classes not present in current pinned dependencies.
- Changing Service signer behavior itself.

## Target Files

- src/routes/requests/txSigning.ts
- src/routes/utils.ts (only if helper extraction is needed)
- views/tabs/tx-signing/panel.ejs
- public/app.js
- __tests__/txSigning.test.js
- docs/transaction-signing-request-feature-plan.md

## Technical Strategy

1. Reuse Service Signer WIF config

- Use existing Service Signer configuration source as the signing key provider.
- Do not introduce a parallel tx-signing-specific WIF key unless explicitly requested later.

2. Switch tx-signing signed branch to WIF-based GenericRequest signing

- Keep existing request construction and VDXF detail serialization logic.
- Replace the signed branch signing call with the same signing style used by Service signer:
  - Build GenericRequest envelope and signature metadata.
  - Sign the request with WIF-based path via client/library helper.
- Preserve endpoint response contract:
  - deeplink
  - qrDataUrl

3. UI signed mode default-on

- Ensure Tx Signing tab checkbox starts checked.
- Keep manual opt-out available unless product requires hard-enforced signing.
- Improve status/help text to indicate signed mode is recommended/default.

## TDD Plan

## Phase A: Red tests for backend signing refactor

Add failing tests in __tests__/txSigning.test.js that assert:

- Signed tx-signing path uses WIF-based signing call path, not RPC signData path.
- Signed response produces parseable GenericRequest deeplink with signed metadata.
- Unsigned path still works and does not call signer.
- Missing Service Signer WIF config for signed mode returns clear validation/server error.

Expected initial result: failing tests before refactor implementation.

## Phase B: Green backend implementation

- Implement WIF-based signing in src/routes/requests/txSigning.ts.
- Reuse Service Signer config retrieval and signing API pattern.
- Keep existing serialization and validation behavior unchanged.

Expected result: backend tests pass with no regression to unsigned flow.

## Phase C: Red tests for UI default behavior

Add/extend test coverage to assert:

- Tx Signing signed checkbox renders checked by default.
- Frontend submit path includes signed true by default when user does not toggle off.

If automated UI test harness is not available for this exact assertion, add lightweight DOM-level test or explicit browser verification checklist and capture result in status notes.

## Phase D: Green UI implementation

- Update panel markup and any initialization logic to ensure default-on is stable.
- Confirm form submit behavior for both checked and unchecked states.

Expected result: UI default behavior and payload generation align with backend expectations.

## Phase E: Regression and integration verification

Run minimum validation suite:

- yarn build --pretty false
- yarn test txSigning.test.js
- yarn test server.txSigningRoute.integration.test.js

Then perform manual API/UI checks:

- Unsigned tx-signing still generates deeplink/QR when allowed.
- Signed tx-signing generates signature accepted by wallet verification flow (environment permitting).

## Status / Progress

Last updated: 2026-07-09

Current status for this plan:

- Planning: Completed
- Implementation: Not started
- Tests added for WIF refactor: Not started
- Backend WIF signing refactor: Not started
- UI signed-default update: Not started
- Verification: Not started

Execution checklist:

1. Add failing backend tests for WIF-based signed path.
2. Implement backend WIF signing reuse from Service signer config.
3. Add failing UI default-on test/check.
4. Implement signed-default UI behavior.
5. Run build and regression suites.
6. Run manual API/UI verification and capture outcomes.
7. Update docs status and closeout notes.

## Risks and Mitigations

1. WIF unavailable in config
- Mitigation: explicit error path and test for missing/empty WIF.

2. Wallet still rejects signature
- Mitigation: compare signing path exactly to Service signer implementation and add parse/signature metadata assertions.

3. UI default drift in future edits
- Mitigation: add durable test/check plus clear help text in panel.

## Definition of Done

1. Signed tx-signing flow uses WIF-based signing path reused from Service signer configuration.
2. Tx Signing UI defaults to signed mode on first render.
3. Tests covering signed and unsigned paths pass.
4. Build passes and no regressions in tx-signing/server route tests.
5. Status/progress notes updated with verification outcomes.