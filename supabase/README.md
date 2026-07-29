# Shared database migration authority

Pixelated Studio Edition is the sole migration authority for the Supabase project
shared by Studio Edition and User Edition.

Create, review, and run migrations only from this repository. Never run
`supabase db push` or `supabase migration repair` from Pixelated User Edition.
The User Edition repository may contain application code that consumes new schema,
but it must not contain an independent copy of shared migration history.

Before applying a migration:

1. Confirm `npx supabase migration list` shows identical local and remote history.
2. Review the SQL and run `npx supabase db push --dry-run`.
3. Back up the production database when the change mutates existing data or schema.
4. Apply once from this directory, then deploy the shared API before either client
   starts relying on the new contract.

## Current shared responsibilities

The migration history owns catalog/storage policies, edition-aware activity,
backend sessions, catalog ingestion and browser-smoke contracts, atomic social
and admin workflows, stale-account cleanup, and anonymous-play restrictions.
Executable ROMs live in the private `catalog_roms` bucket; public artwork stays
in `catalog_artifacts`.

Anonymous Studio play additionally requires the hosted Supabase project to
enable Anonymous Sign-Ins and Cloudflare Turnstile CAPTCHA. The Turnstile
secret belongs only in Supabase; clients receive the public site key. Follow
[`../docs/anonymous-play-setup.md`](../docs/anonymous-play-setup.md) for the
deployment order and verification flow.

Useful migration checks from the repository root:

```sh
npx supabase migration list
npx supabase db push --dry-run
```

Do not run `db push` until the dry-run and remote migration history have been
reviewed.
