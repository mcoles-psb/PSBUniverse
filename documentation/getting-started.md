# Getting Started

## Prerequisites

- Node.js 18+
- npm
- Supabase project with required tables and permissions

## Install Dependencies

```bash
npm install
```

## Environment Variables

Create a .env.local file in the project root with:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Run Locally

```bash
npm run dev
```

Open http://localhost:3000.

## Lint

```bash
npm run lint
```

## Build

```bash
npm run build
npm run start
```

---

## Add A New App (Module)

This section explains how to add a new app in PSBUniverse in a clean way.

Use this when you want to add things like:

- inventory
- billing
- scheduling

The steps below are written for junior developers and use simple language.

### 1. Simple Explanation

#### What is an app/module?

- A module is one app feature inside the system.
- Example: gutter is one module. Travel is another module.
- Each module should have its own files and logic.

#### Why we use this structure

- It keeps code organized.
- It is easier to debug.
- It is easier to add new apps later.
- Teams can work on one module without breaking others.

#### Important rule

- Adding a new app should NOT require changing other apps.

### 2. Step-by-Step Guide

#### Step 1 - Create the module folder

Go to:

```text
src/modules/
```

Create your new module folder, for example:

```text
src/modules/inventory/
```

#### Step 2 - Create the standard subfolders

Inside your module, create these folders:

```text
src/modules/inventory/
	components/
	services/
	hooks/
	validators/
```

What each folder is for:

- components/: screen parts and UI pieces for this module.
- services/: the main module logic (data loading, calculations, database calls).
- hooks/: reusable React hooks for this module.
- validators/: input checks and simple validation rules.

#### Step 3 - Add routing (important)

Go to:

```text
src/app/(protected)/
```

Create a folder with the same app name:

```text
src/app/(protected)/inventory/
```

Add page.js:

```javascript
import InventoryPage from "@/modules/inventory/components/inventory.page";

export default function InventoryRoutePage() {
	return <InventoryPage />;
}
```

Why this matters:

- This connects your module to the UI route.
- Routing files must stay thin.
- Do not put business logic inside src/app.

#### Step 4 - Connect to services

Put your logic in:

```text
src/modules/inventory/services/
```

Simple example:

```javascript
// src/modules/inventory/services/inventory.service.js
import { supabase } from "@/infrastructure/supabase/client";

export async function listInventoryItems() {
	const { data, error } = await supabase
		.from("inventory_items")
		.select("*")
		.order("id", { ascending: true });

	if (error) throw error;
	return data || [];
}
```

Use this service from your module component, not from the route file.

#### Step 5 - Use shared systems

Use these shared folders instead of making duplicates:

- Auth: src/core/auth
- Cache: src/core/cache
- Supabase: src/infrastructure/supabase
- UI components: src/shared/components

#### Step 6 - Follow naming rules

Use these names so files are easy to understand:

- *.service.js -> module logic
- use*.js -> custom hooks
- *.validator.js -> validation rules

Examples:

- inventory.service.js
- useInventory.js
- inventory.validator.js

### 3. DOs and DON'Ts

#### DO

- Keep logic inside your module.
- Use shared systems from core/, infrastructure/, and shared/.
- Follow naming conventions.

#### DON'T

- Put business logic inside src/app.
- Create duplicate utilities that already exist.
- Access the database directly from UI route files.

### 4. Example Module Structure

```text
src/modules/inventory/
	components/
	services/
		inventory.service.js
	hooks/
	validators/
```

### 5. References

Use these folders as examples:

- Example module: src/modules/gutter
- User/access module: src/modules/user-master
- Shared components: src/shared/components
- Core shared systems: src/core
- External service clients: src/infrastructure/supabase
- Route wrappers: src/app/(protected)

### 6. Copy/Paste Starter Template

Use this as a quick starting point.

#### Folder Template

```text
src/modules/<app-name>/
	components/
		<app-name>.page.js
	services/
		<app-name>.service.js
	hooks/
		use<AppName>.js
	validators/
		<app-name>.validator.js

src/app/(protected)/<app-name>/
	page.js
```

#### Route File Template (thin only)

```javascript
import AppPage from "@/modules/<app-name>/components/<app-name>.page";

export default function AppRoutePage() {
	return <AppPage />;
}
```

#### Page Component Template

```javascript
"use client";

import { useEffect, useState } from "react";
import { load<AppName>Items } from "@/modules/<app-name>/services/<app-name>.service";

export default function AppPage() {
	const [items, setItems] = useState([]);

	useEffect(() => {
		async function load() {
			const data = await load<AppName>Items();
			setItems(data);
		}
		load();
	}, []);

	return (
		<main>
			<h2><AppName></h2>
			<p>Total items: {items.length}</p>
		</main>
	);
}
```

#### Service Template

```javascript
import { supabase } from "@/infrastructure/supabase/client";

export async function load<AppName>Items() {
	const { data, error } = await supabase
		.from("<table_name>")
		.select("*")
		.order("id", { ascending: true });

	if (error) throw error;
	return data || [];
}
```

Tip:

- Replace <app-name>, <AppName>, and <table_name> first.
- Keep all logic in module files, not in src/app route files.

