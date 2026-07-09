const {
  createTxSigningPayload,
  createTxSigningInvalidFixtures
} = require('./fixtures');

function createMockResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

async function callHandler(handler, body) {
  const req = { body };
  const res = createMockResponse();
  await handler(req, res);
  return res;
}

function loadTxSigningHandler() {
  // Intentionally points to planned module for red-phase TDD.
  // These tests should fail until Phase 3 implements this handler.
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const { generateTxSigningQr } = require('../src/routes/requests/txSigning');
  return generateTxSigningQr;
}

describe('TxSigning request - Phase 1 validation (RED)', () => {
  const invalid = createTxSigningInvalidFixtures();

  test('rejects missing hextx', async () => {
    const handler = loadTxSigningHandler();
    const res = await callHandler(handler, invalid.missingHexTx);

    expect(res.statusCode).toBe(400);
    expect(res.body.error.toLowerCase()).toContain('hextx');
  });

  test('rejects malformed hextx', async () => {
    const handler = loadTxSigningHandler();
    const res = await callHandler(handler, invalid.malformedHexTx);

    expect(res.statusCode).toBe(400);
    expect(res.body.error.toLowerCase()).toContain('hex');
  });

  test('rejects odd-length hextx', async () => {
    const handler = loadTxSigningHandler();
    const res = await callHandler(handler, invalid.oddLengthHexTx);

    expect(res.statusCode).toBe(400);
    expect(res.body.error.toLowerCase()).toContain('hex');
  });

  test('rejects missing outputtotals', async () => {
    const handler = loadTxSigningHandler();
    const res = await callHandler(handler, invalid.missingOutputTotals);

    expect(res.statusCode).toBe(400);
    expect(res.body.error.toLowerCase()).toContain('outputtotals');
  });

  test('rejects empty outputtotals', async () => {
    const handler = loadTxSigningHandler();
    const res = await callHandler(handler, invalid.emptyOutputTotals);

    expect(res.statusCode).toBe(400);
    expect(res.body.error.toLowerCase()).toContain('outputtotals');
  });

  test('rejects non-numeric outputtotals values', async () => {
    const handler = loadTxSigningHandler();
    const res = await callHandler(handler, invalid.nonNumericOutput);

    expect(res.statusCode).toBe(400);
    expect(res.body.error.toLowerCase()).toContain('outputtotals');
  });

  test('rejects negative outputtotals values', async () => {
    const handler = loadTxSigningHandler();
    const res = await callHandler(handler, invalid.negativeOutput);

    expect(res.statusCode).toBe(400);
    expect(res.body.error.toLowerCase()).toContain('outputtotals');
  });

  test('rejects invalid feeamount', async () => {
    const handler = loadTxSigningHandler();
    const res = await callHandler(handler, invalid.invalidFeeAmount);

    expect(res.statusCode).toBe(400);
    expect(res.body.error.toLowerCase()).toContain('feeamount');
  });

  test('requires signingId when signed is true', async () => {
    const handler = loadTxSigningHandler();
    const res = await callHandler(handler, invalid.signedWithoutSigningId);

    expect(res.statusCode).toBe(400);
    expect(res.body.error.toLowerCase()).toContain('signingid');
  });

  test('rejects output amount with more than 8 decimals', async () => {
    const handler = loadTxSigningHandler();
    const res = await callHandler(handler, invalid.tooManyDecimalsOutput);

    expect(res.statusCode).toBe(400);
    expect(res.body.error.toLowerCase()).toContain('decimal');
  });

  test('rejects feeamount with more than 8 decimals', async () => {
    const handler = loadTxSigningHandler();
    const res = await callHandler(handler, invalid.tooManyDecimalsFee);

    expect(res.statusCode).toBe(400);
    expect(res.body.error.toLowerCase()).toContain('decimal');
  });

  test('sanity check: valid fixture should eventually pass in Phase 2/3', async () => {
    const handler = loadTxSigningHandler();
    const res = await callHandler(handler, createTxSigningPayload());

    // This is intentionally expected to fail during red phase.
    expect(res.statusCode).toBe(200);
  });
});
