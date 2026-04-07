import express from "express";
import { generateQr, GenerateUpdateQrPayload } from "./updateIdentity";
import { ValidationError } from "./utils";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/generate-update-identity-qr", async (req, res) => {
  try {
    const payload = req.body as GenerateUpdateQrPayload;
    const result = await generateQr(payload);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    const status = error instanceof ValidationError ? 400 : 500;
    if (status === 500) {
      console.error("QR generation failed:", error);
    }
    res.status(status).json({ error: message });
  }
});

const port = parseInt(process.env.PORT || "3000", 10);

app.listen(port, () => {
  console.log(`QR generation service running on port ${port}`);
});

export default app;