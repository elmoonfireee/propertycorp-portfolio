# Agent guidelines

## Project overview

PropertyCorp is a real-estate web application built with React 18, Vite, JavaScript ES modules, JSX and CSS, using Leaflet for interactive maps and pnpm for package management. It includes a home page, offer listing with filters and sorting, offer details, galleries, maps, formatted descriptions, consent and navigation. The portfolio data and offer images are synthetic; this repository is not a live agency site.

The `portfolio` edition disables analytics and form delivery, permits presentation variant selection and adds a noindex directive. Its demo map uses OpenStreetMap after consent. The `client` edition locks presentation variants and enables analytics and form delivery in its configuration; integrations still require their own configuration. The package's `dev`, `build` and `preview` scripts select portfolio explicitly; an unspecified `VITE_SITE_EDITION` in the configuration resolves to client.

## Architecture

- `src/pages/` selects and renders pages; `src/components/` contains UI, including listing filters, cards, gallery, maps, consent and contact. `src/styles/` contains feature styles; `src/config/` defines editions, assets and links.
- `src/domain/offers/` owns the normalized offer contract, image and description normalization, description parsing, filter serialization and matching, sorting, presentation and route helpers. Preserve existing data contracts and adapter boundaries. Propose changes to data models separately and implement them only after explicit approval.
- `src/services/offers/` exposes one repository interface. Vite resolves `@propertycorp-offer-repository` at build time from `VITE_OFFERS_REPOSITORY`: `local` reads `_input/imo-current/oferty.json` and normalizes records in the frontend; `runtime` fetches the versioned `/api/offers` payload and applies the same filtering and sorting. The runtime adapter does not import the local snapshot.
- `src/pages/HomePage.jsx` selects routes from the pathname. `offerRoutes.js` builds `/oferty/<slug>--<externalId>` and handles listing search context; the listing parses and serializes filters in query parameters, updates browser history and handles `popstate`. Preserve legacy listing paths, navigation context and the existing URL contract when changing these flows.
- `server/offerSnapshotRepository.mjs` reads and normalizes the accepted runtime snapshot; `server/httpRuntime.mjs` serves the offer API, media and built frontend. The server repository reloads the accepted snapshot when its file identity changes. `api/google-reviews.js` provides a separate Vercel handler. The frontend presents and filters offers; runtime state and API responses are server responsibilities.
- `_input/imo-current/` contains the synthetic demo snapshot and source photos; `public/media/` contains served assets. `scripts/` contains tests, validation, media preparation, IMO tooling and reports. `docs/` contains the description format specification.

## Coding conventions

Follow the surrounding code: ES modules, two-space indentation, double-quoted strings and semicolons. React components use PascalCase filenames and names; hooks use `use` prefixes; domain functions and variables use camelCase, and shared constants use uppercase names where established. Keep rendering in components, reusable domain decisions in existing helpers, and side effects at their established boundaries. Prefer small, direct functions and existing utilities over duplicate logic or speculative abstractions. Preserve current naming, error handling and data contracts.

## Agent workflow

1. Check `git status` before editing. Read the relevant implementation first; establish current behavior before proposing a change.
2. Make the smallest justified change. Do not rebuild working features without a concrete reason. Do not remove validation, tests or error handling without understanding their purpose.
3. Preserve public and internal contracts during refactoring, including normalized offers, adapter interfaces, URLs and filter state. Check the impact on both editions and, where relevant, both data adapters.
4. Before implementing a change outside the requested scope, explain the specific problem, proposed solution, advantages, disadvantages, alternatives and risks, then wait for explicit approval. Do not ask again for the scope already approved. An analysis or review request alone does not authorize fixing every issue found.
5. Do not introduce new tests, testing frameworks, CI workflows or dependencies without explicit approval. Report what changed, why, and how it was verified, including any checks not performed.

## Development and builds

Use Node.js 22 and pnpm 9.15.9. Install dependencies with `pnpm install --frozen-lockfile`. Run the portfolio edition with `pnpm run dev` or `pnpm run dev:portfolio`, and the client edition with `pnpm run dev:client`.

Production builds are available as `pnpm run build:portfolio` and `pnpm run build:client`; `pnpm run build` builds the portfolio edition. Both profiles should remain functional.

## Security and data protection

- Never commit secrets, `.env.local` or other private environment files. Review staged files and diffs for private data.
- Do not run IMO imports against production data without explicit authorization. Use isolated synthetic fixtures for development and tests.
- Do not expose private data in logs, test output, reports or PR descriptions.

## Git workflow

Work on a separate branch and preserve any uncommitted changes. Do not force push or rewrite history without authorization. Keep commits small and logical. Before opening a PR, review the diff and report any checks performed.
