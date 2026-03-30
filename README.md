# High-Performance DDD & Hexagonal TypeScript Monorepo

A production-ready starter template designed for autonomous AI agents and senior engineers. It enforces strict physical boundaries between the Domain, Application, and Infrastructure layers using Turborepo, pnpm workspaces, and dependency-cruiser.

## 🏗 Architecture & Dependency Flow

This monorepo follows the **Hexagonal (Ports and Adapters)** architecture. The dependency flow is strictly inward:

`Web/API (Drivers) -> Application (Ports/Use Cases) -> Domain (Core)`
`Infrastructure (Driven) -> Application (Ports)`

| Package | Responsibility | Restrictions |
| :--- | :--- | :--- |
| `@starter/domain` | Business Logic, Entities, Branded Types, Zod Schemas. | **Pure Logic.** Zero external dependencies (except Zod). |
| `@starter/application` | Ports (Interfaces), Use Cases (`RegisterUserUseCase`), Result types. | No DB-specific logic. No Web/HTTP logic. |
| `@starter/infra` | Database implementation (Drizzle), External Clients. Env validation at startup. | Implements `@starter/application` ports. |
| `apps/api` | Hono Web Server. `createApp(repo)` factory for DI. Composition roots: `dev.ts` (local), `vercel.ts` (production). | Routes requests to Application use cases via injected ports. |
| `apps/web` | Next.js Frontend, UI Components. | Zero-drift types via Hono RPC. |

## 🛠 Tech Stack

- **Frameworks**: Next.js 16+, Hono (API)
- **Runtime**: Node.js (ESM Native)
- **Monorepo**: Turborepo + pnpm Workspaces
- **ORM**: Drizzle ORM + libSQL/SQLite
- **Validation**: Zod (Everywhere)
- **Type Safety**: Branded Types for IDs, Hono RPC for Frontend/Backend bridge.
- **Verification**: Dependency Cruiser (Boundaries), Knip (Dead Code), Vitest (Testing), ESLint (Strict).

## 🚀 Getting Started

1. **Install dependencies**:
   ```bash
   pnpm install
   ```

2. **Environment Variables**:
   ```bash
   cp .env.example .env
   # Optional: set DATABASE_URL (defaults to local file:quality.db)
   # Optional: set NEXT_PUBLIC_API_URL for split web/api deployments
   ```

3. **Database Migration**:
   ```bash
   make db:generate
   make db:push
   ```

4. **Development**:
   Starts Next.js (port 3000 by default) and Hono (port 3002 by default) concurrently.
   ```bash
   make dev
   ```

5. **Verification**:
   The single source of truth for architectural integrity.
   ```bash
   make verify
   ```

6. **Push Safety**:
   This repo ships with a local pre-push hook in `.githooks/pre-push` and a GitHub Actions workflow in `.github/workflows/verify.yml`.
   For fresh clones, point Git at the shared hooks directory:
   ```bash
   git config core.hooksPath .githooks
   ```

## 🤖 AI / Agentic Quality of Life

This repository is optimized for AI-only maintenance:

- **Strict Boundaries**: `.dependency-cruiser.cjs` ensures an agent cannot accidentally import infra into domain.
- **Branded Types**: All IDs use branded types (e.g., `UserId`) to prevent primitive obsession and mixing up IDs.
- **Zod Boundaries**: Data is validated at every boundary (API request, DB result, Domain logic).
- **Type Bridge**: The frontend `hc` client infers types directly from the API router. No code generation needed.
- **Dependency Injection**: `createApp(repo)` factory accepts ports, making the API fully testable with in-memory implementations (no `vi.mock` needed).
- **Env Validation**: `DATABASE_URL` is validated via Zod at startup with clear error messages.
- **Verification Script**: Agents must run `make verify` before submitting any change.

## 📁 Directory Structure

```text
.
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── index.ts      # createApp() factory (DI entry point)
│   │       ├── dev.ts        # Composition root (local dev)
│   │       └── vercel.ts     # Composition root (Vercel production)
│   └── web/                  # Next.js frontend
├── packages/
│   ├── domain/               # Pure core logic (Branded Types, Zod Schemas)
│   ├── application/          # Ports (UserRepository), Use Cases (RegisterUserUseCase)
│   └── infra/                # Driven adapters (Drizzle, Neon), env validation
├── scripts/
│   └── verify.sh             # Architecture & logic verification
├── Makefile                  # Task runner
└── turbo.json                # Build pipeline
```

---

## 📜 Provenance

This repository was fully architected, implemented, and verified by **Gemini CLI** on **March 29, 2026**.

- **Tooling**: Gemini CLI
- **Model**: Gemini 3 Flash Preview (orchestrated via autonomous mode)
- **Architect**: Howard Rhee (Principal Systems Architect)
- **Goal**: Create a zero-drift, strictly-bounded DDD monorepo for AI-native maintenance.
