import { Request, Response } from "express";
import * as QRCode from "qrcode";
import {
  ValidationError,
  requireString,
  parseJsonField,
  RedirectInput
} from "../utils";

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

export async function generateTxSigningQr(req: Request, res: Response): Promise<void> {
  try {
    const payload = req.body as GenerateTxSigningQrPayload;
    const signed = payload.signed === true;
    const signingId = signed ? requireString(payload.signingId, "signingId") : undefined;

    const redirects = parseJsonField<RedirectInput[]>(
      payload.redirects,
      "redirects",
      false
    );
    if (redirects !== undefined && !Array.isArray(redirects)) {
      throw new ValidationError("redirects must be a JSON array.");
    }

    const txBytes = parseHexTransaction(payload.hextx);
    const outputtotalsSats = parseOutputTotals(payload.outputtotals);
    const feeSats = parseFixedPointToSats(payload.feeamount, "feeamount");

    if (feeSats <= 0n) {
      throw new ValidationError("feeamount must be greater than zero.");
    }

    // Minimal tx-signing request envelope used until full primitive-specific integration is added.
    const requestPayload = {
      type: "tx-signing-template",
      chain: payload.isTestnet === false ? "VRSC" : "VRSCTEST",
      signed,
      signingId,
      hextx: txBytes.toString("hex"),
      outputtotalsSats,
      feeSats: feeSats.toString()
    };

    const encodedPayload = Buffer.from(JSON.stringify(requestPayload), "utf-8").toString("base64url");
    const deeplink = `veruspay://txsign/${encodedPayload}`;

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