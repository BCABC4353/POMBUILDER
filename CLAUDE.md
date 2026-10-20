# CLAUDE.md

## What this repo is

POM Builder: Electron + React 18 + TS. Source in `src/`. Desktop app for generating PCS mail packets for HOLD - POM REQUIRED Medicare claims.

## Build prerequisites (fresh clone)

- `npm run build` / `npm run dev` REQUIRE `npm run generate-config` first,
  which needs `AZURE_CLIENT_ID` / `AZURE_TENANT_ID` (env or `.env`). Without
  them the gitignored `src/main/auth/azure-config.generated.ts` and
  `src/main/services/runtime-config.generated.ts` do not exist and
  `tsc -p tsconfig.main.json` fails on the missing import.
- For local typechecking without real credentials, generate with any
  syntactically valid GUIDs.
- NEVER edit or commit `*.generated.ts` files. Tests don't need them —
  `vitest.config.ts` aliases stubs from `src/test/fixtures/`.

## Verification commands (run from repo root unless noted)

```
npx tsc --noEmit -p tsconfig.main.json
npx tsc --noEmit -p tsconfig.renderer.json
npm run lint
npm test
```

Both tsconfigs include `src/shared/**` with DIFFERENT module semantics — an
import style valid under one can fail the other. Always run both.

## Comment policy

This codebase is comment-free. No prose comments, docstrings, or inline
explanations in any file. The only comments allowed are functional directives
the toolchain needs (`eslint-disable*`, `@ts-expect-error`, `/// <reference`),
and only where the build genuinely requires them.

## Things that look like junk but are load-bearing

- `RELEASE_REQUEST` (repo root): committing a change to it on `main` TRIGGERS
  a full build-and-release via `.github/workflows/release-bridge.yml`.
- `update-policy.json`: polled by every installed Windows app every 10 min;
  `forceMinVersion` force-restarts the fleet onto the latest release.
- Release flow: GitHub Actions bumps the version and tags — never hand-edit
  the version in `package.json`.

## IPC contract (desktop)

A renderer<->main channel has FOUR synchronized touchpoints — change all of
them together (contract tests in `src/test/` enforce this):
`src/shared/ipc-channels.ts` (name) -> `src/shared/ipc-types.ts` (signature) ->
`src/preload/index.ts` (bridge) -> `src/main/ipc/*.ts` (handler, returning the
`IPCResponse<T>` envelope — handlers must not throw).

## Styling

- Brand accent is Safety Orange #FF6B35.
- Design system lives in `design_system/` (EXTRACTOR primitives + AUTODIALER SegmentedControl).
- Four aliases: `@ds` -> `design_system/ds`, `@design` -> `design_system`,
  `@shared` -> `src/shared`, `@` -> `src/renderer`.
- Tailwind preset from `design_system/tailwind.config.js`.

## Helper exe

`helper/` is vendored Python (pcs package + pom_helper.py). PyInstaller onedir.
Electron spawns it via `src/main/helper.ts`. Never import directly from main process.
