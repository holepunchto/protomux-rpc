# Error Handling Architecture

## Context

- All server-side errors are currently logged as `warn`, obscuring severity. We need a standard error taxonomy to map errors to appropriate log levels.
- Handler throws are wrapped as `REQUEST_ERROR` and serialized to clients, risking exposure of internal details.
- Because all handler errors are wrapped as `REQUEST_ERROR`, the generic `protomux-rpc-client` lacks actionable signals (e.g., BAD_REQUEST/FORBIDDEN should not be retried).
- Add a `requestId` to every request/error to enable end-to-end tracing and easier troubleshooting.

## Approach

### Request Tracking

- Server automatically attaches `requestId` to all errors
- `protomux-rpc` handles encoding/decoding of optional `requestId` values (backward-compatible)
- Logger add `requestId` in request log
- Client log/track `requestId` to troubleshoot with server when needed

### Error Standardization

- High-level error categories align with HTTP status code semantics (just some important ones)

### Logging Configuration

- Logger middleware supports configurable mapping from error codes to log levels
- Sensible defaults provided out-of-the-box following the above error standard

### Client Error Exposure

- Only `RPCError` instances are serialized to clients
- Unexpected/internal errors are masked as generic `REQUEST_ERROR` responses
- Full error details are always logged server-side for debugging
- **Developer responsibility**: Explicitly wrap errors as `RPCError` when client visibility is required

## API sample

See `sample-api.js`
