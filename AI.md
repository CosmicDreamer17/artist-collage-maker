# 🤖 Master Agentic Protocol (AI.md)

This file is the single source of truth for all autonomous agents interacting with this repository.

## 🚀 Agentic Bootstrap (Creating a New Project)

If you are an AI agent tasked with initializing a new project from this template, follow these steps immediately after cloning:

1.  **Git Re-initialization**: Run `rm -rf .git && git init` to start a fresh history.
2.  **Environment Sync**: Run `pnpm install` to hydrate the workspace.
3.  **Config Setup**: Run `cp .env.example .env` to establish default configuration.
4.  **Baseline Verification**: Run `make verify` to ensure the template is healthy before adding new features.

## 🏗 Architectural Mandates

1.  **Physical Boundaries**: This is a Hexagonal (Ports and Adapters) Monorepo.
    - `domain`: Pure business logic. Zero external dependencies (except Zod for validation schemas).
    - `application`: Ports (Interfaces), Use Cases (e.g., `BuildCollageUseCase`), and Result types.
    - `infra`: Driven adapters (Drizzle, libSQL/SQLite). Implements application ports.
    - `api`: Driving adapter. Uses `createApp(repo)` factory for dependency injection. Composition roots in `dev.ts` (local) and `vercel.ts` (production).
    - `web`: Driving adapter. Zero-drift types via Hono RPC.
2.  **Dependency Flow**: Inward only (`api -> application -> domain`). Violations will break the build via `dependency-cruiser`. Note: `api` also depends on `infra` for its composition roots (wiring concrete adapters), but route handlers only depend on application-layer ports.
3.  **Dependency Injection**: Use cases accept ports via constructor injection. The `createApp` factory in `apps/api/src/index.ts` accepts ports (`ImageRepository`, `QualitySignalRepository`, gateways) and wires them to use cases. Concrete adapters are instantiated only in composition roots (`dev.ts`, `vercel.ts`).
4.  **Branded Types**: Never use raw primitives for IDs. Always use `Brand<string, 'Name'>` for type safety.
5.  **Zod Validation**: All data crossing a layer boundary MUST be validated via Zod. Environment variables are validated at startup (see `packages/infra/src/db.ts`).
6.  **ESM Native**: This is a `type: module` project. Relative imports MUST include the `.js` extension.

## 🛠 Operational Protocols

1.  **Plan Mode First**: Use `/plan` mode before modifying the `domain` or `application` layers.
2.  **The "Slice" Protocol**: When building features, proceed in order: `Domain` -> `Application` -> `Infra` -> `API` -> `Web`.
3.  **Verification**: `make verify` is the absolute standard for task completion.

## 📜 Provenance
Created by **Gemini CLI** (Gemini 3 Flash Preview) on March 29, 2026.
