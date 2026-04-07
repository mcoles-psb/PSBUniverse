# Gutter Setup Application

Route: /setup/gutter

## Purpose

Manage gutter-specific setup reference values.

## Managed Tables

- gtr_s_leaf_guards
- gtr_s_discounts
- gtr_s_trip_rates

## Behavior

- Editable setup table UI with add, edit, remove, save, and cancel.
- Save strategy clears and reinserts cleaned rows.
- Dynamic save/error feedback uses global toasts.
- Page follows global compact-density UI defaults.

## Cache Integration

- Uses cached reads for all managed setup tables.
- Invalidates table cache key on save.
- Forces fresh refetch after save.
