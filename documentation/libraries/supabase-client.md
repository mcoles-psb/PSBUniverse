# Supabase Client Library

File: src/infrastructure/supabase/client.js

## Purpose

Creates and exports a shared Supabase client instance for browser-side use.

## Environment Variables

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY

## Usage

Import the singleton client from src/infrastructure/supabase/client.js in application pages or helper libraries.

## Notes

- The project currently performs direct table operations from client routes.
- Cache helpers wrap read operations for performance and consistency.
