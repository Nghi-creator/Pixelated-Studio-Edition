# UI Implementation Rules

1. Dropdown menus must open below the field.
   Do not rely on native `<select>` controls when the opened menu position matters. Use the shared custom select/dropdown pattern so the menu is anchored with `top-full`, stays visually attached to the field, and keeps the chevron inside the input area with enough right padding.

2. Size modals to the content, not the viewport.
   Increase modal width only as much as needed for the expected controls. If a button row needs to stay on one line, first compact the row and choose the smallest modal width that fits it instead of jumping to a near-full-width dialog. For compact utility modals, prefer explicit content-sized caps such as `max-w-[40rem]` over broad presets when the preset leaves obvious dead space.
