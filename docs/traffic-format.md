# Traffic format (`drift-traffic/v1`)

Recorded traffic gives DRIFT real samples to prove a break with. A traffic file is **JSONL**: one JSON object per line, one line per HTTP exchange. The JSON Schema is [`packages/report-schema/schemas/drift-traffic-v1.schema.json`](../packages/report-schema/schemas/drift-traffic-v1.schema.json), generated from the code.

<!-- prettier-ignore -->
```jsonl
{"method":"POST","path":"/v1/pets","headers":{"Content-Type":"application/json"},"requestBody":{"name":"Rex","status":"pending"},"status":201,"responseBody":{"id":1,"name":"Rex","status":"pending"},"timestamp":"2026-09-20T10:00:00Z","clientId":"mobile-app"}
```

| Field                             | Required | Meaning                                                                                                                                                                                                |
| --------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `method`                          | yes      | HTTP method, any case.                                                                                                                                                                                 |
| `path`                            | yes      | The path as sent, starting with `/`. It may include the query string (`/pets?limit=10`) and the servers' base path (`/v1/pets`).                                                                       |
| `query`                           | no       | Extra query parameters: `{ "name": "value" }`, or an array for repeated keys. Added to those in `path`.                                                                                                |
| `headers`                         | no       | Request headers. Names are case-insensitive; values are strings or arrays.                                                                                                                             |
| `requestBody`                     | no       | For a JSON media type, the parsed document; otherwise the body text as a string. The media type comes from `Content-Type`; without one, strings are `text/plain` and anything else `application/json`. |
| `status`                          | no       | Response status (100–599). A response is only read when this is present.                                                                                                                               |
| `responseHeaders`, `responseBody` | no       | As for the request.                                                                                                                                                                                    |
| `timestamp`                       | no       | ISO 8601 with an offset.                                                                                                                                                                               |
| `clientId`                        | no       | Who sent the request (kept for the stretch goal of consumer blast radius).                                                                                                                             |

Unknown fields are rejected, so a misspelt field is reported instead of silently ignored.

## How DRIFT reads it

- **Streaming:** one line at a time, so memory is bounded by one line plus the kept samples. Blank lines are ignored. Lines longer than 4 MiB are refused without being parsed.
- **Malformed lines** are counted and the first ten are listed in the report by line number, with the reason. They are never fatal. A reason names only the field and the kind of problem, never the content, because a malformed line may contain a secret.
- **Routing:** each request is matched to an operation of the **old** contract, after stripping a server base path. Requests that match nothing are counted as unrouted; requests to operations no change affects are counted as out of scope.
- **Sampling:** at most 1,000 samples per operation and 50,000 in total are kept. The choice is deterministic (lowest priority hash, rotated by `--seed`) and does not depend on line order.
- **Redaction, on by default,** of every kept sample before anything is stored or reported:
  - headers `Authorization`, `Proxy-Authorization`, `Cookie`, `Set-Cookie`, `X-Api-Key`, `X-Auth-Token`, `X-CSRF-Token`, `X-XSRF-Token`;
  - query parameters and body fields named `password`, `secret`, `token`, `api_key`, `client_secret` and similar;
  - any string that looks like an email address, a JWT, a bearer token, a common cloud or API key, a private key or a Luhn-valid card number.

  Redacted values become `[REDACTED:<kind>]`. Validation errors at redacted values count as unknown, never as failures.

## HAR

A `.har` file (HAR 1.2, as exported by browsers and proxies) is also accepted. Each entry becomes one record:

- request method, URL, headers and `postData`;
- response status, headers and text content;
- `startedDateTime` becomes the `timestamp`.

HTTP/2 pseudo-headers and base64 (binary) bodies are skipped. A HAR file is one JSON document, so it is read whole and limited to 256 MiB; use JSONL for larger captures.
