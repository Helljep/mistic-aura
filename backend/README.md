# Mistic Aura Backend — Hostinger MySQL

This backend is configured for the current Mistic Aura Hostinger web/cloud plan: Node.js + managed MySQL. PostgreSQL is not required.

## Production environment

Domain: `https://misticaura.com.au`
Database: Hostinger MySQL
Runtime: Node.js 20+
Framework: Fastify

## Required environment variables

See `backend/.env.example`. Do not commit real credentials.

Required for production:

- `NODE_ENV=production`
- `APP_ORIGIN=https://misticaura.com.au`
- `PUBLIC_APP_URL=https://misticaura.com.au`
- `DB_HOST`
- `DB_PORT=3306`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `APP_ENCRYPTION_KEY`

Optional until later: SMTP and Stripe credentials.

## Hostinger setup order

1. Create the MySQL database in hPanel.
2. Create the Node.js Web App and attach `misticaura.com.au`.
3. Upload/connect this project.
4. Set the environment variables in hPanel.
5. Install dependencies.
6. Run `npm run migrate`.
7. Run `npm run seed`.
8. Run `npm run create-admin -- admin@misticaura.com.au "A-strong-password" Admin MisticAura super_admin`.
9. Start/redeploy the Node.js app.
10. Test `/api/health`, signup, verification, login, cart, orders and admin MFA.

## Security

Never put production database, SMTP, Stripe or encryption secrets into frontend JavaScript or Git.
