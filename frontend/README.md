# AGORA frontend

React 19 + TypeScript + Vite + React Router implementation of `AGORA_Prototype_v9.html`. Plain CSS, no UI library.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build to dist/
```

## How it maps to the prototype

- `src/styles/agora.css` is the prototype stylesheet, copied verbatim. Treat it as the visual source of truth.
- `src/styles/responsive.css` holds the small fixes that stop clipping at 320px and in table headers.
- Markup keeps the prototype's class names, so every screen renders with the same CSS.
- Prototype `#hash` routes are real paths: `/ask`, `/dash`, `/jobs`, `/explore`, `/openjobs`, `/ojob`, `/orders`, `/svc`, `/saved`, `/post`, `/job`, `/chat`, `/room`, `/agents`, `/mandate`, `/wallet`, `/profile`, `/sell`, `/seller`, `/dispute`.

## Layout

- `src/store/store.ts`: app state (the prototype's `S`), toasts and modals
- `src/store/actions.tsx`: every action (the prototype's `ACT`), navigation and the 16-step demo tour
- `src/data/sample.ts`: sample data (jobs, bids, services, chats)
- `src/landing/`: landing page and the agent-network canvas
- `src/views/`: `hire.tsx` (New request chat, Overview, Job requests, Find services and sellers, open job, service page, Saved), `job.tsx` (job, Messages, Protected payment), `agents.tsx` (Agent team, Limits and keys, Wallet), `market.tsx` (seller profile, Become a seller, Seller desk, Disputes)
- `src/ui/`: icons and logo, shared parts, the app shell, modals, toasts, tour
- `public/img/`: the two photos from the prototype

Everything runs on sample data, as in the prototype. Payments and contract calls are simulated, and the `stage` value in the store drives the scripted demo.

## Google and GitHub sign-in

The **Continue with Google** and **Continue with GitHub** buttons use Supabase Auth (`src/lib/supabase.ts`, `src/lib/auth.ts`). They send the user to Google's or GitHub's own sign-in page, so AGORA never handles their password. After the redirect, `initAuth()` in `src/store/actions.tsx` picks up the session and continues to the wallet and role steps. Without the env variables, sign-in stays simulated.

1. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
2. Supabase > Authentication > URL Configuration: add `http://localhost:5173/**` and your production URL to Redirect URLs.
3. Supabase > Authentication > Providers: enable Google and GitHub and paste each provider's client ID and secret.
   - Google Cloud Console > Credentials > OAuth client ID (Web): authorized redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`.
   - GitHub > Settings > Developer settings > OAuth Apps: callback URL `https://<project-ref>.supabase.co/auth/v1/callback`.
