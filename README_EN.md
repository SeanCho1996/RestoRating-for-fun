# Newmarket Resto Rating

[中文](README.md) | [English](README_EN.md)

A Chinese-language campus restaurant rating platform for the Newmarket area. It includes verified student registration, administrator and regular-user roles, restaurant and image management, password resets, and a five-tier community ranking board.

## Requirements

- Node.js 20 or later
- ImageMagick with WebP support (`convert`) for restaurant image processing
- An SMTPS account for email verification in production

## Getting Started

```bash
cp .env.example .env
npm start
```

Open <http://localhost:35774>. The application loads `.env` automatically. Data is stored in `data/database.json`, and processed restaurant images are stored in `uploads/`.

Regular users register through the website. Administrator accounts cannot be created through public registration; the first administrator is initialized from `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_NAME`. Changing those environment variables later does not overwrite an administrator already stored in the database.

## Email Verification

Copy `.env.example` to `.env` and configure these values:

- `BASE_URL`: The complete public URL, such as `https://rating.example.edu`. Verification and password-reset links use this address.
- `SMTP_HOST`, `SMTP_PORT=465`, and `SMTP_SECURE=true`: The SMTPS server configuration.
- `SMTP_USER` and `SMTP_PASS`: The SMTP login and app-specific password.
- `SMTP_FROM`: The sender email address.
- `NODE_ENV=production`: Enables `Secure` login cookies and prevents development verification links from being returned by the API.

If SMTP is not configured during development, verification links are printed in the server terminal and may be returned in the registration response. Production deployments should always use working SMTP and HTTPS.

> `.env` is ignored by Git. Never commit real passwords, SMTP authorization codes, user data, or production database files.

## Roles and Rating Rules

- **Administrator:** Can add, edit, and delete restaurants. Each restaurant requires a name, photo, and Google Maps link. Administrators can view statistics but cannot submit ratings.
- **Regular user:** Must register with an `@aucklanduni.ac.nz` University of Auckland student email and verify it before signing in. Users can add or update their own rankings.
- **Password reset:** Users can request a single-use email link. It expires after one hour, and existing sessions are invalidated after a successful reset.
- **Ranking visibility:** Signed-in users can view average ratings and tier placements. Visitors cannot view rating statistics.
- **Five tiers:** `5 夯`, `4 顶级`, `3 人上人`, `2 NPC`, and `1 拉完了`.

Desktop users can drag restaurant cards into a tier. Mobile users can tap a restaurant and then tap the desired tier.

## Image Processing

Uploaded images are automatically converted to WebP. The server generates an optimized full-size image and card thumbnail, corrects orientation, and strips EXIF metadata. To optimize restaurants created before this pipeline was introduced, run:

```bash
npm run optimize:images
```

The migration script keeps original images in `data/original-image-backups/`. Keep this directory out of Git because original photos may contain private metadata.

## Tests

```bash
npm test
```

Tests use temporary database and upload directories and do not modify production data.

## Production Notes

- Set `HOST=0.0.0.0` when the service must accept connections from outside the machine.
- Set `BASE_URL` to the real HTTPS address before sending verification emails.
- Place the Node.js service behind an HTTPS reverse proxy or secure tunnel.
- Back up `data/database.json` separately; it contains account and rating data and is intentionally excluded from Git.
- Do not commit `.env`, uploaded photos, database files, or original image backups.
