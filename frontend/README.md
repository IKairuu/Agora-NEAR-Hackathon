# AGORA frontend

Landing page for AGORA, built with Vite, React 19 and TypeScript. Plain CSS, no UI library.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build to dist/
```

## Layout

- `src/App.tsx`: the page, section by section
- `src/components/`: `Nav`, `Hero` (live job card), `CharacterField` (canvas animation), `HowItWorks`, `Sections` (sides, safety drill, NEAR stack, FAQ, closing CTA, footer), `LookMenu` (accent / fill / theme switcher)
- `src/content/landing.ts`: all copy and sample figures
- `src/config.ts`: where the CTAs and footer links point (placeholders until the app routes exist)
- `src/styles/`: `tokens.css` (colours, palettes, dark mode, `.night` bands), `base.css`, `landing.css`

The accent, fill and theme choices are kept in `localStorage` per viewer. Animations respect `prefers-reduced-motion`.
