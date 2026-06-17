# Pink Classic UI Refresh Plan

Date: 2026-06-17

## Phase Status

- Phase 1: Complete on 2026-06-17, then recalibrated after visual review. Token migration now targets a concrete black backdrop with dusty dark-pastel pink large surfaces, cleaner pastel pink accents, white text, and deeper pink selected states.
- Phase 2: Complete on 2026-06-17. Global shell, navbar, footer, and admin layout now use the flat black backdrop, filled dusty-pink states, and no decorative neon radial/glow treatments.
- Phase 3: Complete on 2026-06-17. Library hero, catalog cards, favorites empty state, multiplayer library cards, and library skeleton states now use flatter game-art-first presentation with no neon glow/text-shadow treatments.
- Phase 4: Complete on 2026-06-17. Engine setup, pairing panel, Local Vault, player stage, controls, lobby, and telemetry now use flat black/dusty-pink styling with no neon glow, gradient, or old hot-pink/orange chart treatments.
- Phase 5: Complete on 2026-06-17. Auth, reset password, publish, profile, and profile modals now use flat black fields, dusty-pink panels, quiet shadows, and no neon glow/ring/backdrop-blur treatments.
- Phase 6: Pending.

## Short Take

The pink direction is good, but I would avoid using the two pinks as loud UI accents everywhere. The current UI feels generic mostly because the whole system is built around a synth/neon vocabulary: dark purple/black surfaces, hot pink, orange secondary, radial glow backgrounds, text shadows, and glow shadows.

The reference image works best if we treat the two pinks as the actual UI material on a concrete black dark-mode backdrop:

- `#4A2835` Dusty dark-pastel pink: main panel/surface color so large elements read pink without shouting.
- `#5A3140` Deeper dusty pink: selected/pressed/elevated state.
- `#7E465B` Border pink: visible edges without a glow-like outline.
- `#B86F88` Cleaner pastel pink: primary controls and compact emphasis.
- `#FF8FAB` and `#FFC2D1`: reference pinks reserved for brighter small details, not broad filled surfaces.
- `#FFE5EC` Lavender Blush: tiny highlight only, never a broad page background.
- Keep the app backdrop near-black, similar in restraint to Supabase dark mode.
- Text should stay white on pink UI elements.
- Avoid the "pink outline on grey-black card" look; panels and important controls should be visibly pink.
- Avoid placing adjacent peer controls in dramatically different pink shades; use the deeper shade mainly for selected/pressed states.
- Treat pink intensity by element size: large blocks must be dim and dusty; small controls can be cleaner and lighter.

My recommendation: move Pixelated from "neon arcade dashboard" to "black studio console with filled pink interface pieces." Still retro, but cleaner, darker, sharper, and less generic.

## Palette Proposal

Use the two requested shades as the brand signal over a restrained black UI, with derived deeper pinks for filled surfaces and selected states.

```txt
brand.champagne     #FFC2D1
brand.lightPink     #FF8FAB
brand.blush         #FFE5EC
brand.roseInk       #3A1824
neutral.paper       #0B090A
neutral.canvas      #100B0E
neutral.surface     #4A2835
neutral.elevated    #5A3140
neutral.border      #7E465B
neutral.text        #FFF7FA
neutral.muted       #CFA4B2
status.success      #2F7D5B
status.warning      #9A6A20
status.danger       #B64242
console.black       #080708
```

The main mode should be dark, but without glow:

```txt
dark.bg             #050505
dark.surface        #4A2835
dark.elevated       #5A3140
dark.border         #7E465B
dark.text           #FFF7F9
dark.muted          #C9AEB8
```

## What To Remove

These patterns are making the UI feel vibe-coded:

- Global radial neon background in `apps/web/src/App.tsx`.
- `shadow-glow-primary`, `shadow-glow-primary-sm`, `shadow-glow-secondary` in `apps/web/tailwind.config.js`.
- Text shadows on hero, headings, desktop title, and active nav icons.
- Gradient brand text using pink to orange.
- Orange secondary as a main product accent.
- Pink glow on hover, favorites, cards, admin icons, and player chrome.
- Heavy translucent dark panels everywhere.

Replace glow with classic elevation: thin borders, quiet shadows, subtle inset dividers, and stronger spacing.

## System-Level Redesign

### 1. Tokens First

Update Tailwind `synth` tokens rather than rewriting every component manually.

Recommended mapping:

- `synth.bg`: concrete black.
- `synth.surface`: subdued filled pink.
- `synth.elevated`: deeper pink for selected/pressed states.
- `synth.border`: light pink edge.
- `synth.primary`: Light Pink.
- `synth.primary-hover`: Pink Champagne.
- `synth.secondary`: Pink Champagne for paired accent details.
- `synth.ink`: white text on pink buttons.

Add new shadows:

- `shadow-panel`: black elevation only, no pink bloom.
- `shadow-card`: black elevation only, no pink bloom.
- `shadow-pressed`: subtle black inset.

Then remove or alias glow shadows to non-glow shadows during migration.

### 2. Typography

`Outfit` is clean but can feel SaaS-generic. Consider pairing:

- Display / brand: `Fraunces`, `Libre Baskerville`, or `Cormorant Garamond`.
- UI/body: keep `Outfit` or switch to `Inter`.

Use the serif only for brand marks, hero titles, and major page titles. That makes the pink palette feel classic instead of baby-pastel.

### 3. Shape Language

Current rounded `xl`/`2xl` panels plus glows create a soft generic dashboard feel.

Recommended:

- Cards: 8px radius.
- Inputs/buttons: 8px radius.
- Modals: 10px radius.
- Game covers: 6px radius, like physical media cases.
- Use hairline borders and dividers instead of luminous outlines.

## Screen Audit

### Global Shell

Files:

- `apps/web/src/App.tsx`
- `apps/web/src/components/layout/Navbar.tsx`
- `apps/web/src/components/layout/Footer.tsx`

Issues:

- The background gradients make every route feel like the same neon shell.
- The nav logo uses a pink/orange gradient and feels closer to a template than a product identity.
- Active nav icons rely on glow/drop-shadow.

Suggestions:

- Replace the global radial background with a warm blush page background and a very subtle paper texture or noise image.
- Make the navbar opaque or lightly translucent ivory/pink, with a thin rose border.
- Use a wordmark treatment: `PIXELATED` in deep rose ink, small `Studio Edition` tag in Pink Champagne.
- Active nav state should be a small underline, inset pill, or filled icon background, not a glow.
- Use tooltips consistently for icon-only nav items.

### Landing / Library

Files:

- `apps/web/src/pages/user/Landing.tsx`
- `apps/web/src/components/user/HeroBanner.tsx`
- `apps/web/src/components/user/GameCard.tsx`

Issues:

- Hero image is darkened with synth gradients and pink text glow.
- "Trending Now" badge and carousel dots are neon-coded.
- Game cards hide too much under a dark overlay and use hover glow.
- `All Games` heading uses an orange border marker.

Suggestions:

- Make hero feel like a magazine spread: large game art, deep rose ink overlays, soft blush side panel or transparent text area.
- Keep the first viewport content as the game art, but use a less black overlay.
- Convert carousel controls to ivory circular buttons with rose borders.
- Change game cards into "case cards": cover art, title below the image on a clean surface, favorite button always discoverable on desktop and mobile.
- Add a small metadata row when available: plays, source, developer.
- Replace `All Games` orange rule with a Pink Champagne rule and a small count/search cluster.

### Player

Files:

- `apps/web/src/pages/user/Player.tsx`
- `apps/web/src/features/player/StreamStage.tsx`
- `apps/web/src/features/player/PlayerControls.tsx`
- `apps/web/src/features/player/LobbyPanel.tsx`
- `apps/web/src/features/player/StreamTelemetryPanel.tsx`
- `apps/web/src/features/player/comments/*`

Issues:

- The stream stage is correct functionally, but the supporting UI looks like separate dashboard widgets.
- Controls and telemetry use the same panel style as everything else.
- Keyboard hints are plain and could be more tactile.

Suggestions:

- Treat the player as a "console bay": black video area, blush control rail, physical-looking keycaps, and quiet status chips.
- Keep the video stage dark; not everything needs to become light.
- Make stream profiles a segmented control with clearer hierarchy.
- Give lobby, reactions, and comments a shared side-panel rhythm.
- Use Pink Champagne for selected states and Light Pink for hover only.
- Make telemetry more technical and compact, like an inspector drawer, not a floating neon card.

### Engine Connection

Files:

- `apps/web/src/pages/user/EngineConnection.tsx`
- `apps/web/src/features/local-engine/EnginePairingPanel.tsx`
- `apps/web/src/features/local-engine/LanPreflightChecks.tsx`

Issues:

- This page is clear, but visually generic: numbered cards, bordered panel, glowing accent.
- The pairing flow could feel more like a guided setup.

Suggestions:

- Turn the three steps into a horizontal setup timeline with completed/current/waiting states.
- Use a "connection receipt" style for the saved engine state.
- Use monospaced token fields inside a lighter technical inset.
- For LAN preflight, use checklist rows with icons and status color, not pink for every active state.

### Local Vault

File:

- `apps/web/src/pages/user/LocalVault.tsx`

Issues:

- Dropzone is functional but visually generic.
- Local ROM cards use a pink gradient placeholder and glowing gamepad icon.

Suggestions:

- Make the dropzone look like a physical import tray or cartridge slot.
- Use a soft dashed rose border, no glow.
- Local game cards should look like blank cartridge labels: cream/pink label, filename/title, source badge, small action row.
- Keep delete as a visible small icon button on hover/focus, with accessible focus state.

### Multiplayer

Files:

- `apps/web/src/pages/user/Multiplayer.tsx`
- `apps/web/src/features/multiplayer/MultiplayerGameCards.tsx`

Issues:

- Host/join mode buttons and cloud/local buttons are all similar, so the hierarchy is flat.
- Join flow is plain form UI.

Suggestions:

- Make Host vs Join a true two-tab control at the page top.
- Use Cloud/Local as smaller segmented controls inside Host.
- For Join, create a "ticket" layout: invite link field, detection result, join action.
- Game cards can share the landing case-card treatment.
- Use neutral status color for pairing, with pink only for chosen/active.

### Publish

File:

- `apps/web/src/pages/user/Publish.tsx`

Issues:

- The copy is useful but sits in a large generic panel.
- Upload fields all look like ordinary file inputs.

Suggestions:

- Make this feel like an application dossier: left column for program note, right/main column for fields.
- Use asset-preview slots for cover and banner instead of flat upload bars.
- ROM upload should look distinct from art uploads.
- Success state can become a stamped approval/received receipt, using Pink Champagne as the seal.

### Auth / Reset Password

Files:

- `apps/web/src/pages/user/Auth.tsx`
- `apps/web/src/pages/user/ResetPassword.tsx`

Issues:

- Centered auth card with icon and glow is the most template-like surface.

Suggestions:

- Use a split-but-not-marketing layout: form on one side, compact brand/console motif on the other.
- Replace the glowing gamepad with a simple line icon in a small blush medallion.
- OAuth buttons should be flatter and more native-feeling.
- Error/success messages should use status colors, not brand glow.

### Profile

File:

- `apps/web/src/pages/user/Profile.tsx`

Issues:

- Account settings are clear but generic stacked cards.
- Avatar hover glow repeats the neon language.

Suggestions:

- Use a settings layout with a left local nav: Public Profile, Security, Danger.
- Make avatar edit a small camera action over a clean circular avatar.
- Use compact forms with section dividers rather than large glowing cards.

### Favorites

File:

- `apps/web/src/pages/user/Favorites.tsx`

Suggestions:

- Share the same case-card component as Landing.
- Empty state could use a soft library shelf illustration or a simple saved-list motif.

### Admin

Files:

- `apps/web/src/components/layout/AdminLayout.tsx`
- `apps/web/src/pages/admin/Dashboard.tsx`
- `apps/web/src/pages/admin/UserManagement.tsx`
- `apps/web/src/pages/admin/AccessLogs.tsx`
- `apps/web/src/components/admin/ReportCard.tsx`

Issues:

- Admin inherits the neon look, but operational tools should be calmer.
- Glowing active sidebar and icon shadows reduce scan efficiency.

Suggestions:

- Give admin its own restrained variant: ivory/ink surfaces, dense tables, minimal pink.
- Sidebar active state should be a filled pale-pink row with a left bar.
- Replace report cards with denser review rows where possible.
- Keep danger actions red and moderation statuses semantic.
- Access logs should feel like a quiet table with sticky headers and row hover, not cards.

### Desktop Shell

File:

- `apps/desktop/index.html`

Issues:

- The desktop UI is even more neon-coded: dark shell, gradient background, text shadow title, glow primary button, terminal-style panels.
- It currently looks like a dev dashboard rather than a polished companion app.

Suggestions:

- Move desktop to a "studio control desk" aesthetic: soft dark or warm light panels, no neon glow.
- Use three clear zones: engine control strip, runtime/status, guest access.
- Replace traffic-light dots in logs with a restrained log header.
- Runtime logs can remain dark for legibility, but surrounded by blush/ink chrome.
- QR panel should feel like an invite card, not a dashed placeholder.
- Use Pink Champagne for the primary initialize action, Light Pink for hover, neutral ink text.

## Implementation Plan

### Phase 1: Design Tokens

- Update `apps/web/tailwind.config.js` with the new palette and non-glow shadows.
- Update `apps/web/src/index.css` selection colors and add optional paper/noise background utility.
- Replace `shadow-glow-*` definitions with non-luminous shadows so old classes degrade gracefully.
- Mirror the token changes in `apps/desktop/index.html`.

### Phase 2: Global Shell

- Rework `StandardLayout` background in `apps/web/src/App.tsx`.
- Redesign `Navbar` wordmark, active states, icon treatments, and sign-in button.
- Remove global radial neon background from admin layout.

### Phase 3: Library Experience

- Redesign `HeroBanner` first.
- Redesign `GameCard` and reuse that card language in Favorites and Multiplayer cloud cards.
- Replace orange section markers and glowing loading badges.

### Phase 4: Engine / Player / Local Tools

- Redesign Engine Connection and Pairing Panel.
- Redesign Local Vault dropzone and local game cards.
- Redesign Player controls, lobby panel, and telemetry around a console-bay model.

### Phase 5: Forms And Account Surfaces

- Redesign Auth, Reset Password, Profile, and Publish.
- Add preview states for Publish image uploads.
- Reduce large cards and use cleaner form sections.

### Phase 6: Admin And Desktop

- Give admin a calmer operational theme.
- Rework desktop `index.html` tokens and panel hierarchy.
- Desktop can remain dense, but should lose glow, gradient background, and hot accent shadows.

## Suggested First PR Scope

Keep the first implementation small enough to review:

1. Token migration in web and desktop.
2. Global layout background.
3. Navbar.
4. Hero banner.
5. Game cards.

That would remove most of the neon first impression without touching complex engine/player logic.

## Acceptance Checklist

- No hot neon glow remains in web or desktop.
- Pink Champagne and Light Pink are used intentionally, not everywhere.
- Text contrast passes on light and dark surfaces.
- Cards/buttons use quiet shadows instead of colored bloom.
- Landing, Player, Engine, Local Vault, Multiplayer, Auth, Profile, Publish, Admin, and Desktop all feel related.
- Status colors remain semantic: green for success, amber for warning, red for danger.
- Game art becomes more important than decorative gradients.
- Mobile layouts keep text inside buttons/cards without wrapping awkwardly.

## Open Design Choice

Pick one final direction before implementation:

- Light-first classic: blush/paper surfaces, deep rose ink, very soft shadows.
- Soft-dark classic: rose-black surfaces, blush accents, no glow.
- Hybrid: light library/account/admin pages, dark player/desktop runtime areas.

I recommend the hybrid. The game player and logs benefit from dark focus, while library, forms, admin, and setup flows will feel much more distinctive in the lighter champagne/pink system.
