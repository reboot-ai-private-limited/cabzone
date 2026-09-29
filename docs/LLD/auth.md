# Cabzonee — Authentication & Authorization

**Document:** `docs/LLD/auth.md`  
**Status:** Draft for Engineering Review  
**Version:** 0.1

## 1. Purpose

Define authentication, session management, authorization, device handling, OTP verification, and administrative access control.

The PRD uses phone-number-based authentication for Riders and requires authenticated Driver/Admin workflows.

## 2. Identity Model

```text
User
 ├── Rider profile
 ├── Driver profile
 └── Admin profile
```

Authentication identity is represented by `User`.

Domain-specific permissions are represented by the corresponding role/profile.

## 3. Rider Authentication

Flow:

```text
Phone number
    ↓
OTP request
    ↓
OTP delivery
    ↓
OTP verification
    ↓
Session created
    ↓
Access token + refresh token
```

The PRD explicitly specifies phone number + OTP for Rider accounts.

## 4. Driver Authentication

Drivers use the same core account/session mechanism but have additional authorization requirements before operational access is granted.

Authentication success does not mean Driver eligibility.

```text
Authenticated
    ≠
Eligible to accept rides
```

Eligibility additionally requires KYC, vehicle, document, wallet, operational and account-status checks.

## 5. Admin Authentication

Admin accounts require stronger controls.

Recommended:

```text
password/SSO
+
MFA
+
role-based authorization
```

Exact authentication provider is an implementation decision.

## 6. Access Tokens

Access token should be short-lived.

Recommended conceptual structure:

```text
sub
userId
role
sessionId
iat
exp
```

Do not store sensitive KYC data in access tokens.

## 7. Refresh Tokens

Store only a secure hash of the refresh token.

```text
Session
├── user_id
├── device_id
├── refresh_token_hash
├── expires_at
└── revoked_at
```

Rotate refresh tokens on use.

## 8. Refresh Token Reuse

If an old refresh token is reused after rotation:

```text
detect reuse
      ↓
revoke affected session/token family
      ↓
require reauthentication
```

## 9. Session Revocation

Sessions can be revoked when:

- User logs out.
- Admin suspends account.
- Security event occurs.
- Refresh-token reuse is detected.
- Device is removed.

## 10. OTP Rules

Recommended:

```text
OTP TTL: configurable
maximum attempts: configurable
resend cooldown: configurable
rate limit: mandatory
```

OTP values must never be logged.

Store a secure representation rather than plaintext where possible.

## 11. New Device Login

The PRD highlights phone-number recycling and recommends OTP on new-device login.

Recommended:

```text
new device
    ↓
OTP verification
    ↓
new session
```

Sensitive historical-account behavior may require additional verification according to the finalized security policy.

## 12. Authorization

Use RBAC.

```text
SUPER_ADMIN
CITY_ADMIN
SUPPORT_ADMIN
FINANCE_ADMIN
DRIVER
RIDER
```

Authorization must be checked server-side.

## 13. City Admin Scope

A City Admin can only access resources belonging to assigned city zones.

Example:

```text
City Admin: Siliguri
        ↓
Can modify Siliguri pricing
        ↓
Cannot modify another city's pricing
```

The PRD explicitly identifies city-scoped administrative permissions as necessary.

## 14. Resource Authorization

Role checks are insufficient.

Example:

```text
Driver A
```

must not be able to call:

```text
POST /rides/RIDE_OF_DRIVER_B/complete
```

The server must verify resource ownership/assignment.

## 15. Sensitive Data

Government ID and driving-license data require restricted access.

Recommended:

```text
encrypted storage
+
restricted service access
+
admin authorization
+
audit logging
+
retention policy
```

The PRD explicitly identifies these requirements.

## 16. Authentication Errors

Examples:

```text
AUTH_INVALID_OTP
AUTH_OTP_EXPIRED
AUTH_OTP_RATE_LIMITED
AUTH_SESSION_EXPIRED
AUTH_SESSION_REVOKED
AUTH_REFRESH_REUSE_DETECTED
AUTH_FORBIDDEN
```

Do not expose sensitive authentication details in error messages.

## 17. Authorization Errors

Use:

```text
401
```

for unauthenticated requests.

Use:

```text
403
```

for authenticated users lacking permission.

## 18. Auth Invariants

- OTP must expire.
- OTP attempts must be rate-limited.
- Refresh tokens must be revocable.
- Refresh-token reuse must be detectable.
- Admin authorization must be role- and scope-aware.
- Resource ownership must be validated server-side.
- KYC documents must not be accessible through normal Rider/Driver APIs.
- Authentication state does not imply Driver ride eligibility.
