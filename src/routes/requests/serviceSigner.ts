import { Request, Response } from "express";
import * as crypto from "crypto";
import * as QRCode from "qrcode";
import {
  CompactIAddressObject,
  GenericResponse,
  GENERIC_RESPONSE_DEEPLINK_VDXF_KEY,
  IdentityUpdateResponseDetails,
  IdentityUpdateResponseOrdinalVDXFObject,
  IdentityUpdateRequestDetails,
  IdentityUpdateRequestOrdinalVDXFObject
} from "verus-typescript-primitives";
import { primitives, VerusIdInterface } from "verusid-ts-client";
import {
  ValidationError,
  RedirectInput,
  requireString,
  parseJsonField,
  buildGenericRequestFromDetails,
  getRpcConfig,
  getServiceSignerConfig,
  SYSTEM_ID_TESTNET
} from "../utils";

type GenerateServiceSignerQrPayload = {
  targetIdentity?: string;
  requestId?: string;
  contentmultimap?: unknown;
  identityChanges?: unknown;
  redirects?: unknown;
};

type RpcIdentityResponse = {
  identity?: {
    name?: string;
    parent?: string;
  };
};

type ServiceSignerRequestState = {
  createdAt: number;
  expiresAt: number;
  completedAt?: number;
  txid?: string;
  lastCallbackPayload?: {
    receivedAt: number;
    source: "post" | "redirect";
    contentType?: string;
    responseData?: string;
    parsed?: {
      txid: string;
    };
  };
};

const REQUEST_TTL_MS = 10 * 60 * 1000;
const serviceSignerRequests = new Map<string, ServiceSignerRequestState>();

setInterval(() => {
  const now = Date.now();
  for (const [requestId, state] of serviceSignerRequests) {
    if (now > state.expiresAt) {
      serviceSignerRequests.delete(requestId);
    }
  }
}, 60_000);

function generateRequestId(): string {
  const payload = crypto.randomBytes(20);
  return primitives.toBase58Check(payload, 0x66);
}

function getRequestOrigin(req: Request): string {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const forwardedHost = req.headers["x-forwarded-host"];
  const proto = typeof forwardedProto === "string" && forwardedProto.length > 0
    ? forwardedProto.split(",")[0].trim()
    : req.protocol;
  const host = typeof forwardedHost === "string" && forwardedHost.length > 0
    ? forwardedHost.split(",")[0].trim()
    : req.get("host");

  return `${proto}://${host}`;
}

function getCallbackUri(origin: string, requestId: string): string {
  return `${origin}/api/service-signer/callback?requestId=${requestId}`;
}

function ensureCallbackRedirect(redirects: RedirectInput[] | undefined, callbackUri: string): RedirectInput[] {
  const list = Array.isArray(redirects) ? [...redirects] : [];
  const hasCallback = list.some((redirect) => typeof redirect?.uri === "string" && redirect.uri.includes("/api/service-signer/callback"));

  if (!hasCallback) {
    list.push({
      type: "1",
      uri: callbackUri
    });
  }

  return list;
}

function parseIdentityUpdateResponse(responseData: string): { txid: string } | null {
  try {
    const responseBuffer = Buffer.from(responseData, "base64url");
    const response = new GenericResponse();
    response.fromBuffer(responseBuffer, 0);

    const detail = response.details[0];
    if (!(detail instanceof IdentityUpdateResponseOrdinalVDXFObject)) {
      return null;
    }

    const responseDetails = detail.data as IdentityUpdateResponseDetails;
    const txidBuffer = responseDetails.txid;
    if (!txidBuffer) {
      return null;
    }

    const txid = Buffer.from(txidBuffer as unknown as Uint8Array).reverse().toString("hex");
    return { txid };
  } catch {
    return null;
  }
}

async function fetchTargetIdentityInfo(params: {
  targetIdentity: string;
  rpcHost: string;
  rpcPort: number;
  rpcUser: string;
  rpcPassword: string;
}): Promise<{ name: string; parent: string }> {
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

  const identityResult = await verusId.interface.request({
    cmd: "getidentity",
    getParams: () => [params.targetIdentity]
  } as any);

  if (identityResult?.error) {
    throw new Error(identityResult.error.message || "getidentity failed for targetIdentity.");
  }

  const identityJson = identityResult?.result as RpcIdentityResponse | undefined;
  const name = identityJson?.identity?.name;
  const parent = identityJson?.identity?.parent;

  if (typeof name !== "string" || name.trim().length === 0) {
    throw new ValidationError("Could not resolve target identity name from getidentity.");
  }

  if (typeof parent !== "string" || parent.trim().length === 0) {
    throw new ValidationError("Could not resolve target identity parent from getidentity.");
  }

  return { name: name.trim(), parent: parent.trim() };
}

function buildServiceSignerRequest(params: {
  targetIdentityName: string;
  targetIdentityParent: string;
  contentmultimap: Record<string, unknown>;
  identityChanges: Record<string, unknown>;
  requestId?: string;
  redirects?: RedirectInput[];
  serviceSignerIAddress: string;
  isTestnet?: boolean;
}): primitives.GenericRequest {
  const detailsOverrides = params.requestId
    ? { requestid: CompactIAddressObject.fromAddress(params.requestId).toJson() }
    : undefined;

  const mergedChanges: Record<string, unknown> = {
    ...params.identityChanges,
    name: params.targetIdentityName,
    parent: params.targetIdentityParent,
    contentmultimap: params.contentmultimap
  };

  const details = IdentityUpdateRequestDetails.fromCLIJson(mergedChanges, detailsOverrides);

  return buildGenericRequestFromDetails({
    details: [new IdentityUpdateRequestOrdinalVDXFObject({ data: details })],
    signed: true,
    signingId: params.serviceSignerIAddress,
    redirects: params.redirects
  }, params.isTestnet ?? false);
}

export async function generateServiceSignerQr(req: Request, res: Response): Promise<void> {
  try {
    const payload = req.body as GenerateServiceSignerQrPayload;
    const { rpcHost, rpcPort, rpcUser, rpcPassword, isTestnet } = getRpcConfig();
    const { serviceSignerWif, serviceSignerIAddress } = getServiceSignerConfig();

    const targetIdentity = requireString(payload.targetIdentity, "targetIdentity");
    const requestId = typeof payload.requestId === "string" && payload.requestId.trim().length > 0
      ? payload.requestId.trim()
      : generateRequestId();

    const contentmultimap = parseJsonField<Record<string, unknown>>(
      payload.contentmultimap,
      "contentmultimap",
      true
    );

    if (typeof contentmultimap !== "object" || contentmultimap == null || Array.isArray(contentmultimap)) {
      throw new ValidationError("contentmultimap must be a JSON object.");
    }

    const identityChanges = parseJsonField<Record<string, unknown>>(
      payload.identityChanges,
      "identityChanges",
      false
    ) ?? {};

    if (typeof identityChanges !== "object" || identityChanges == null || Array.isArray(identityChanges)) {
      throw new ValidationError("identityChanges must be a JSON object.");
    }

    const redirects = parseJsonField<RedirectInput[]>(
      payload.redirects,
      "redirects",
      false
    );

    if (redirects !== undefined && !Array.isArray(redirects)) {
      throw new ValidationError("redirects must be a JSON array.");
    }

    const targetIdentityInfo = await fetchTargetIdentityInfo({
      targetIdentity,
      rpcHost,
      rpcPort,
      rpcUser,
      rpcPassword
    });

    const origin = getRequestOrigin(req);
    const callbackUri = getCallbackUri(origin, requestId);
    const finalRedirects = ensureCallbackRedirect(redirects, callbackUri);

    const reqToSign = buildServiceSignerRequest({
      targetIdentityName: targetIdentityInfo.name,
      targetIdentityParent: targetIdentityInfo.parent,
      contentmultimap,
      identityChanges,
      requestId,
      redirects: finalRedirects,
      serviceSignerIAddress,
      isTestnet
    });

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

    const signedRequest = await signGenericRequest.call(verusId, reqToSign, serviceSignerWif) as primitives.GenericRequest | undefined;
    const finalRequest = signedRequest ?? reqToSign;

    const deeplink = finalRequest.toWalletDeeplinkUri();
    const qrDataUrl = await QRCode.toDataURL(deeplink, {
      errorCorrectionLevel: "M",
      margin: 1,
      scale: 6
    });

    const now = Date.now();
    serviceSignerRequests.set(requestId, {
      createdAt: now,
      expiresAt: now + REQUEST_TTL_MS,
      lastCallbackPayload: undefined
    });

    res.json({
      deeplink,
      qrDataUrl,
      requestId,
      callbackUri,
      statusUrl: `${origin}/api/service-signer/status?requestId=${requestId}`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    const status = error instanceof ValidationError ? 400 : 500;
    if (status === 500) {
      console.error("Service signer QR generation failed:", error);
    }
    res.status(status).json({ error: message });
  }
}

export async function serviceSignerCallback(req: Request, res: Response): Promise<void> {
  try {
    const requestId = requireString(req.query.requestId, "requestId");
    const contentType = String(req.headers["content-type"] || "").toLowerCase();

    let responseData = "";
    if (contentType.includes("application/json") && typeof req.body?.response === "string") {
      responseData = req.body.response;
    } else if (typeof req.body === "string") {
      responseData = req.body;
    } else if (typeof req.body?.response === "string") {
      responseData = req.body.response;
    }

    if (!responseData) {
      throw new ValidationError("Missing response data.");
    }

    const parsed = parseIdentityUpdateResponse(responseData);
    if (!parsed) {
      throw new ValidationError("Invalid response format.");
    }

    const existing = serviceSignerRequests.get(requestId);
    const now = Date.now();
    serviceSignerRequests.set(requestId, {
      createdAt: existing?.createdAt ?? now,
      expiresAt: existing?.expiresAt ?? (now + REQUEST_TTL_MS),
      completedAt: now,
      txid: parsed.txid,
      lastCallbackPayload: {
        receivedAt: now,
        source: "post",
        contentType,
        responseData,
        parsed: {
          txid: parsed.txid
        }
      }
    });

    res.json({
      success: true,
      requestId,
      txid: parsed.txid
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    const status = error instanceof ValidationError ? 400 : 500;
    if (status === 500) {
      console.error("Service signer callback failed:", error);
    }
    res.status(status).json({ success: false, error: message });
  }
}

export async function serviceSignerCallbackRedirect(req: Request, res: Response): Promise<void> {
  try {
    const requestId = requireString(req.query.requestId, "requestId");
    const responseData = req.query[GENERIC_RESPONSE_DEEPLINK_VDXF_KEY.vdxfid];

    if (typeof responseData !== "string" || responseData.length === 0) {
      throw new ValidationError("Missing response data.");
    }

    const parsed = parseIdentityUpdateResponse(responseData);
    if (!parsed) {
      throw new ValidationError("Invalid response format.");
    }

    const existing = serviceSignerRequests.get(requestId);
    const now = Date.now();
    serviceSignerRequests.set(requestId, {
      createdAt: existing?.createdAt ?? now,
      expiresAt: existing?.expiresAt ?? (now + REQUEST_TTL_MS),
      completedAt: now,
      txid: parsed.txid,
      lastCallbackPayload: {
        receivedAt: now,
        source: "redirect",
        responseData,
        parsed: {
          txid: parsed.txid
        }
      }
    });

    res.type("text/html").send(`<!doctype html><html><head><meta charset="utf-8"/><title>Service signer complete</title></head><body><h2>Request completed</h2><p>Request ID: ${requestId}</p><p>TXID: ${parsed.txid}</p><p>You can return to the app.</p></body></html>`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    res.status(400).type("text/html").send(`<!doctype html><html><head><meta charset="utf-8"/><title>Service signer callback error</title></head><body><h2>Callback error</h2><p>${message}</p></body></html>`);
  }
}

export function serviceSignerStatus(req: Request, res: Response): void {
  try {
    const requestId = requireString(req.query.requestId, "requestId");
    const state = serviceSignerRequests.get(requestId);

    if (!state) {
      res.json({ status: "not_found", requestId });
      return;
    }

    if (Date.now() > state.expiresAt) {
      serviceSignerRequests.delete(requestId);
      res.json({ status: "expired", requestId });
      return;
    }

    if (state.txid) {
      res.json({
        status: "completed",
        requestId,
        txid: state.txid,
        completedAt: state.completedAt,
        lastCallbackPayload: state.lastCallbackPayload
      });
      return;
    }

    res.json({
      status: "pending",
      requestId,
      expiresAt: state.expiresAt,
      lastCallbackPayload: state.lastCallbackPayload
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    res.status(400).json({ status: "error", error: message });
  }
}
