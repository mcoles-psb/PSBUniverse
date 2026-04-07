# Pricing Engine Library

File: src/modules/gutter/services/gutter.service.js

## Purpose

Centralized quote calculations for gutter pricing and financial rollups.

## Primary Exports

- `calculateQuote(project, setup)`
- `calculateGutterPreview(rows)`
- `computeGutterQty(sides, length)`
- `computeDownspoutFootage(height, downspoutQty)`
- `deriveEndCapsFromSections(sections)`

## Core Calculation Areas

- Gutter quantity per section
- Downspout footage per section
- End-cap grouping totals
- Manufacturer, trip, leaf-guard rate resolution
- Discount application
- Deposit and balance calculations

## Core Formula Set

- Gutter quantity per section:
  - `gutterQty = clamp(sides, 1, 10) + length + 1`
- Downspout footage per section:
  - `downspoutFt = (height + 1.25) * clamp(downspoutQty, 1, 10)`
- End-cap totals from paired sections:
  - `group = side1 + side2`, then `side3 + side4`, etc.
  - `totalEndCaps = 2 * sum(group values)`
- Financial summary:
  - `discountAmount = subtotal * discountRate`
  - `projectTotal = subtotal - discountAmount`
  - `depositAmount = projectTotal * depositRate`
  - `remainingBalance = projectTotal - depositAmount`

## Important Rules

- Dynamic section bounds are enforced in calculations.
- Manual override toggles control whether manual or setup values are used.
- Legacy custom override fields are still supported for compatibility:
  - cstm_manufacturer_rate
  - cstm_trip_rate
  - cstm_leaf_guard_price
  - cstm_discount_percentage
- Discount/deposit normalization accepts whole percent or rate:
  - `15` and `0.15` both normalize to `15%`.
- Deposit uses deposit_percent and is normalized to a `0..1` rate.

## Financial Outputs

The pricing payload includes:

- subtotal
- discountAmount
- projectTotal
- depositAmount
- remainingBalance
- balanceDue
- savingsAmount

## Why It Matters

All UI previews rely on this single source of truth, which avoids duplicated or diverging quote math across pages.
