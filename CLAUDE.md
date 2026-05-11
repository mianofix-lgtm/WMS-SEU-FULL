# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server (Vite, localhost:5173)
npm run build    # Production build
npm run preview  # Preview production build locally
```

No linting, testing, or TypeScript configured — vanilla JavaScript React project.

## Architecture

**Stack**: React 18 + React Router 6 + Vite + Firebase (Auth + Firestore). Deployed on Vercel with SPA rewrite (`vercel.json`). PWA-enabled (manifest + service worker in `public/`).

**All backend logic lives in `firebase.js`** — auth helpers, Firestore CRUD, WMS cell transactions, billing, auto-backup, and audit logging. There is no server; everything hits Firebase directly.

**All pages are flat at the root level** (no `src/` directory):
- `App.jsx` — auth context (`useAuth()`), `ProtectedRoute`, and all route definitions
- `firebase.js` — sole backend interface (310 lines)
- `Wms.jsx` — largest file (~3500 lines), full warehouse editor
- `Portal.jsx`, `Admin.jsx`, `Billing.jsx`, `Dashboard.jsx`, `Landing.jsx`, `Login.jsx`, `Register.jsx`

## Role System

Permissions are defined in `firebase.js` as `PERMISSIONS` and resolved via `getPerms(role)`. Five roles:

| Role | canSeeAll | canEdit | canSeeValues | canEditValues | canDelete |
|------|-----------|---------|--------------|---------------|-----------|
| diretor | ✓ | ✓ | ✓ | ✓ | ✓ |
| comercial | ✓ | ✓ | ✓ | ✓ | ✗ |
| financeiro | ✓ | ✗ | ✓ | ✗ | ✗ |
| logistica | ✓ | ✓ | ✗ | ✗ | ✗ |
| cliente | ✗ | ✗ | ✗ | ✗ | ✗ |

`ProtectedRoute` in `App.jsx` gates routes by `allowedRoles`. `diretor` is the only role with access to `/admin` and `/dashboard`.

## Firestore Data Model

| Collection/Doc | Contents |
|----------------|----------|
| `users/{uid}` | Profile: `email`, `role`, `status` (`pendente`/`ativo`/`rejeitado`), `loja` (client store name) |
| `wms/estoque` | Single doc — entire warehouse grid as a JSON string in `.data` field |
| `wms/coletas` | Picking/collection history |
| `billing/{loja}_{YYYY-MM}` | Monthly invoices per client |
| `config/pricing` | 14 service line-item prices (fallback: `DEFAULT_PRICES` in `firebase.js`) |
| `config/costs` | Operating cost tracking |
| `backups/{YYYY-MM-DD}` | Daily auto-backups, 30-day retention |
| `logs/{id}` | Audit trail via `logAction()` |

**WMS cell writes are always transactional** (`wmsSaveCell`, `wmsClearCell`, `wmsMoveCell`, `wmsArchiveCells`) — they read server state first, patch only the target cell, then write back atomically to prevent concurrent overwrites.

## UI Conventions

- **Dark theme only**, no CSS files except `Landing.jsx` (which uses a `<style>` tag). All other components use inline style objects.
- Common pattern: define style constants at the top of each component (e.g., `const S = { card: {...} }`, `const thS`, `const tdS`) and apply them inline.
- Primary color: `#00C896`. Background: `#08090D`. Cards: `#0F1117`.
- Font: Outfit (Google Fonts, loaded in `index.html`).
- Mobile breakpoint: `max-width: 768px`, handled inline per component.

## Key Behaviors

- **Client registration** (`registerClient`) sets `status: 'pendente'` and immediately signs the user out — they cannot log in until a director approves via `Admin.jsx`.
- **Auto-backup** runs once per day on director login (`autoBackup()` checks if today's backup doc already exists before running).
- **`getClientStock(lojaName)`** filters the full WMS grid to only cells belonging to a specific client — used to isolate `cliente` role data in `Portal.jsx`.
