const {
  createTxSigningPayload,
  createTxSigningInvalidFixtures
} = require('./fixtures');
const {
  GenericRequest,
  VDXF_OBJECT_RESERVED_BYTE_VDXF_ID_STRING
} = require('verus-typescript-primitives');

const mockSignGenericRequest = jest.fn(async (request) => request);
const mockGetSignatureInfo = jest.fn(async () => ({
  version: 1,
  hashtype: 1,
  height: 1
}));
const mockVerifyHash = jest.fn(async () => true);
const mockGetCurrentHeight = jest.fn(async () => 1);
const mockGetBlock = jest.fn(async () => ({ result: { time: 1700000000 } }));

jest.mock('verusid-ts-client', () => {
  const actual = jest.requireActual('verusid-ts-client');

  class MockVerusIdInterface {
    constructor() {
      this.interface = {
        getBlock: (...args) => mockGetBlock(...args)
      };
    }

    async signGenericRequest(...args) {
      return mockSignGenericRequest(...args);
    }

    async getSignatureInfo(...args) {
      return mockGetSignatureInfo(...args);
    }

    async verifyHash(...args) {
      return mockVerifyHash(...args);
    }

    async getCurrentHeight(...args) {
      return mockGetCurrentHeight(...args);
    }
  }

  return {
    ...actual,
    VerusIdInterface: MockVerusIdInterface
  };
});

const routeUtils = require('../src/routes/utils');
const getServiceSignerConfigSpy = jest.spyOn(routeUtils, 'getServiceSignerConfig').mockImplementation(() => ({
  serviceSignerWif: 'Uq6YMockSignerWifForTestsOnly',
  serviceSignerIAddress: 'iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq'
}));
const signGenericRequestSpy = mockSignGenericRequest;
const getSignatureInfoSpy = mockGetSignatureInfo;
const verifyHashSpy = mockVerifyHash;
const getCurrentHeightSpy = mockGetCurrentHeight;
const getBlockSpy = mockGetBlock;

const TX_SIGNING_TEMPLATE_VDXF_TEXT_KEY = 'vrsc::request.txsigningtemplate';

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

  beforeEach(() => {
    getServiceSignerConfigSpy.mockReset();
    getServiceSignerConfigSpy.mockImplementation(() => ({
      serviceSignerWif: 'Uq6YMockSignerWifForTestsOnly',
      serviceSignerIAddress: 'iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq'
    }));
    signGenericRequestSpy.mockClear();
    getSignatureInfoSpy.mockClear();
    verifyHashSpy.mockClear();
    getCurrentHeightSpy.mockClear();
    getBlockSpy.mockClear();
    getSignatureInfoSpy.mockImplementation(async () => ({
      version: 1,
      hashtype: 1,
      height: 1
    }));
    verifyHashSpy.mockImplementation(async () => true);
    getCurrentHeightSpy.mockImplementation(async () => 1);
    getBlockSpy.mockImplementation(async () => ({ result: { time: 1700000000 } }));
  });

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

  test('signed mode no longer requires payload signingId when service signer config is present', async () => {
    const handler = loadTxSigningHandler();
    const res = await callHandler(handler, invalid.signedWithoutSigningId);

    expect(res.statusCode).toBe(200);
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

    expect(res.statusCode).toBe(200);
  });
});

describe('TxSigning request - Phase 2 serialization behavior', () => {
  beforeEach(() => {
    getServiceSignerConfigSpy.mockReset();
    getServiceSignerConfigSpy.mockImplementation(() => ({
      serviceSignerWif: 'Uq6YMockSignerWifForTestsOnly',
      serviceSignerIAddress: 'iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq'
    }));
    signGenericRequestSpy.mockClear();
    getSignatureInfoSpy.mockClear();
    verifyHashSpy.mockClear();
    getCurrentHeightSpy.mockClear();
    getBlockSpy.mockClear();
    getSignatureInfoSpy.mockImplementation(async () => ({
      version: 1,
      hashtype: 1,
      height: 1
    }));
    verifyHashSpy.mockImplementation(async () => true);
    getCurrentHeightSpy.mockImplementation(async () => 1);
    getBlockSpy.mockImplementation(async () => ({ result: { time: 1700000000 } }));
  });

  test('valid payload produces a primitives generic deeplink', async () => {
    const handler = loadTxSigningHandler();
    const res = await callHandler(handler, createTxSigningPayload());

    expect(res.statusCode).toBe(200);
    expect(typeof res.body.deeplink).toBe('string');
    expect(res.body.deeplink.startsWith('verus://1/')).toBe(true);
  });

  test('valid payload produces QR data URL', async () => {
    const handler = loadTxSigningHandler();
    const res = await callHandler(handler, createTxSigningPayload());

    expect(res.statusCode).toBe(200);
    expect(typeof res.body.qrDataUrl).toBe('string');
    expect(res.body.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });

  test('deeplink roundtrips via GenericRequest.fromWalletDeeplinkUri', async () => {
    const handler = loadTxSigningHandler();
    const res = await callHandler(handler, createTxSigningPayload());

    expect(res.statusCode).toBe(200);

    const parsed = GenericRequest.fromWalletDeeplinkUri(res.body.deeplink);
    expect(parsed).toBeTruthy();
    expect(Array.isArray(parsed.details)).toBe(true);
    expect(parsed.details.length).toBe(1);

    const detailJson = parsed.details[0].toJson();
    expect(detailJson.type).toBe(VDXF_OBJECT_RESERVED_BYTE_VDXF_ID_STRING.toString());
    expect(detailJson.vdxfkey).toBe(TX_SIGNING_TEMPLATE_VDXF_TEXT_KEY);
  });

  test('serialized detail payload uses normalized integer satoshi values', async () => {
    const handler = loadTxSigningHandler();
    const res = await callHandler(handler, createTxSigningPayload());

    expect(res.statusCode).toBe(200);

    const parsed = GenericRequest.fromWalletDeeplinkUri(res.body.deeplink);
    const detailJson = parsed.details[0].toJson();
    const detailData = JSON.parse(Buffer.from(detailJson.data, 'hex').toString('utf-8'));

    expect(typeof detailData.feeSats).toBe('string');
    expect(detailData.feeSats).toBe('10000');
    expect(typeof detailData.outputtotalsSats.iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq).toBe('string');
    expect(detailData.outputtotalsSats.iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq).toBe('20000');
    expect(detailData.outputtotalsSats.iRXKBVTVqEPyHrFsUbUW5ahDZRqCWGMTXd).toBe('100000000');
  });

  test('request defaults to testnet context unless explicitly disabled', async () => {
    const handler = loadTxSigningHandler();
    const testnetRes = await callHandler(handler, createTxSigningPayload());
    const mainnetRes = await callHandler(handler, createTxSigningPayload({ isTestnet: false }));

    expect(testnetRes.statusCode).toBe(200);
    expect(mainnetRes.statusCode).toBe(200);

    const parsedTestnet = GenericRequest.fromWalletDeeplinkUri(testnetRes.body.deeplink);
    const parsedMainnet = GenericRequest.fromWalletDeeplinkUri(mainnetRes.body.deeplink);

    expect(parsedTestnet.isTestnet()).toBe(true);
    expect(parsedMainnet.isTestnet()).toBe(false);
  });
});

describe('TxSigning request - signed envelope metadata/signature flow', () => {
  beforeEach(() => {
    getServiceSignerConfigSpy.mockReset();
    getServiceSignerConfigSpy.mockImplementation(() => ({
      serviceSignerWif: 'Uq6YMockSignerWifForTestsOnly',
      serviceSignerIAddress: 'iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq'
    }));
    signGenericRequestSpy.mockClear();
    getSignatureInfoSpy.mockClear();
    verifyHashSpy.mockClear();
    getCurrentHeightSpy.mockClear();
    getBlockSpy.mockClear();
    getSignatureInfoSpy.mockImplementation(async () => ({
      version: 1,
      hashtype: 1,
      height: 1
    }));
    verifyHashSpy.mockImplementation(async () => true);
    getCurrentHeightSpy.mockImplementation(async () => 1);
    getBlockSpy.mockImplementation(async () => ({ result: { time: 1700000000 } }));
  });

  test('signed=true invokes WIF signing via signGenericRequest with request + signer WIF', async () => {
    const handler = loadTxSigningHandler();
    const payload = createTxSigningPayload({
      signed: true,
      signingId: 'iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq'
    });

    const res = await callHandler(handler, payload);

    expect(res.statusCode).toBe(200);
    expect(getServiceSignerConfigSpy).toHaveBeenCalledTimes(1);
    expect(signGenericRequestSpy).toHaveBeenCalledTimes(1);
    expect(getSignatureInfoSpy).toHaveBeenCalledTimes(1);
    expect(verifyHashSpy).toHaveBeenCalledTimes(1);

    const signCall = signGenericRequestSpy.mock.calls[0];
    expect(signCall[0]).toBeTruthy();
    expect(signCall[0].isSigned()).toBe(true);
    expect(signCall[0].signature).toBeTruthy();
    expect(signCall[1]).toBe('Uq6YMockSignerWifForTestsOnly');

    const signatureJson = signCall[0].signature.toJson();
    expect(signatureJson.identityid.address).toBe('iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq');
  });

  test('signed deeplink parses as signed GenericRequest with signature metadata', async () => {
    const handler = loadTxSigningHandler();
    const res = await callHandler(handler, createTxSigningPayload({
      signed: true,
      signingId: 'iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq'
    }));

    expect(res.statusCode).toBe(200);

    const parsed = GenericRequest.fromWalletDeeplinkUri(res.body.deeplink);
    expect(parsed.isSigned()).toBe(true);
    expect(parsed.signature).toBeTruthy();

    const signatureJson = parsed.signature.toJson();
    expect(signatureJson.identityid.address).toBe('iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq');
    expect(signatureJson.systemid).toBeTruthy();
  });

  test('signed request detail payload signingId is normalized to service signer identity', async () => {
    const handler = loadTxSigningHandler();
    const res = await callHandler(handler, createTxSigningPayload({
      signed: true,
      signingId: 'iRXKBVTVqEPyHrFsUbUW5ahDZRqCWGMTXd'
    }));

    expect(res.statusCode).toBe(200);

    const parsed = GenericRequest.fromWalletDeeplinkUri(res.body.deeplink);
    const detailJson = parsed.details[0].toJson();
    const detailData = JSON.parse(Buffer.from(detailJson.data, 'hex').toString('utf-8'));

    expect(detailData.signingId).toBe('iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq');
  });

  test('signed requests align createdAt to chain block time for wallet verification window', async () => {
    const handler = loadTxSigningHandler();

    const res = await callHandler(handler, createTxSigningPayload({
      signed: true
    }));

    expect(res.statusCode).toBe(200);
    expect(getCurrentHeightSpy).toHaveBeenCalledTimes(1);
    expect(getBlockSpy).toHaveBeenCalledTimes(1);

    const parsed = GenericRequest.fromWalletDeeplinkUri(res.body.deeplink);
    expect(parsed.createdAt.toString()).toBe('1700000000');
  });

  test('unsigned requests do not invoke WIF signing helper', async () => {
    const handler = loadTxSigningHandler();
    const res = await callHandler(handler, createTxSigningPayload({ signed: false }));

    expect(res.statusCode).toBe(200);
    expect(signGenericRequestSpy).not.toHaveBeenCalled();
    expect(getServiceSignerConfigSpy).not.toHaveBeenCalled();
    expect(getSignatureInfoSpy).not.toHaveBeenCalled();
    expect(verifyHashSpy).not.toHaveBeenCalled();
  });

  test('signed requests return validation error when Service Signer WIF config is missing', async () => {
    const handler = loadTxSigningHandler();
    getServiceSignerConfigSpy.mockImplementationOnce(() => {
      throw new routeUtils.ValidationError('SERVICE_SIGNER_WIF is required.');
    });

    const res = await callHandler(handler, createTxSigningPayload({
      signed: true,
      signingId: 'iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq'
    }));

    expect(res.statusCode).toBe(400);
    expect(String(res.body.error || '').toLowerCase()).toContain('service_signer_wif');
    expect(signGenericRequestSpy).not.toHaveBeenCalled();
  });

  test('signed requests return clear error when local signature verification fails', async () => {
    const handler = loadTxSigningHandler();
    verifyHashSpy.mockImplementationOnce(async () => false);

    const res = await callHandler(handler, createTxSigningPayload({
      signed: true
    }));

    expect(res.statusCode).toBe(400);
    expect(String(res.body.error || '').toLowerCase()).toContain('failed local identity verification');
  });
});
