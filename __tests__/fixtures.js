const { BN } = require('bn.js');
const {
  CompactIAddressObject,
  CompactAddressObject,
  VerifiableSignatureData,
  DataDescriptor,
  URLRef,
  CrossChainDataRef,
  CrossChainDataRefKey,
  VdxfUniValue
} = require('verus-typescript-primitives');

// Test system and identity addresses (valid base58 Verus testnet addresses)
// Using known valid Verus testnet i-addresses for testing
const SYSTEM_ID_TESTNET = "iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq";
const SYSTEM_ID_MAINNET = "i5w5MuNik5NtLcYmNzcvaoixooEebB6MGV"; 
const TEST_SIGNING_ID = "iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq"; // Valid testnet system ID
const TEST_REQUEST_ID = "iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq"; // Reuse valid testnet ID
const TEST_RECIPIENT_ID = "iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq"; // Reuse valid testnet ID

// Create sample CompactIAddressObject instances
const createTestSigningId = () => CompactIAddressObject.fromAddress(TEST_SIGNING_ID);
const createTestRequestId = () => CompactIAddressObject.fromAddress(TEST_REQUEST_ID);
const createTestRecipientId = () => CompactIAddressObject.fromAddress(TEST_RECIPIENT_ID);
const createTestSystemId = () => CompactIAddressObject.fromAddress(SYSTEM_ID_MAINNET);

// Create sample VerifiableSignatureData
const createTestSignatureData = () => new VerifiableSignatureData({
  systemID: createTestSystemId(),
  identityID: createTestSigningId()
});

// Create sample statements
const createTestStatements = () => [
  "This is a test statement 1",
  "This is a test statement 2"
];

// Create a sample DataDescriptor with simple data
const createSimpleDataDescriptor = (data = "Test data") => {
  const buffer = Buffer.from(data, 'utf-8');
  return DataDescriptor.fromJson({
    version: 1,
    objectdata: buffer.toString('hex')
  });
};

// Create a sample DataDescriptor with URL (for download flag tests)
const createUrlDataDescriptor = (url = "https://example.com/data.json", dataHash = null) => {
  const urlRefParams = { version: URLRef.LAST_VERSION, url: url };
  if (dataHash) {
    urlRefParams.flags = URLRef.FLAG_HAS_HASH;
    urlRefParams.dataHash = Buffer.from(dataHash, 'hex');
  }
  const urlRef = new URLRef(urlRefParams);
  const ccdref = new CrossChainDataRef(urlRef);
  
  const urlRefMap = [];
  urlRefMap.push({ [CrossChainDataRefKey.vdxfid]: ccdref });
  
  const urlRefUniValue = new VdxfUniValue({ values: urlRefMap });
  return DataDescriptor.fromJson({
    version: 1,
    objectdata: urlRefUniValue.toBuffer().toString('hex')
  });
};

// Create multiple DataDescriptors for testing
const createMultipleDataDescriptors = (count = 3) => {
  const descriptors = [];
  for (let i = 0; i < count; i++) {
    descriptors.push(createSimpleDataDescriptor(`Test data ${i + 1}`));
  }
  return descriptors;
};

// Sample redirect URIs for GenericRequest
const createTestRedirects = () => [
  { type: 1, uri: "verus://callback/success" },
  { type: 2, uri: "https://example.com/callback" }
];

// ── UserDataRequestDetails fixtures ──

// Valid VDXF key addresses (base58check i-addresses used as VDXF data keys)
const VDXF_KEY_ATTESTATION_NAME = "iEEjVkvM9Niz4u2WCr6QQzx1zpVSvDFub1";
const VDXF_KEY_CLAIMS_EMPLOYMENT = "i3bgiLuaxTr6smF8q6xLG4jvvhF1mmrkM2";
const VDXF_KEY_IDENTITY_OVER21  = "iAXYYrZaipc4DAmAKXUFYZxavsf6uBJqaj";
const VDXF_KEY_IDENTITY_EMAIL   = "iJ4pq4DCymfbu8SAuXyNhasLeSHFNKPr23";
const TEST_SIGNER_ID            = "iKjrTCwoPFRk44fAi2nYNbPG16ZUQjv1NB";
const TEST_USERDATA_REQUEST_ID  = "iD4CrjbJBZmwEZQ4bCWgbHx9tBHGP9mdSQ";

// Create signer CompactIAddressObject for UserDataRequestDetails
const createTestSigner = () => new CompactIAddressObject({
  version: CompactAddressObject.DEFAULT_VERSION,
  type: CompactAddressObject.TYPE_I_ADDRESS,
  address: TEST_SIGNER_ID,
  rootSystemName: "VRSC"
});

// Create requestID CompactIAddressObject for UserDataRequestDetails
const createUserDataRequestId = () => CompactIAddressObject.fromAddress(TEST_USERDATA_REQUEST_ID);

// Single searchDataKey entry
const createSingleSearchDataKey = (key = VDXF_KEY_ATTESTATION_NAME, value = "Attestation Name") => [{ [key]: value }];

// Multiple searchDataKey entries (for COLLECTION tests)
const createMultipleSearchDataKeys = () => [
  { [VDXF_KEY_ATTESTATION_NAME]: "Attestation Name" },
  { [VDXF_KEY_CLAIMS_EMPLOYMENT]: "Employment at Acme Widgets" }
];

// requestedKeys array (VDXF key addresses for PARTIAL_DATA)
const createTestRequestedKeys = () => [
  VDXF_KEY_IDENTITY_OVER21,
  VDXF_KEY_IDENTITY_EMAIL
];

// ── Tx Signing Request fixtures ──

const TX_SIGNING_VALID_TEMPLATE = {
  outputtotals: {
    iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq: 0.0002,
    iRXKBVTVqEPyHrFsUbUW5ahDZRqCWGMTXd: 1.0
  },
  feeamount: 0.0001,
  hextx: "0400008085202f890001204e000000000000971a040300010114cb8a0f7f651b484a81e2312c3438deb601e27368cc4c78040308010114cb8a0f7f651b484a81e2312c3438deb601e273684c5c01f1d9c9c1f8d5b89abc94e54a7680e5ffb6a74c93aed6c1008401a6ef9ea235635e328124ff3429db9f9e91b64e2d809b2004142f665ba5826cc5d1d660ba8a92792a8521aea009f1d9c9c1f8d5b89abc94e54a7680e5ffb6a74c937500000000a46211000000000000000000000000"
};

const createTxSigningPayload = (overrides = {}) => ({
  ...TX_SIGNING_VALID_TEMPLATE,
  ...overrides
});

const createTxSigningInvalidFixtures = () => ({
  missingHexTx: createTxSigningPayload({ hextx: undefined }),
  malformedHexTx: createTxSigningPayload({ hextx: "xyz-not-hex" }),
  oddLengthHexTx: createTxSigningPayload({ hextx: "abc" }),
  missingOutputTotals: createTxSigningPayload({ outputtotals: undefined }),
  emptyOutputTotals: createTxSigningPayload({ outputtotals: {} }),
  nonNumericOutput: createTxSigningPayload({
    outputtotals: {
      iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq: "not-a-number"
    }
  }),
  negativeOutput: createTxSigningPayload({
    outputtotals: {
      iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq: -1
    }
  }),
  invalidFeeAmount: createTxSigningPayload({ feeamount: -0.0001 }),
  tooManyDecimalsOutput: createTxSigningPayload({
    outputtotals: {
      iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq: "0.123456789"
    }
  }),
  tooManyDecimalsFee: createTxSigningPayload({ feeamount: "0.000000001" }),
  signedWithoutSigningId: createTxSigningPayload({ signed: true, signingId: "" })
});

module.exports = {
  SYSTEM_ID_TESTNET,
  SYSTEM_ID_MAINNET,
  TEST_SIGNING_ID,
  TEST_REQUEST_ID,
  TEST_RECIPIENT_ID,
  createTestSigningId,
  createTestRequestId,
  createTestRecipientId,
  createTestSystemId,
  createTestSignatureData,
  createTestStatements,
  createSimpleDataDescriptor,
  createUrlDataDescriptor,
  createMultipleDataDescriptors,
  createTestRedirects,
  // UserData fixtures
  VDXF_KEY_ATTESTATION_NAME,
  VDXF_KEY_CLAIMS_EMPLOYMENT,
  VDXF_KEY_IDENTITY_OVER21,
  VDXF_KEY_IDENTITY_EMAIL,
  TEST_SIGNER_ID,
  TEST_USERDATA_REQUEST_ID,
  createTestSigner,
  createUserDataRequestId,
  createSingleSearchDataKey,
  createMultipleSearchDataKeys,
  createTestRequestedKeys,
  // Tx signing fixtures
  TX_SIGNING_VALID_TEMPLATE,
  createTxSigningPayload,
  createTxSigningInvalidFixtures
};
