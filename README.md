# SIBOL-Backend
SIBOL: Smart-Monitored and AI-Optimized Community-Based Biogas System for Waste Management and Renewable Electric Power

# SIBOL Backend - Environment Variables

Set the following environment variables in your deployment (Railway / Render / Netlify functions env) or in a local `.env` for development.

## Required (production)
- `SESSION_SECRET` - very strong random string (>=32 chars)
- `JWT_SECRET` - very strong random string (>=32 chars)
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASS`
- `DB_NAME`
- `EMAIL_USER` - SMTP/email account (e.g., Gmail address)
- `EMAIL_PASSWORD` - SMTP app password or service password

## Recommended
- `BACKEND_URL` - e.g., https://sibol-backend.yourhost.com (used for OAuth callback URLs)
- `FRONT_END_PORT` - frontend URL (e.g., https://sproutsibol.netlify.app or http://localhost:5173)
- `GOOGLE_CLIENT_ID` - Google OAuth client id
- `GOOGLE_CLIENT_SECRET` - Google OAuth secret
- `DEFAULT_PASSWORD` - default password used for admin-created accounts (change in production)
- `JWT_TTL` - token lifetime (default: 8h)
- `SESSION_IDLE_MS` - session idle timeout in ms (default: 600000)

## Notes
- Never commit real secrets into the repository. Add `.env` to `.gitignore`.
- In production set env vars via your host's dashboard (Railway/Render/Netlify).
- `BACKEND_URL` must match the OAuth redirect URI configured in Google console.

## Example `.env` (development)
```
PORT=5000
NODE_ENV=development
FRONT_END_PORT=http://localhost:5173
BACKEND_URL=http://localhost:5000

DB_HOST=...
DB_PORT=3306
DB_USER=...
DB_PASS=...
DB_NAME=...

EMAIL_USER=you@example.com
EMAIL_PASSWORD=app-password

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

SESSION_SECRET=dev-session-secret-change-in-prod
JWT_SECRET=dev-jwt-secret-change-in-prod
DEFAULT_PASSWORD=SIBOL12345
```
