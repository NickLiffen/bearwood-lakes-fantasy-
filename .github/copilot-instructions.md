# Copilot Instructions

## Build, Test, and Lint

```bash
npm run build          # TypeScript compile + Vite build
npm run test           # Jest (all tests)
npm run test -- --testPathPattern="auth" # Run tests matching a pattern
npm run test -- __tests__/functions/unit/services/picks.service.test.ts # Single test file
npm run lint           # ESLint 9 (flat config)
npm run lint:fix       # ESLint with auto-fix
npm run format         # Prettier (write)
npm run format:check   # Prettier (check only)
npm run type-check     # tsc --noEmit
netlify dev            # Local dev with functions (recommended over `npm run dev`)
```

## Architecture

This is a fantasy golf league app with a React 19 SPA frontend and Netlify Functions serverless backend, sharing types and validation through a `shared/` package.

### Three-layer structure

- **`src/`** — React frontend (Vite, React Router). Uses `@/` path alias.
- **`netlify/functions/`** — Serverless API endpoints. Each file is one endpoint. Uses `@shared/` path alias. Compiled with a separate `tsconfig.functions.json` (CommonJS target).
- **`shared/`** — Types, Zod validators, and game constants consumed by both layers. Uses `@shared/` path alias from both sides.

### Backend function pattern

Every function follows the same layered flow: **handler → middleware → service → model**.

- **Handler** (e.g., `auth-login.ts`): Thin entry point wrapped with `createHandler()` or `createAuthHandler()` from `_shared/middleware.ts`.
- **Middleware** (`_shared/middleware.ts`): Composable wrappers — `withAuth()`, `withAdmin()`, `withRateLimit()`. Handles CORS, error handling, logging, and auth verification.
- **Services** (`_shared/services/`): Business logic layer. Functions accept validated data and return results.
- **Models** (`_shared/models/`): MongoDB collection accessors with typed interfaces.
- **Validators** (`_shared/validators/`): Zod schemas for request body validation.

### Frontend state management

- **AuthContext** (`src/context/AuthContext.tsx`): Global auth state with localStorage persistence, automatic token refresh (401 → refresh → retry), and `credentials: 'include'` for httpOnly cookie-based refresh tokens.
- **`useApiClient` hook**: HTTP client that auto-injects auth headers, handles AbortController cleanup on unmount, and retries on 401.
- **`useAsyncData` / `useAsyncMutation` hooks**: Data fetching/mutation hooks that manage loading/error/data state and wait for auth readiness before fetching.

### Auth flow

JWT access tokens are returned in JSON responses; refresh tokens are stored in httpOnly cookies. Token rotation is enforced — refresh tokens are revoked after use. The backend tracks refresh tokens in MongoDB with user agent and IP metadata.

## Key Conventions

- **API endpoint naming**: Flat kebab-case files in `netlify/functions/` matching the resource-action pattern (e.g., `golfers-list.ts`, `picks-save.ts`, `auth-login.ts`).
- **Shared validation**: Zod schemas in `shared/validators/` are the source of truth for request validation, reused across frontend and backend.
- **Game rules as constants**: Budget cap ($50M), team size (exactly 6 golfers), and role definitions live in `shared/constants/rules.ts`. Reference these instead of hardcoding values.
- **Path aliases**: Use `@/` for frontend imports and `@shared/` for shared imports. Both Vite and tsconfig are configured for these.
- **Unused variables**: Prefix with `_` (ESLint rule `argsIgnorePattern: '^_'`).
- **Formatting**: Prettier with single quotes, semicolons, 100 char print width, trailing commas (es5), 2-space tabs.
- **Rate limiting**: Upstash Redis. Applied via `withRateLimit()` wrapper on sensitive endpoints (auth, writes).
- **Database scripts**: Run with `npx tsx scripts/<name>.ts` (e.g., `npm run db:seed-comprehensive`). Scripts prompt for confirmation before destructive operations.
