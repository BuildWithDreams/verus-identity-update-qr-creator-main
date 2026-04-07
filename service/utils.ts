import { BN } from "bn.js";
import {
  VerifiableSignatureData,
  CompactIAddressObject,
  CompactAddressObject,
  ResponseURI,
  fromBase58Check
} from "verus-typescript-primitives";
import { VerusIdInterface, primitives } from "verusid-ts-client";

const conf = require("../config");

export const SYSTEM_ID_TESTNET = "iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`${fieldName} is required.`);
  }
  return value.trim();
}

export function parseNumber(value: unknown, fieldName: string, fallback?: number): number {
  if (value == null || value === "") {
    if (fallback != null) return fallback;
    throw new ValidationError(`${fieldName} is required.`);
  }
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    throw new ValidationError(`${fieldName} must be a positive number.`);
  }
  return num;
}

export function parseJsonField<T>(value: unknown, fieldName: string, required: boolean): T | undefined {
  if (value == null || value === "") {
    if (required) throw new ValidationError(`${fieldName} is required.`);
    return undefined;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid JSON";
      throw new ValidationError(`Invalid JSON for ${fieldName}: ${message}`);
    }
  }
  return value as T;
}

export type RedirectInput = {
  type?: string | number;
  uri?: string;
};

function buildResponseUris(redirects?: RedirectInput[]): ResponseURI[] | undefined {
  if (!redirects || redirects.length === 0) return undefined;

  const responseUris = redirects
    .map((redirect) => {
      const uri = typeof redirect?.uri === "string" ? redirect.uri.trim() : "";
      if (!uri) return undefined;

      const type = String(redirect?.type ?? "");
      if (type === "1") return ResponseURI.fromUriString(uri, ResponseURI.TYPE_REDIRECT);
      if (type === "2") return ResponseURI.fromUriString(uri, ResponseURI.TYPE_POST);
      return undefined;
    })
    .filter((redirect): redirect is ResponseURI => redirect != null);

  return responseUris.length > 0 ? responseUris : undefined;
}

export function buildGenericRequestFromDetails(params: {
  details: primitives.GenericRequest["details"];
  signed: boolean;
  signingId?: string;
  redirects?: RedirectInput[];
}, isTestnet: boolean): primitives.GenericRequest {
  const responseURIs = buildResponseUris(params.redirects);

  const req = new primitives.GenericRequest({
    details: params.details,
    createdAt: new BN((Date.now() / 1000).toFixed(0)),
    responseURIs,
    flags: isTestnet ? primitives.GenericRequest.FLAG_IS_TESTNET : primitives.GenericRequest.BASE_FLAGS
  });

  if (params.signed) {
    if (!params.signingId) {
      throw new ValidationError("signingId is required when signed is true.");
    }
    let identityID: CompactIAddressObject;
    if (params.signingId.endsWith("@")) {
      identityID = new CompactIAddressObject({
        version: CompactAddressObject.DEFAULT_VERSION,
        type: CompactAddressObject.TYPE_FQN,
        address: params.signingId,
        rootSystemName: "VRSCTEST"
      });
    } else {
      identityID = CompactIAddressObject.fromAddress(params.signingId);
    }
    req.signature = new VerifiableSignatureData({
      systemID: CompactIAddressObject.fromAddress(SYSTEM_ID_TESTNET),
      identityID
    });
    req.setSigned();
  }

  req.setIsTestnet();
  return req;
}

export async function signRequest(params: {
  request: primitives.GenericRequest;
  rpcHost: string;
  rpcPort: number;
  rpcUser: string;
  rpcPassword: string;
  signingId: string;
}): Promise<void> {
  const verusId = new VerusIdInterface(
    SYSTEM_ID_TESTNET,
    `http://${params.rpcHost}:${params.rpcPort}`,
    {
      auth: {
        username: params.rpcUser,
        password: params.rpcPassword
      }
    }
  );

  const rawHash = params.request.getRawDataSha256(false);

  const sigRes = await verusId.interface.signData({
    address: params.signingId,
    datahash: rawHash.toString("hex")
  });

  const signature = sigRes?.result?.signature;
  if (typeof signature !== "string" || signature.length === 0) {
    const rpcError = sigRes?.error;
    if (rpcError) {
      throw new Error(`RPC signData failed: ${rpcError.message || JSON.stringify(rpcError)}`);
    }
    throw new Error(`RPC signData returned no signature. Make sure the Signing ID "${params.signingId}" exists in your wallet and you have the private key to sign.`);
  }

  if (!params.request.signature) {
    throw new Error("Request signature metadata is missing.");
  }
  params.request.signature.signatureAsVch = Buffer.from(signature, "base64");
}

export function getRpcConfig() {
  const rpcHost = typeof conf.RPC_HOST === "string" && conf.RPC_HOST.trim().length > 0
    ? conf.RPC_HOST.trim()
    : "localhost";
  const rpcPort = parseNumber(conf.RPC_PORT, "RPC_PORT", 18843);
  const rpcUser = requireString(conf.RPC_USER, "RPC_USER");
  const rpcPassword = requireString(conf.RPC_PASSWORD, "RPC_PASSWORD");
  const isTestnet = rpcPort === 18843;

  return { rpcHost, rpcPort, rpcUser, rpcPassword, isTestnet };
}