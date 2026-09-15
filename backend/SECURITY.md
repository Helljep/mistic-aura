# Mistic Aura security baseline

This implementation intentionally keeps secrets out of frontend code and uses:

- Argon2id password hashing
- Random, hashed session tokens
- HttpOnly/Secure/SameSite session cookies
- CSRF token cookie + header checks on state-changing API calls
- Route/global rate limits
- Generic password-reset responses to reduce account enumeration
- Server-side input validation with Zod
- Parameterized PostgreSQL queries
- Role-based admin authorization
- TOTP MFA for admin accounts
- AES-256-GCM encryption for stored admin MFA secrets
- Audit logs for privileged actions
- Stripe signed webhook verification
- No card/CVV storage
- Server-side order pricing
- Order/item snapshots for historical integrity
- Database constraints and foreign keys

Before launch, perform a real production security review, dependency audit, backup restore test, HTTPS/cookie verification, email deliverability test, Stripe webhook test, and Australian privacy/legal review.
