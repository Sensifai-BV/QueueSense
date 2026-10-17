---
name: webhook-integration
description: Guide on how third-party marketplace applications integrate with Sensifai Marketplace webhooks, verify headers and HMAC signatures, decode event payloads, and implement automated lifecycle/billing workflows.
---

# Webhook Integration Skill

Use this skill when developing or debugging integrations, handlers, or middleware for third-party applications that consume webhook events from the Sensifai Marketplace.

## Webhook Specifications

### 1. Events and Payloads
All events are HTTP POST requests delivering a wrapped JSON envelope:
* `id` (string): Unique event identifier (useful for idempotency checks).
* `event_type` (string): Identifies the event type.
* `created_at` (int64): Unix timestamp (seconds) when the event was generated.
* `data` (object): Event-specific dictionary. The `customer_id` field in the payload represents the customer's **Logto User ID** (string) instead of internal database UUIDs.

#### Supported Event Types:
1. **`customer.balance.depleted`**
   * **Payload**: `{"balance": 0, "customer_id": "air5yuaoeueo"}`
   * **Usecase**: Fired when a customer's pre-funded wallet balance reaches $0 or negative. Critical for **pay-as-you-go** applications to temporarily pause or throttle API access.
2. **`subscription.created`**
   * **Payload**: `{"customer_id": "air5yuaoeueo", "id": "sub_uuid", "price_model_id": "pm_uuid"}`
   * **Usecase**: Fired on plan checkout/activation. Used to provision schemas, workspaces, or welcome user.
3. **`subscription.status.updated`**
   * **Payload**: `{"customer_id": "air5yuaoeueo", "id": "sub_uuid", "price_model_id": "pm_uuid", "status": "canceled"}`
   * **Usecase**: Fired on cancellation or status changes. Used to revoke premium access or schedule resource cleanup.

---

## 2. Cryptographic Security and Signature Verification

To prevent forgery and replay attacks, all requests carry signature headers.

### Required Header Checks:
1. **`Sensifai-Signature`**: Contains `t=<timestamp>,v1=<signature>`.
   * `t` is the generation Unix timestamp (seconds).
   * `v1` is the hex-encoded HMAC-SHA256 signature of the payload.
2. **`Idempotency-Key`**: Matches the unique `id` of the event. Track this key in your DB to prevent processing duplicate requests.

### Verification Algorithm:
1. Extract `t` and `v1` from the `Sensifai-Signature` header.
2. Verify that the timestamp `t` is within a 5-minute window of the current time (prevents replay attacks).
3. Reconstruct the signature payload:
   ```text
   payload_to_sign = t + "." + raw_http_request_body_bytes
   ```
4. Calculate the HMAC-SHA256 signature of `payload_to_sign` using the endpoint's shared **Webhook Secret** (`whsec_...`).
5. Perform a constant-time comparison (e.g. `subtle.ConstantTimeCompare` in Go or `hmac.compare_digest` in Python) between `v1` and the computed signature to prevent timing attacks.

---

## 3. Implementation Code References

### Python Signature Verification
```python
import hmac
import hashlib
import time

def verify_webhook_signature(body: bytes, header: str, secret: str) -> bool:
    t, v1 = None, None
    parts = header.split(",")
    for part in parts:
        kv = part.split("=", 1)
        if len(kv) == 2:
            if kv[0] == "t": t = kv[1]
            elif kv[0] == "v1": v1 = kv[1]

    if not t or not v1:
        return False

    try:
        webhook_time = int(t)
    except ValueError:
        return False

    if abs(int(time.time()) - webhook_time) > 300:
        return False

    payload_to_sign = f"{t}.".encode("utf-8") + body
    computed_mac = hmac.new(secret.encode("utf-8"), payload_to_sign, hashlib.sha256)
    return hmac.compare_digest(v1, computed_mac.hexdigest())
```

### Go Signature Verification
```go
package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"strings"
	"time"
)

func verifySignature(body []byte, header, secret string) bool {
	var t, v1 string
	for _, part := range strings.Split(header, ",") {
		kv := strings.SplitN(part, "=", 2)
		if len(kv) == 2 {
			if kv[0] == "t" { t = kv[1] }
			if kv[0] == "v1" { v1 = kv[1] }
		}
	}
	if t == "" || v1 == "" {
		return false
	}
	val, err := time.ParseDuration(t + "s")
	if err != nil || abs(time.Now().Unix()-int64(val.Seconds())) > 300 {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(fmt.Sprintf("%s.%s", t, string(body))))
	return subtle.ConstantTimeCompare([]byte(v1), []byte(hex.EncodeToString(mac.Sum(nil)))) == 1
}

func abs(v int64) int64 {
	if v < 0 { return -v }
	return v
}
```
