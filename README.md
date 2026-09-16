# Backer — The system behind the market

A standalone technical brief connecting simulation science, market architecture and the revenue/data feedback loop. The site has three chapters, original systems diagrams, a deterministic 96-agent synthetic order-book illustration, instrument explanations and transparent financial calculators.

## Local preview

Run `python3 -m http.server 4186 --directory public`, then open `http://127.0.0.1:4186`.

## Validate and build

```sh
node --test tests/*.test.mjs
node scripts/build.mjs
```

Only the audited `dist/` static output is published. Fonts and the Backer mark are bundled. No connection to another Backer site or backend is required.

The numerical examples are synthetic and show mechanisms, not measured predictive accuracy, live trading or forecast revenue. Market, creator-fee and perpetual architectures retain their current/proposed status in the presentation.

## Implementation

- `public/index.html`: three-section technical narrative and accessible controls.
- `public/style.css`: Backer design palette, responsive diagrams and print layout.
- `public/app.mjs`: interactions, chart rendering and calculators.
- `public/model.mjs`: reproducible experiment, accounting and fee economics.
- `tests/model.test.mjs`: economic and market invariants.
- `scripts/build.mjs`: public-artifact validation and static packaging.

GitHub Pages serves the audited static output from the `gh-pages` branch. Vercel serves the same static output. Internal working documents and reference materials are excluded from the repository and deployment.
