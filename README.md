# Mistic Aura — Hostinger Full Stack

Production target: `https://misticaura.com.au`

This version is built specifically for the current Hostinger web/cloud plan shown for the project. It uses Hostinger Node.js hosting and Hostinger managed MySQL. No PostgreSQL or Docker is required for deployment.

## Application

- Existing Mistic Aura HTML/CSS/JS frontend
- Fastify Node.js backend
- MySQL database
- Customer authentication and email verification
- Password reset
- Secure sessions + CSRF + rate limiting + security headers
- Products and variants with AUD pricing
- Cart and server-side order totals
- Admin login + MFA + roles + audit logs
- Stripe integration foundation
- Transactional email integration foundation

## Important

Configure secrets only through Hostinger environment variables. Do not upload a real `.env` file containing passwords or API keys.

See `backend/README.md` for the deployment sequence.
