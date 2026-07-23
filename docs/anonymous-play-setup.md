# Anonymous Play configuration

PIXELATED uses Supabase anonymous users as temporary, verifiable owners for guest
Studio sessions. Guests do not receive profiles or permanent-account permissions.
Cloudflare Turnstile protects creation of the anonymous Supabase user.

## Deployment order

1. Apply `supabase/migrations/20260724110000_anonymous_play_security.sql` from
   this repository before enabling anonymous sign-ins. The migration skips profile
   creation for guests, restricts social/account writes, and schedules deletion of
   anonymous users older than 30 days.
2. In Cloudflare Dashboard, create a Turnstile widget:
   - Widget mode: **Managed** (recommended).
   - Allowed hostname: `pixelated-studio-edition.vercel.app`.
   - Add every production/custom hostname that can serve the web application.
   - Use Cloudflare's testing keys for local automated testing; do not add the
     production secret to frontend environment variables.
3. Copy the Turnstile **secret key** into Supabase Dashboard under
   **Authentication → Bot and Abuse Protection → CAPTCHA**, select Turnstile, and
   enable CAPTCHA protection.
4. In Supabase Dashboard under **Authentication → Providers**, enable
   **Anonymous Sign-Ins**.
5. Set the public Cloudflare **site key** in the Vercel web project:

   ```text
   VITE_TURNSTILE_SITE_KEY=<Cloudflare site key>
   ```

   Redeploy the web application because Vite embeds this value at build time.
6. Configure the hosted API (Render):

   ```text
   ANONYMOUS_SESSION_RATE_LIMIT_PER_MINUTE=10
   RATE_LIMIT_REDIS_REST_URL=<shared Redis REST URL>
   RATE_LIMIT_REDIS_REST_TOKEN=<shared Redis REST token>
   ```

   Redis is required in production so IP limits remain effective across API
   instances. Deploy the API after applying the migration.

## Expected flow

On the first catalog Play without a permanent account, the browser obtains a
single-use Turnstile token and calls `supabase.auth.signInAnonymously()`. Supabase
validates the CAPTCHA and returns a guest JWT containing `is_anonymous: true`.
The API accepts that JWT only for gameplay-scoped endpoints backed by an approved
live session and uses a short-lived signed catalog artifact URL. Local Vault play
does not create a guest.

The browser persists the guest session. Clearing site data or using another browser
creates another guest on the next Play. The scheduled database cleanup removes guest
accounts older than 30 days; their expired backend sessions cascade with the user.

## Verification

After deployment, use a signed-out private window:

1. Open a published game and press Play.
2. Confirm the stream starts without navigating to the login page.
3. Confirm Supabase Authentication shows a user with `is_anonymous = true` and no
   profile row was created.
4. Confirm the `/sessions` response identifies the user as anonymous and returns a
   signed, expiring ROM URL.
5. Confirm guest calls to `/favorites`, `/me/permissions`, and submission endpoints
   return `403`, while signing into a permanent account restores those features.
