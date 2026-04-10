# Global Setup Application

Route: /setup/global

## Purpose

Manage shared setup/reference tables used across modules.

## Managed Tables

- core_s_statuses
- core_s_colors
- core_s_manufacturers

## Behavior

- Editable table rows with inline edit controls.
- Save strategy clears table and reinserts cleaned draft rows.
- Numeric fields are normalized to numbers.
- Dynamic save/error feedback uses global toasts.
- Page follows global compact-density UI defaults.

## Cache Integration

- Loads each setup dataset through cache-aware select helper.
- Invalidates table-specific cache key on save.
- Status updates also invalidate projects:list so gutter list status labels refresh immediately.
- Forces fresh refetch after save.

