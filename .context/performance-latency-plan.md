# Performance And Latency Plan

Updated: 2026-06-04

## Problem

The hosted Vercel web app feels slow across the homepage game catalog, admin branch pages, and avatar loading. Render cold start is mostly ruled out because Uptime Robot is keeping the API awake.

Current likely causes:

- Supabase queries lack indexes for the newer paginated/search/admin access patterns.
- Some API routes perform sequential auth/profile checks before the actual data query.
- Public catalog data is fetched from Supabase on every homepage request.
- Browser auth/session lookup happens before authenticated API calls.
- Avatars may be slow because image bytes come from external providers or Supabase Storage without frontend image loading optimization.

## Implementation Phases

### Phase 0: Reduce First-Load Request Storms

Status: implemented locally on 2026-06-04.

Goal: reduce latency on the first warm page load before backend caches have helped.

Implemented:

- Added shared client-side Supabase session coalescing through `getAuthSession()`.
- `apiRequest()` now reuses the shared session promise instead of starting a new `supabase.auth.getSession()` call for every authenticated request.
- Added a 30-second client permissions cache for `/me/permissions`.
- Added a 30-second client favorites-id cache so homepage `GameCard`/hero favorite checks collapse into one `/favorites` request instead of one request per card.
- Favorite mutations clear the favorites cache.
- Profile updates clear the permissions/profile cache.
- Converted the highest-impact startup paths to the shared session helper: Navbar, AdminLayout, admin pages, homepage favorite checks, Profile, Favorites, Local Vault, Multiplayer, player auth hook, WebRTC session boot, and access session tracking.

### Phase 1: Add Timing Visibility

Status: implemented locally on 2026-06-04.

Goal: stop guessing. Add lightweight API segment timing logs for hot routes and keep them safe for production logs.

Track:

- total request time from Fastify logs
- admin auth/profile check time
- Supabase query time for `/games`
- featured games query time
- admin users query time
- moderation queue query time
- access-log summary RPC time

Outcome:

- Render logs should reveal whether latency is auth, DB query, API processing, or browser/image loading.

Implemented timing log messages:

- `Games catalog timing`
- `Admin users timing`
- `Admin reports timing`
- `Admin access logs timing`
- `Access log write timing`

Important timing fields:

- `games_query_ms`
- `featured_games_query_ms`
- `admin_role_check_ms`
- `admin_users_query_ms`
- `admin_reports_query_ms`
- `access_log_summary_rpc_ms`
- `auth_user_lookup_ms`
- `access_log_lookup_ms`
- `access_log_upsert_ms`

### Phase 2: Add Database Indexes

Status: implemented locally on 2026-06-04.

Use Phase 1 timings to confirm exact hot queries. Likely migration candidates:

- `games(title)` for catalog ordering.
- `games(play_count DESC)` for featured games.
- trigram or lower-title index if title search is slow.
- `profiles(created_at DESC)` for admin user pagination.
- `profiles(username)` or trigram/lower username search index.
- `profiles(role)` for admin permission checks.
- `reported_comments(created_at DESC)` and status/filter indexes for moderation.
- `access_logs(session_id)` and `access_logs(last_seen_at DESC)` for session tracking.

Implemented migration:

- `supabase/migrations/20260604100000_performance_hot_path_indexes.sql`

Indexes added:

- `games_title_idx`
- `games_play_count_desc_idx`
- `profiles_role_idx`
- `profiles_created_at_desc_idx`
- `profiles_username_idx`
- `reported_comments_created_at_desc_idx`
- `reported_comments_comment_id_idx`
- `reported_comments_reporter_id_idx`
- `access_logs_user_id_idx`
- `access_logs_last_seen_at_desc_idx`

### Phase 3: Cache Safe Public Reads

Status: started locally on 2026-06-04.

Agreed caching order:

1. Use Vercel/browser cache headers first where safe.
2. Use backend in-memory TTL cache second for public catalog/featured reads.
3. Keep Postgres indexes as the baseline database-side fix before adding Redis.

Start simple with in-memory TTL cache in the API:

- Cache `/games?page&pageSize&search` for 30-120 seconds.
- Cache featured games separately for 60-300 seconds.
- Do not cache user-specific admin data yet.

Implemented:

- `GET /games` now uses a per-process in-memory TTL cache for the complete public catalog response by `page`, `pageSize`, and normalized `search`.
- TTL is 60 seconds.
- Responses include `Cache-Control: public, max-age=30, s-maxage=60`.
- Responses include `X-Pixelated-Cache: HIT` or `MISS` for browser/devtools and Render log debugging.
- User-specific/admin routes are not cached.

Later caching track:

- Add Cloudflare in front of the hosted web/API surface after the custom domain is ready.
- Add Redis only when the app needs shared cache across multiple backend instances, cache persistence across deploys, or heavier rate/session coordination than in-memory cache can safely provide.

### Phase 4: Cache Short-Lived Permission Checks

Status: started locally on 2026-06-04.

Add a tiny backend TTL cache for `user_id -> role` lookups:

- TTL: 30-60 seconds.
- Invalidate naturally by expiry.
- Keep super-admin/user permission routes authoritative enough for current scale.

Implemented:

- Added a shared backend role cache with a 45-second TTL.
- Admin page-load routes use the cached role lookup:
  - `GET /admin/users`
  - `GET /admin/reports`
  - `GET /admin/access-logs`
- Render timing logs include `roleCache: hit | miss` on these routes.
- Admin user role updates clear the cached role for the actor and target user.

### Phase 5: Avatar Loading Optimization

Status: implemented locally on 2026-06-04.

Improve perceived speed:

- Render placeholders immediately.
- Lazy-load non-critical avatars.
- Ensure uploaded avatars use reasonably small images.
- Consider an avatar proxy/cache later only if image timing proves it is the bottleneck.

Implemented:

- Added a local reusable `Avatar` component with initials fallback, fixed dimensions, async image decoding, lazy loading by default, and broken-image fallback.
- Removed remote `ui-avatars.com` generated fallback URLs from Navbar, Profile, Admin User Management, and game comments.
- Real avatar URLs still load when present, but missing/slow/broken avatars no longer block visible UI or trigger an extra external generated-avatar request.

### Phase 6: Skeleton Loading States

Status: implemented locally on 2026-06-04.

Goal: replace plain loading text and full-page spinners with shape-matching placeholders where the app is waiting on data.

Implemented:

- Added shared skeleton primitives for text, game grids, hero banners, admin tables, profile panels, and stream panels.
- Replaced homepage initial spinner with hero and game-grid skeletons.
- Replaced admin branch loading text with table-shaped skeleton panels.
- Replaced profile and favorites full-page spinners with form/grid skeletons.
- Replaced multiplayer game-list loading text with compact card skeletons.
- Replaced WebRTC connecting spinner overlay with a stream-shaped skeleton.
- Kept small button/upload/action spinners where they communicate an in-progress command rather than page/data loading.

## Current Step

Phase 1 timing visibility and Phase 2 hot-path indexes are implemented locally. Next caching work should follow the agreed Phase 3 order: cache headers first where useful, then backend in-memory TTL cache for public catalog and featured games.
