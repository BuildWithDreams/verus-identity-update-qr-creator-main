const registeredPostHandlers = new Map();

jest.mock('express', () => {
  const expressFactory = () => {
    const app = {
      set: jest.fn(),
      use: jest.fn(),
      get: jest.fn(),
      post: jest.fn((path, handler) => {
        registeredPostHandlers.set(path, handler);
      }),
      listen: jest.fn((_port, cb) => {
        if (typeof cb === 'function') cb();
        return { close: jest.fn() };
      })
    };

    return app;
  };

  expressFactory.json = jest.fn(() => 'json-middleware');
  expressFactory.static = jest.fn(() => 'static-middleware');

  return expressFactory;
});

jest.mock('../src/routes', () => {
  const makeNoop = () => jest.fn((_req, res) => res.json({ ok: true }));

  return {
    generateQr: makeNoop(),
    generateServiceSignerQr: makeNoop(),
    serviceSignerCallback: makeNoop(),
    serviceSignerCallbackRedirect: makeNoop(),
    serviceSignerStatus: makeNoop(),
    generateAuthQr: makeNoop(),
    generateInvoiceQr: makeNoop(),
    generateAppEncryptionQr: makeNoop(),
    generateDataPacketQr: makeNoop(),
    signDataPacket: makeNoop(),
    fetchAndHashUrl: makeNoop(),
    listZAddresses: makeNoop(),
    createAttestation: makeNoop(),
    generateUserDataQr: makeNoop(),
    createAttestationForTab: makeNoop(),
    signAttestationPacket: makeNoop(),
    generateAttestationQr: makeNoop(),
    generateTxSigningQr: jest.fn(async (req, res) => {
      if (req?.body?.signed === true) {
        res.json({ ok: true, flow: 'signed', signingId: req.body.signingId || null });
      } else {
        res.json({ ok: true, flow: 'unsigned' });
      }
    })
  };
});

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

describe('server route integration - /api/generate-tx-signing-qr', () => {
  beforeAll(() => {
    process.env.UI_PORT = '3999';
    require('../src/server');
  });

  afterAll(() => {
    delete process.env.UI_PORT;
  });

  test('registers tx signing endpoint in server route table', () => {
    const routes = require('../src/routes');
    const handler = registeredPostHandlers.get('/api/generate-tx-signing-qr');

    expect(handler).toBeDefined();
    expect(handler).toBe(routes.generateTxSigningQr);
  });

  test('executes unsigned request flow through registered tx signing endpoint', async () => {
    const handler = registeredPostHandlers.get('/api/generate-tx-signing-qr');
    const req = {
      body: {
        signed: false,
        hextx: '00',
        outputtotals: { iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq: 1 },
        feeamount: 0.0001
      }
    };
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, flow: 'unsigned' });
  });

  test('executes signed request flow through registered tx signing endpoint', async () => {
    const handler = registeredPostHandlers.get('/api/generate-tx-signing-qr');
    const req = {
      body: {
        signed: true,
        signingId: 'iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq',
        hextx: '00',
        outputtotals: { iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq: 1 },
        feeamount: 0.0001
      }
    };
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      flow: 'signed',
      signingId: 'iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq'
    });
  });
});
