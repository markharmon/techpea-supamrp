# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project Purpose

Techpea SupaMRP is an Angular frontend backed by Supabase (Auth + Postgres + RLS) for MRP workflows:
- Items and BOM
- Work orders and production logs
- Role-based approval and permissions

## Stack And Structure

- Frontend: Angular standalone components in `web/src/app`
- Backend schema and security: SQL migrations in `supabase/migrations`
- Ad hoc SQL scripts: `database/`

Key files to learn first:
- `web/src/app/services/supabase.ts`
- `web/src/app/app.routes.ts`
- `supabase/migrations/0001_init.sql`
- `database/0003_purchase_orders.sql`

## Non-Negotiable Rules

1. Never commit real Supabase keys or URLs.
2. Keep `web/src/environments/environment.ts` and `web/src/environments/environment.prod.ts` empty of secrets.
3. Put local credentials only in `web/src/environments/environment.local.ts`.
4. Respect RLS and role claims (`app_metadata.permission`) when adding data operations.
5. Prefer additive schema changes through new migrations. Do not silently rewrite historical migrations that may already be applied.

## Angular Patterns To Follow

1. Use standalone components.
2. Use `inject(...)` over constructor dependency injection when extending existing style.
3. Use signals for local reactive state.
4. Keep component files split as `*.ts`, `*.html`, `*.scss`.
5. Follow existing template control flow style with `@if` and `@for`.
6. Keep business/data access in services, not in templates.
7. Preserve route guard behavior for auth and approval checks.

## Supabase Service Patterns

1. Add all DB interactions to `web/src/app/services/supabase.ts` first, then call from components.
2. Return Supabase responses and let components handle loading/error UX.
3. For updates/upserts, include `updated_at: new Date()` when table supports it.
4. Use RPC calls for complex transactional business logic rather than reproducing logic in the client.
5. Keep interface types in `supabase.ts` aligned with selected columns.

## Database Migration Patterns

When adding schema features:

1. Create a new numbered migration under `supabase/migrations`.
2. Include in order:
   - Tables/columns/constraints
   - Triggers or functions (`security definer` where needed)
   - RLS enablement
   - Policies
   - Grants
   - Helpful indexes
3. Use `create ... if not exists` and `drop ... if exists` for idempotent local replays where practical.
4. Keep permission checks centralized via helper functions such as:
   - `public.is_approved_user()`
   - `public.has_permission(text[])`
5. For business-state transitions (for example complete/cancel/receive), prefer SQL functions with locking/validation.

## Change Workflow For Agents

1. Read related component + service + SQL objects before editing.
2. Propose smallest viable change.
3. Implement service and DB changes before UI wiring where applicable.
4. Validate by running frontend build/tests and SQL migration checks if possible.
5. Summarize:
   - files changed
   - behavior impact
   - migration and rollout notes

## Quality Checklist Before Finalizing

- Auth guard and permission semantics preserved.
- No direct secret leakage in tracked files.
- Supabase column selections match actual schema.
- New routes are protected if they expose business data.
- New migrations include RLS + grants, not just tables.
- UI remains responsive and consistent with existing styles.

## Known Template Caveats To Watch

1. Keep table names consistent across SQL scripts and migrations.
2. Prefer canonical schema in `supabase/migrations` over ad hoc SQL in `database/`.
3. `database/0003_purchase_orders.sql` is planning-only for a future feature and is not part of the active baseline yet.
4. Do not wire purchase orders into routes, UI, or `supabase/migrations` unless explicitly requested for feature implementation.
5. If adding new domains, ensure frontend service methods, RLS, and grants are all added together.
