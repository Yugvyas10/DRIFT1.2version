<!-- drift-report -->
## ❌ DRIFT: contract gate failed

failed \(fail on breaking\): 7 BREAKING, 1 RISKY, 6 SAFE; semver major

| BREAKING | RISKY | SAFE | Suppressed | Semver |
| --- | --- | --- | --- | --- |
| 7 | 1 | 6 | 0 | major |

Comparing <code>examples/petstore/v1\.yaml</code> (1\.0\.0) with <code>examples/petstore/v2\-breaking\.yaml</code> (2\.0\.0). Traffic: 12 records read, 9 kept; 20 synthetic samples.

### BREAKING (7)

- **Operation DELETE /pets/\{\} was removed**
  <code>DELETE /pets/\{\}</code> · request · <code>operation\.removed</code> · <code>5d252af03800fea0</code> · at <code>examples/petstore/v1\.yaml:65:7</code>
  Rule <code>DRIFT\-REQ\-OPERATION\-REMOVED</code>: Clients still calling the operation will get an error; a recorded call to it proves the break\.
  Evidence: 1 of 1 sample fails \(recorded\); confidence 1\.00

  <details><summary>Failing sample (recorded, line 6, redacted)</summary>

```json
{
  "method": "DELETE",
  "path": "/v1/pets/7"
}
```

```
/operation DELETE /pets/{} is not in this contract
```

  </details>

- **Request query parameter "limit": "maximum" tightened: 100 → 50**
  <code>GET /pets</code> · request · <code>schema\.bound\.tightened</code> · <code>760d32eee71daae3</code> · at <code>examples/petstore/v2\-breaking\.yaml:17:22</code>
  Rule <code>DRIFT\-REQ\-SCHEMA\-BOUND\-TIGHTENED</code>: Values that used to be accepted may now be rejected\.
  Evidence: 2 of 3 samples fail \(recorded\); confidence 1\.00

  <details><summary>Failing sample (recorded, line 3, redacted)</summary>

```json
{
  "method": "GET",
  "path": "/v1/pets",
  "query": {
    "limit": "80"
  }
}
```

```
/query/limit must be <= 50
```

  </details>

- **Response 200 body \(application/json\): Enum value "adopted" was added**
  <code>GET /pets</code> · response · <code>schema\.enum\.value\_added</code> · <code>a37def3c7de93e01</code> · at <code>examples/petstore/v2\-breaking\.yaml:77:13</code>
  Rule <code>DRIFT\-RES\-SCHEMA\-ENUM\-VALUE\-ADDED</code>: Clients that validate responses strictly may reject a value they have never seen\.
  Evidence: 2 of 8 samples fail \(synthetic\); confidence 0\.80; unverified \(no recorded request reached it\)

  <details><summary>Failing sample (synthetic, redacted)</summary>

```json
{
  "method": "GET",
  "path": "/pets",
  "status": 200,
  "contentType": "application/json",
  "body": [
    {
      "id": 1,
      "name": "drift",
      "status": "adopted",
      "tag": "drift"
    }
  ]
}
```

```
/body/0/status must be equal to one of the allowed values
```

  </details>

- **Response 200 body \(application/json\): Enum value "adopted" was added**
  <code>GET /pets/\{\}</code> · response · <code>schema\.enum\.value\_added</code> · <code>2e23389f89244d4f</code> · at <code>examples/petstore/v2\-breaking\.yaml:77:13</code>
  Rule <code>DRIFT\-RES\-SCHEMA\-ENUM\-VALUE\-ADDED</code>: Clients that validate responses strictly may reject a value they have never seen\.
  Evidence: 2 of 6 samples fail \(synthetic\); confidence 0\.80; unverified \(no recorded request reached it\)

  <details><summary>Failing sample (synthetic, redacted)</summary>

```json
{
  "method": "GET",
  "path": "/pets/{petId}",
  "status": 200,
  "contentType": "application/json",
  "body": {
    "id": 1,
    "name": "drift",
    "status": "adopted",
    "tag": "drift"
  }
}
```

```
/body/status must be equal to one of the allowed values
```

  </details>

- **Request body \(application/json\): Property "category" was added as required**
  <code>POST /pets</code> · request · <code>schema\.property\.added\.required</code> · <code>bb412def2697a713</code> · at <code>examples/petstore/v2\-breaking\.yaml:93:11</code>
  Rule <code>DRIFT\-REQ\-SCHEMA\-PROPERTY\-ADDED\-REQUIRED</code>: Existing clients do not send the new property, so the server will reject their requests\.
  Evidence: 1 of 3 samples fails \(recorded\); confidence 1\.00

  <details><summary>Failing sample (recorded, line 1, redacted)</summary>

```json
{
  "method": "POST",
  "path": "/v1/pets",
  "headers": {
    "authorization": "[REDACTED:header]",
    "content-type": "application/json"
  },
  "body": {
    "name": "Rex",
    "status": "pending",
    "tag": "dog",
    "ownerEmail": "[REDACTED:email]"
  }
}
```

```
/body/category must have required property 'category'
```

  </details>

- **Request body \(application/json\): Enum value "pending" was removed**
  <code>POST /pets</code> · request · <code>schema\.enum\.value\_removed</code> · <code>306b396f638281e8</code> · at <code>examples/petstore/v1\.yaml:77:13</code>
  Rule <code>DRIFT\-REQ\-SCHEMA\-ENUM\-VALUE\-REMOVED</code>: Clients still sending the removed value will be rejected\.
  Evidence: 1 of 3 samples fails \(recorded\); confidence 1\.00

  <details><summary>Failing sample (recorded, line 1, redacted)</summary>

```json
{
  "method": "POST",
  "path": "/v1/pets",
  "headers": {
    "authorization": "[REDACTED:header]",
    "content-type": "application/json"
  },
  "body": {
    "name": "Rex",
    "status": "pending",
    "tag": "dog",
    "ownerEmail": "[REDACTED:email]"
  }
}
```

```
/body/status must be equal to one of the allowed values
```

  </details>

- **Response 201 body \(application/json\): Enum value "adopted" was added**
  <code>POST /pets</code> · response · <code>schema\.enum\.value\_added</code> · <code>db8893be5ad2c107</code> · at <code>examples/petstore/v2\-breaking\.yaml:77:13</code>
  Rule <code>DRIFT\-RES\-SCHEMA\-ENUM\-VALUE\-ADDED</code>: Clients that validate responses strictly may reject a value they have never seen\.
  Evidence: 2 of 6 samples fail \(synthetic\); confidence 0\.80; unverified \(no recorded request reached it\)

  <details><summary>Failing sample (synthetic, redacted)</summary>

```json
{
  "method": "POST",
  "path": "/pets",
  "status": 201,
  "contentType": "application/json",
  "body": {
    "id": 1,
    "name": "drift",
    "status": "adopted",
    "tag": "drift"
  }
}
```

```
/body/status must be equal to one of the allowed values
```

  </details>


<details><summary><strong>RISKY (1)</strong></summary>

| Operation | Direction | Change | Evidence |
| --- | --- | --- | --- |
| <code>GET /pets</code> | request | Request query parameter "status": Enum value "pending" was removed | 1 sample reached it, none fail \(1 recorded\); confidence 0\.00 |

</details>

<details><summary><strong>SAFE (6)</strong></summary>

| Operation | Direction | Change | Evidence |
| --- | --- | --- | --- |
| <code>GET /pets</code> | request | Request query parameter "status": Enum value "adopted" was added | 1 sample reached it, none fail \(1 recorded\); confidence 0\.00 |
| <code>GET /pets</code> | response | Response 200 body \(application/json\): Enum value "pending" was removed | 8 samples reached it, none fail \(0 recorded\); confidence 0\.00; unverified \(no recorded request reached it\) |
| <code>GET /pets/\{\}</code> | request | Optional query parameter "fields" was added | not verifiable by samples; structural only |
| <code>GET /pets/\{\}</code> | response | Response 200 body \(application/json\): Enum value "pending" was removed | 6 samples reached it, none fail \(0 recorded\); confidence 0\.00; unverified \(no recorded request reached it\) |
| <code>POST /pets</code> | request | Request body \(application/json\): Enum value "adopted" was added | 3 samples reached it, none fail \(3 recorded\); confidence 0\.00 |
| <code>POST /pets</code> | response | Response 201 body \(application/json\): Enum value "pending" was removed | 6 samples reached it, none fail \(0 recorded\); confidence 0\.00; unverified \(no recorded request reached it\) |

</details>

<sub>DRIFT 0\.0\.0 · rules 1\.0\.0 · synthetic evidence is marked as such and never counts as recorded.</sub>
