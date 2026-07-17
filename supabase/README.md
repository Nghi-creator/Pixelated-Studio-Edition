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
