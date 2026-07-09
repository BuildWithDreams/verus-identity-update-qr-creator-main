# Verus Mobile Tx-Signing Support Patch Plan

## Goal

Add wallet support for tx-signing GenericRequest detail key `iJzdw73Hc9rJBHHDsoM9JKUV5sw4N9Msto` so scans no longer fail with:

- `No validator function found for key ...`

This plan preserves existing signature verification behavior and only adds support for the new detail type.

## Current Failure Point

In Verus Mobile generic request validation, detail keys are mapped to a fixed validator table. The tx-signing key is not present, so the flow throws before rendering UI.

## Patch Set 1: Validator Support

### 1. Add a tx-signing validator module

Create a new validator module (for example `txSigningRequestValidator.js`) with:

- `validateTxSigningRequestVDXFObject(request, detailIndex)`

Validation responsibilities:

- Ensure detail exists at `detailIndex`.
- Ensure detail key is exactly `iJzdw73Hc9rJBHHDsoM9JKUV5sw4N9Msto`.
- Decode detail data bytes to UTF-8 JSON.
- Validate required payload fields:
  - `type === "tx-signing-template"`
  - `chain` is `VRSC` or `VRSCTEST`
  - `hextx` is non-empty hex with even length
  - `outputtotalsSats` is object with at least one positive integer-string amount
  - `feeSats` is positive integer-string
  - if request is signed, `signingId` exists
- Throw specific validation errors per failure class.

### 2. Register validator in envelope validator map

In `envelopeValidator` detail-key mapping:

- Add key `iJzdw73Hc9rJBHHDsoM9JKUV5sw4N9Msto`
- Map to `validateTxSigningRequestVDXFObject`

### 3. Improve unknown-key diagnostics (optional but recommended)

When unknown detail keys are encountered:

- Keep failure behavior
- Include unknown key and list of supported keys in error message for easier triage

## Patch Set 2: GenericRequest UI/Handler Support

### 1. Add tx-signing detail handler

Create a handler module (for example `txSigningRequestDetailsHandler.js`) with:

- `handleTxSigningRequestVDXFObject(request, response, detailIndex)`

Responsibilities:

- Parse tx-signing detail payload once.
- Build `displayProps` for UI:
  - signer identity (from request signature)
  - chain
  - fee
  - output totals summary
  - hextx preview + copy/full view
- Return response unchanged in phase 1 (review path only).

### 2. Wire into GenericRequestHome switch map

Add VDXF key mapping:

- `iJzdw73Hc9rJBHHDsoM9JKUV5sw4N9Msto` -> `TxSigningRequestInfo`

### 3. Add `TxSigningRequestInfo` component

Minimum UI:

- Verified request header
- Signer identity and signature time (if available)
- Chain, fee, output totals
- Template tx hex preview
- Buttons: `Continue` and `Cancel`

Phase 1 Continue behavior:

- Proceed through generic request completion flow (or display explicit review-only support message)
- Do not silently fail

## Patch Set 3: Signature Verification Behavior

### 1. Keep existing signature verification path unchanged

Do not bypass `verifyGenericRequest(...)`.

### 2. Keep signature-required semantics

Tx-signing should remain signature-required unless product decision changes this.

## Tests to Add

### 1. Envelope validator tests

- Accept valid signed tx-signing request
- Reject malformed payload variants
- Reject unknown key with improved diagnostic message

### 2. Handler tests

- Parse tx-signing payload into display props
- Fail gracefully on malformed detail payload

### 3. DeepLink flow tests

- Tx-signing GenericRequest key reaches GenericRequest UI (no key-not-found throw)
- Invalid tx-signing payload surfaces expected validation error

## Suggested File Touch Points (Verus Mobile)

- `src/utils/deeplink/validator/envelopeValidator.js`
- `src/utils/deeplink/validator/txSigningRequestValidator.js` (new)
- `src/utils/deeplink/handlers/txSigningRequestDetailsHandler.js` (new)
- `src/containers/DeepLink/GenericRequestHome/GenericRequestHome.js`
- `src/containers/DeepLink/TxSigningRequestInfo/TxSigningRequestInfo.js` (new)
- Corresponding tests near existing deeplink validator/handler test suites

## Rollout Order

1. Merge Patch Set 1 (prevents immediate key-not-found crash).
2. Merge Patch Set 2 (renders tx-signing request in UI path).
3. Keep Patch Set 3 behavior guard unchanged.
4. Validate with signed QR generated from `https://qrcodes.vrsctest.buildwithdreams.com`.

## Acceptance Criteria

- Scanning tx-signing QR no longer throws `No validator function found for key ...`.
- Signed tx-signing requests pass generic request signature verification.
- User can view tx-signing request details in wallet UI and proceed/cancel intentionally.
- Existing GenericRequest types remain unaffected.
