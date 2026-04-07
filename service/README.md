# Verus QR Code Generation Service

Generates signed identity update QR codes for the Verus desktop application.

## Setup

```bash
yarn install
yarn build
```

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `RPC_HOST` | `localhost` | Verus wallet RPC host |
| `RPC_PORT` | `18843` | Verus wallet RPC port |
| `RPC_USER` | _(required)_ | RPC username |
| `RPC_PASSWORD` | _(required)_ | RPC password |
| `PORT` | `3000` | Service listen port |

## Running

```bash
RPC_HOST=localhost RPC_PORT=18843 RPC_USER=youruser RPC_PASSWORD=yourpass yarn start
```

## Endpoints

### `GET /health`

Health check.

### `POST /api/generate-update-identity-qr`

Generates a signed identity update QR code.

**Request body:**

```json
{
  "signingId": "iJitWFN8PY37GrBVtF38HyftG8WohWipbL",
  "identityChanges": {
    "name": "newname",
    "contentmultimap": {}
  },
  "requestId": "iJitWFN8PY37GrBVtF38HyftG8WohWipbL",
  "redirects": [
    { "type": "1", "uri": "https://example.com/callback" }
  ]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `signingId` | Yes | Identity address or fully qualified name to sign with |
| `identityChanges` | Yes | JSON object with identity update fields |
| `requestId` | No | Request ID for the update |
| `redirects` | No | Array of redirect URIs. Omit if you only need to display the QR code for the user to scan — redirects are optional and only needed if you want the wallet to navigate somewhere or POST to a callback after processing. |

**Response:**

```json
{
  "deeplink": "verus://...",
  "qrDataUrl": "data:image/png;base64,..."
}
```

- `deeplink`: Wallet deep link URI
- `qrDataUrl`: Base64-encoded PNG data URL for the QR code