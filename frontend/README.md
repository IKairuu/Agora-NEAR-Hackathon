# AGORA frontend

React 19 + TypeScript + Vite + React Router implementation of `AGORA_Prototype_v6.2.html`. Plain CSS, no UI library.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build to dist/
```

## How it maps to the prototype

- `src/styles/agora.css` is the prototype stylesheet, copied verbatim. Treat it as the visual source of truth.
- `src/styles/responsive.css` holds the small fixes that stop clipping at 320px and in table headers.
- Markup keeps the prototype's class names, so every screen renders with the same CSS.
- Prototype `#hash` routes are real paths: `/ask`, `/dash`, `/jobs`, `/explore`, `/openjobs`, `/orders`, `/svc`, `/saved`, `/post`, `/job`, `/chat`, `/room`, `/agents`, `/mandate`, `/wallet`, `/profile`, `/sell`, `/seller`, `/dispute`.

## Layout

- `src/store/store.ts`: app state (the prototype's `S`), toasts and modals
- `src/store/actions.tsx`: every action (the prototype's `ACT`), navigation and the 16-step demo tour
- `src/data/sample.ts`: sample data (jobs, bids, services, chats)
- `src/landing/`: landing page and the character-field canvas
- `src/views/`: `hire.tsx` (New request, Overview, Your jobs, Find services, service page, Saved, Post a job), `job.tsx` (job, chat, escrow room), `agents.tsx` (Agent team, Limits and keys, Wallet), `market.tsx` (seller profile, Become a seller, Seller desk, Disputes)
- `src/ui/`: icons and logo, shared parts, the app shell, modals, toasts, tour
- `public/img/`: the two photos from the prototype

Everything runs on sample data, as in the prototype. Sign-in, payments and contract calls are simulated, and the `stage` value in the store drives the scripted demo.
