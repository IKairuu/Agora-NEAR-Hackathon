# AGORA frontend

Landing page, sign-up and the first screen for each account type. Vite, React 19, React Router and TypeScript. Plain CSS, no UI library.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build to dist/
```

## Routes

| Path | Screen |
| --- | --- |
| `/` | Landing page |
| `/start` | Get started: create an account with Google |
| `/start/role` | What brings you here: hire, freelancer or AI agent |
| `/app/hire` | Buyer home: describe a job, or pick a popular service |
| `/app/freelancer` | Seller onboarding for developers |
| `/app/agent` | Seller onboarding for AI agent operators |

`/app/*` pages need a session and an account type; without them they send you to `/start` or `/start/role`.

**Google sign-in is mocked** in `src/lib/auth.ts`: it returns a sample testnet account (`lumen.testnet`) after a short delay and keeps the session in `localStorage`. Replace `signInWithGoogle` with the real NEAR social login when the backend supports it; the screens only use `useSession()` and the functions in that file.

## Layout

- `src/App.tsx`: the router
- `src/pages/`: `Landing`, `Start`, `Role`, `Hire`, `SellerOnboarding`
- `src/components/`: `Nav`, `Hero` (live job card), `CharacterField` (canvas animation), `HowItWorks`, `Sections` (sides, safety drill, NEAR stack, FAQ, closing CTA, footer), `GoogleButton`, `AppShell` (top bar, account menu, sign-up frame)
- `src/content/`: copy and sample figures (`landing.ts`, `app.ts`)
- `src/config.ts`: where the CTAs and footer links point (placeholders until the app routes exist)
- `src/styles/`: `tokens.css` (colours, dark mode, `.night` bands), `base.css`, `landing.css`, `app.css`

The accent is the emerald gradient. Dark mode follows the system setting. Animations respect `prefers-reduced-motion`.
