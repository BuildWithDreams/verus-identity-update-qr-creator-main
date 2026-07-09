import { Request, Response } from "express";
import * as QRCode from "qrcode";
import { BN } from "bn.js";
import {
  GenericRequest,
  GeneralTypeOrdinalVDXFObject,
  VDXF_OBJECT_RESERVED_BYTE_VDXF_ID_STRING,
  CompactAddressObject,
  CompactIAddressObject,
  VerifiableSignatureData
} from "verus-typescript-primitives";
import {
  ValidationError,
  requireString,
  parseRedirectsField,
  RedirectInput,
  buildResponseUris,
  getRpcConfig,
  getServiceSignerConfig,
  SYSTEM_ID_TESTNET
} from "../utils";
import { VerusIdInterface } from "verusid-ts-client";

type GenerateTxSigningQrPayload = {
  hextx?: unknown;
  outputtotals?: unknown;
  feeamount?: unknown;
  signed?: unknown;
  signingId?: unknown;
  isTestnet?: unknown;
  redirects?: unknown;
};

const SATOSHIS_PER_COIN = 100000000n;
const TX_SIGNING_TEMPLATE_VDXF_TEXT_KEY = "vrsc::request.txsigningtemplate";

type ParsedTxSigningInput = {
  signed: boolean;
  signingId?: string;
  isTestnet: boolean;
  redirects?: RedirectInput[];
  txHex: string;
  outputtotalsSats: Record<string, string>;
  feeSats: string;
};

function parseFixedPointToSats(value: unknown, fieldName: string): bigint {
  const normalized = typeof value === "number"
    ? String(value)
    : typeof value === "string"
      ? value.trim()
      : "";

  if (!normalized) {
    throw new ValidationError(`${fieldName} must be a decimal value.`);
  }

  // Reject scientific notation and enforce 0-8 decimals.
  const match = normalized.match(/^(\d+)(?:\.(\d{1,8}))?$/);
  if (!match) {
    throw new ValidationError(`${fieldName} must be a non-negative decimal with up to 8 places.`);
  }

  const intPart = BigInt(match[1]);
  const fracRaw = match[2] || "";
  const fracPadded = (fracRaw + "00000000").slice(0, 8);
  const fracPart = BigInt(fracPadded);

  return (intPart * SATOSHIS_PER_COIN) + fracPart;
}

function parseHexTransaction(value: unknown): Buffer {
  const hextx = requireString(value, "hextx");
  if (!/^[0-9a-fA-F]+$/.test(hextx)) {
    throw new ValidationError("hextx must be a valid hex string.");
  }
  if (hextx.length % 2 !== 0) {
    throw new ValidationError("hextx must have an even number of hex characters.");
  }

  return Buffer.from(hextx, "hex");
}

function parseOutputTotals(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    throw new ValidationError("outputtotals must be a JSON object.");
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) {
    throw new ValidationError("outputtotals must contain at least one currency amount.");
  }

  const normalized: Record<string, string> = {};
  for (const [currencyId, amount] of entries) {
    if (typeof currencyId !== "string" || currencyId.trim().length === 0) {
      throw new ValidationError("outputtotals contains an invalid currency key.");
    }

    const sats = parseFixedPointToSats(amount, `outputtotals.${currencyId}`);
    if (sats <= 0n) {
      throw new ValidationError(`outputtotals.${currencyId} must be greater than zero.`);
    }

    normalized[currencyId] = sats.toString();
  }

  return normalized;
}

function parseRedirects(value: unknown): RedirectInput[] | undefined {
  return parseRedirectsField(value, "redirects");
}

function parseTxSigningInput(payload: GenerateTxSigningQrPayload): ParsedTxSigningInput {
  const signed = payload.signed === true;
  const signingId = signed ? requireString(payload.signingId, "signingId") : undefined;
  const isTestnet = payload.isTestnet !== false;
  const redirects = parseRedirects(payload.redirects);

  const txHex = parseHexTransaction(payload.hextx).toString("hex");
  const outputtotalsSats = parseOutputTotals(payload.outputtotals);
  const feeSatsValue = parseFixedPointToSats(payload.feeamount, "feeamount");

  if (feeSatsValue <= 0n) {
    throw new ValidationError("feeamount must be greater than zero.");
  }

  return {
    signed,
    signingId,
    isTestnet,
    redirects,
    txHex,
    outputtotalsSats,
    feeSats: feeSatsValue.toString()
  };
}

function buildTxSigningRequest(input: ParsedTxSigningInput): GenericRequest {
  const requestPayload = {
    type: "tx-signing-template",
    chain: input.isTestnet ? "VRSCTEST" : "VRSC",
    signed: input.signed,
    signingId: input.signingId,
    hextx: input.txHex,
    outputtotalsSats: input.outputtotalsSats,
    feeSats: input.feeSats
  };

  const txSigningDetail = new GeneralTypeOrdinalVDXFObject({
    type: VDXF_OBJECT_RESERVED_BYTE_VDXF_ID_STRING,
    key: TX_SIGNING_TEMPLATE_VDXF_TEXT_KEY,
    data: Buffer.from(JSON.stringify(requestPayload), "utf-8")
  });

  return new GenericRequest({
    details: [txSigningDetail],
    createdAt: new BN((Date.now() / 1000).toFixed(0)),
    responseURIs: buildResponseUris(input.redirects),
    flags: input.isTestnet ? GenericRequest.FLAG_IS_TESTNET : GenericRequest.BASE_FLAGS
  });
}

function parseSigningIdentity(signingId: string): CompactIAddressObject {
  if (signingId.endsWith("@")) {
    return new CompactIAddressObject({
      version: CompactAddressObject.DEFAULT_VERSION,
      type: CompactAddressObject.TYPE_FQN,
      address: signingId,
      rootSystemName: "VRSCTEST"
    });
  }

  return CompactIAddressObject.fromAddress(signingId);
}

async function applyOptionalSignature(request: GenericRequest, input: ParsedTxSigningInput): Promise<GenericRequest> {
  if (!input.signed || !input.signingId) {
    return request;
  }

  const { rpcHost, rpcPort, rpcUser, rpcPassword } = getRpcConfig();
  const { serviceSignerWif } = getServiceSignerConfig();
  const identityID = parseSigningIdentity(input.signingId);

  request.signature = new VerifiableSignatureData({
    systemID: CompactIAddressObject.fromAddress(SYSTEM_ID_TESTNET),
    identityID
  });
  request.setSigned();

  const verusId = new VerusIdInterface(
    SYSTEM_ID_TESTNET,
    `http://${rpcHost}:${rpcPort}`,
    {
      auth: {
        username: rpcUser,
        password: rpcPassword
      }
    }
  );

  const signGenericRequest = (verusId as any).signGenericRequest;
  if (typeof signGenericRequest !== "function") {
    throw new Error("signGenericRequest is not available in verusid-ts-client. Update the library version.");
  }

  const signedRequest = await signGenericRequest.call(verusId, request, serviceSignerWif) as GenericRequest | undefined;
  return signedRequest ?? request;
}

export async function generateTxSigningQr(req: Request, res: Response): Promise<void> {
  try {
    const input = parseTxSigningInput(req.body as GenerateTxSigningQrPayload);
    const request = buildTxSigningRequest(input);
    const finalRequest = await applyOptionalSignature(request, input);

    const deeplink = finalRequest.toWalletDeeplinkUri();

    const qrDataUrl = await QRCode.toDataURL(deeplink, {
      errorCorrectionLevel: "M",
      margin: 1,
      scale: 6
    });

    res.json({ deeplink, qrDataUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    const status = error instanceof ValidationError ? 400 : 500;
    if (status === 500) {
      console.error("Tx signing QR generation failed:", error);
    }
    res.status(status).json({ error: message });
  }
}