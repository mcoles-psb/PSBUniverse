# Gutter Application

Routes:

- /gutter
- /gutter/new
- /gutter/[id]
- /gutter/[id]/work-order

## Purpose

Manage gutter quote projects from listing through pricing and work-order preview.

## Current UX Behavior

- Uses compact-density layout to maximize visible information on screen.
- New and edit flows share the same form architecture for consistency.
- Dynamic feedback is shown via global toasts (no inline request banners).
- Quote preview uses document-style separators and condensed pricing rows.
- Material details are displayed as per-section cards (not a table).

## /gutter (Project List)

- Loads project list and status setup values.
- Displays persisted `total_project_price` from `gtr_t_projects` for each row.
- Supports status updates and project deletion.
- Save/update/delete feedback uses global toasts.
- Uses cache keys:
  - projects:list
  - setup:statuses
- Invalidates project cache keys after update/delete and forces fresh reload.

## /gutter/new (Create)

- Loads setup reference tables (status, colors, manufacturers, leaf guard, trip rates, discounts).
- Captures dynamic section rows with min/max constraints.
- Captures optional extras, discount, leaf guard, and manual override values.
- Deposit persistence is toggle-aware: `deposit_percent` is set to null when deposit is not included.
- Persists:
  - header to gtr_t_projects
  - sections to gtr_m_project_sides
  - extras to gtr_m_project_extras
- Writes `deposit_percent` and `total_project_price` on header.
- Invalidates project-related cache keys after save.

## /gutter/[id] (Edit)

- Loads header + section + extras rows by project id.
- Maps custom override columns to edit UI state.
- Supports full header/child rewrite on save.
- Writes `deposit_percent` and recalculated `total_project_price` on update.
- Invalidates and refetches cached project data after save.
- Uses same compact form and preview structure as create flow.

## /gutter/[id]/work-order

- Reads project and section data for printable install context.
- Work-order notes are currently not persisted because no dedicated storage table/columns are implemented.

## Pricing Integration

Both new and edit pages call the gutter pricing service in `src/modules/gutter/services/gutter.service.js` for live quote preview.

Key outputs shown in preview include:

- Subtotal
- Discount amount
- Project total
- Deposit amount (from deposit_percent)
- Remaining balance

## How Gutter Calculation Works

Core formulas used by the quote engine:

- Per-section gutter quantity:
  - `gutterQty = clamp(sides, 1, 10) + length + 1`
- Per-section downspout footage:
  - `downspoutFt = (height + 1.25) * clamp(downspoutQty, 1, 10)`
- End-cap grouping:
  - Pair sections as `(1+2), (3+4), (5+6), ...`
  - `groupValue = sideA + sideB`
  - `totalEndCaps = 2 * sum(all groupValue)`

Financial rollup:

- `materialCost = totalGutter * manufacturerRate`
- `downspoutCost = totalDownspouts * downspoutUnitPrice` (or piece-based when pipe length is set)
- `subtotal = materialCost + downspoutCost + hangerCost + leafGuardCost + tripFee + endCapCost + extras`
- `discountAmount = subtotal * discountRate`
- `projectTotal = subtotal - discountAmount`
- `depositAmount = projectTotal * depositRate`
- `remainingBalance = projectTotal - depositAmount`

## Manual Override Rules

- If manual toggle is ON and a manual value is entered, manual value is used.
- If manual toggle is OFF, setup value from the selected combobox is used.
- Discount and deposit accept either whole percent or rate format:
  - `8` and `0.08` both resolve to `8%`.

## Key UI File

- src/modules/gutter/components/gutter-project-form.js
