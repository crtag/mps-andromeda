# Deployment Guide

## Current Situation (14 Jan 2026)

The frontend is **temporarily deployed to Cloudflare Pages** due to Google Safe Browsing incorrectly flagging the Firebase Hosting domain (`simulations-26-prod.web.app`) as potentially harmful.

- **Backend**: Firebase Cloud Functions (unchanged)
- **Frontend**: Cloudflare Pages (temporary) at `job-manager-7as.pages.dev`

Once the Safe Browsing issue is resolved, the frontend can be migrated back to Firebase Hosting.

---

## Firebase Deployment

### Deploy Cloud Functions

```bash
firebase deploy --only functions --project simulations-26-prod
```

### Deploy Frontend to Firebase Hosting

```bash
firebase deploy --only hosting --project simulations-26-prod
```

> **Note**: Firebase Hosting is currently blocked by Safe Browsing. Use Cloudflare deployment below until resolved.

---

## Cloudflare Pages Deployment

Deploy the frontend to Cloudflare Pages:

```bash
cd api/app
wrangler pages deploy . --project-name=job-manager
```

### First-time Setup

1. Install Wrangler: `npm install -g wrangler`
2. Login: `wrangler login`
3. The project `job-manager` will be created automatically on first deploy

---

## Configuration Files

| File | Purpose |
|------|---------|
| `firebase-config.js` | Production Firebase config (used by Cloudflare/external hosting) |
| `firebase-local-config.js` | Local development Firebase config |

The frontend automatically detects the hosting environment:
- **Firebase Hosting** (`*.web.app`, `*.firebaseapp.com`): Uses Firebase's auto-init (`/__/firebase/init.js`)
- **Cloudflare/External**: Uses `firebase-config.js`
- **Localhost**: Uses `firebase-local-config.js`

---

## Post-Deployment: Firebase Auth Setup

When deploying to a new domain, add it to Firebase Auth authorized domains:

1. **Firebase Console** → Authentication → Settings → Authorized domains
2. **GCP Console** → APIs & Services → Credentials → Edit API key → HTTP referrers

Add your domain (e.g., `job-manager.pages.dev`) to both locations.

---

## Resolving Safe Browsing Block

To restore Firebase Hosting:

1. Submit a review request at: https://safebrowsing.google.com/safebrowsing/report_error/
2. Or use Google Search Console (requires domain verification)
3. Once cleared, switch back to `firebase deploy --only hosting`