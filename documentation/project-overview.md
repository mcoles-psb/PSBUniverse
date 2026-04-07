# Project Overview

PSBUniverse is a Next.js App Router application used to manage quote workflows for Premium Steel Building modules.

## Primary Goals

- Provide a centralized quoting workspace.
- Support setup/reference table management.
- Enable gutter project creation, editing, pricing preview, and work-order generation.
- Reduce repeated database calls using a reusable browser cache layer.

## UX Direction

- Dense, tool-first layout optimized for daily operations.
- Global typography and spacing standards:
	- Base text: 13px
	- Labels: 11px
	- Section headers: 14px
	- Page titles: 18px
	- Standard input height: 32px
- Global toast notifications are used for dynamic success/error/warning/info feedback.
- Premium navbar progress loader provides route/request/background loading feedback in protected pages.

## Current Module Status

- Home dashboard: active.
- Gutter module: active.
- Global setup module: active.
- Gutter setup module: active.
- Company profile module: active.
- OHD module: placeholder (coming soon).
- Travel module: placeholder (coming soon).

## Tech Stack

- Next.js 16 (App Router)
- React 19
- React-Bootstrap + Bootstrap 5
- Supabase JavaScript client (database access)
- ESLint 9

## Source Map

- App routes: src/app
- Core shared libraries: src/core
- Infrastructure clients: src/infrastructure
- Module services and logic: src/modules
- Shared UI utilities: src/shared
- Styling entrypoint: src/app/globals.css
- Styling system: src/styles/globals.css
- Root layout shell: src/app/layout.js
- Project docs: documentation
