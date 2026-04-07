# Architecture

## Rendering Model

The application is organized with Next.js App Router routes under src/app. Route pages are written as client components because they rely on local state, form interactions, and browser cache APIs.

## UI Composition

- Style entrypoint is src/app/globals.css, which imports src/styles/globals.css.
- Global compact-density behavior is controlled by `dense-workspace` on src/app/layout.js.
- Components use React-Bootstrap primitives.
- Navigation is route-driven through Link and useRouter.

## Notification Layer

- Global toast host is mounted in src/app/layout.js.
- Toast events are dispatched through src/shared/utils/toast.js.
- Dynamic operation feedback should use global toast helpers instead of inline request-alert banners.

## Loading Feedback Layer

- A thin progress loader is attached to the bottom edge of the protected header.
- Loader orchestration lives in src/shared/components/layout/AppLayout.js and visual output lives in src/shared/components/layout/Header.js.
- Programmatic loader events are available in src/shared/utils/navbar-loader.js.
- The progress bar uses transform: scaleX(...) with transform-origin: left for smoother animation.

Behavior model:

- Start: immediate jump to about 25%.
- In-flight: easing progression toward about 90%.
- Complete: quick push to 100%, smooth fade-out, then reset to 0.
- Fast requests use a short show-delay to prevent flicker.

Trigger sources:

- Route transitions (link navigation and browser history navigation).
- Same-origin API calls under /api/* (global fetch interception).
- Programmatic navigation or non-fetch async tasks via startNavbarLoader()/finishNavbarLoader().

## Data Access Layer

- Supabase client is initialized in src/infrastructure/supabase/client.js.
- Feature routes execute Supabase queries directly or through cache-aware wrappers.

## Shared Library Layer

- src/modules/gutter/services/gutter.service.js centralizes gutter quote math.
- src/core/cache/adapters/browser-cache.adapter.js provides generic browser cache primitives.
- src/core/cache/adapters/supabase-cache.adapter.js adds Supabase query wrappers backed by cache.
- src/modules/user-master/access/user-master.access.js centralizes user CRUD and role-to-app access resolution.

## Access Control Layer

- User identity records are managed in psb_s_user.
- Role/application mappings are resolved from psb_m_userappproleaccess.
- Effective access is derived in backend code from (user_id, role_id, app_id).
- The devmain role bypasses standard checks and receives full CRUD access.

## Cache Namespace Strategy

The project currently uses namespace psb-universe with dynamic keys such as:

- setup:statuses
- setup:manufacturers
- projects:list
- projects:detail:<id>
- company:profile

## Mutation Consistency Pattern

On create/update/delete flows:

1. Execute database mutation.
2. Invalidate affected cache keys.
3. Refresh UI state either with local in-place upsert (preferred for smooth UX) or forceFresh refetch when necessary.
