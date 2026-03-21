# Scholar-Path: Supabase Backend + Interfaze Scraper

Add a Supabase database to persist scholarships, update the Interfaze scraper to write directly to the database, expose CRUD REST API routes, and wire the frontend to the new API instead of the static TypeScript file.

## User Review Required

> [!IMPORTANT]
> **Supabase project creation requires your browser.** You need to:
> 1. Go to [https://supabase.com](https://supabase.com) → **New project**
> 2. Pick a name (e.g. `scholarpath`), set a DB password, choose a region near you
> 3. After creation, go to **Project Settings → API**
> 4. Copy **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
> 5. Copy **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`  
> 6. Copy **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (used by the scraper script only)
> 7. Tell me when done — I'll run the SQL migration and add the keys to [.env](file:///c:/Users/thinh/EDUCATION/HCI/hackathon_scholarship_hunter/Scholar-Path-Hackathon-Lotus/.env)
> 
> **Or** paste the three keys to me and I'll add them to [.env](file:///c:/Users/thinh/EDUCATION/HCI/hackathon_scholarship_hunter/Scholar-Path-Hackathon-Lotus/.env) directly.

> [!IMPORTANT]
> **Interfaze API key needed.** Get your key from [https://interfaze.ai](https://interfaze.ai) and share it. I'll add `INTERFAZE_API_KEY=<key>` to [.env](file:///c:/Users/thinh/EDUCATION/HCI/hackathon_scholarship_hunter/Scholar-Path-Hackathon-Lotus/.env).

---

## Proposed Changes

### 1. Package installation

Install `@supabase/supabase-js`:
```
npm install @supabase/supabase-js
```

---

### 2. Database (Supabase SQL migration)

#### [NEW] supabase/migrations/001_scholarships.sql

Creates the `scholarships` table matching `lib/types.ts → Scholarship`:

```sql
create table if not exists scholarships (
  id           text primary key,
  name         text not null,
  country      text not null,
  flag         text not null default '',
  organization text not null,
  degree       text[] not null default '{}',
  funding      text not null check (funding in ('full','partial')),
  fields       text[] not null default '{}',
  deadline     text not null,
  description  text not null,
  requirements jsonb not null default '{}',
  link         text not null,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- Allow public reads; writes require the service role key
alter table scholarships enable row level security;
create policy "Public read" on scholarships for select using (true);
```

---

### 3. Supabase client

#### [NEW] lib/supabase.ts

Two thin helpers:
- `createBrowserClient()` — uses `NEXT_PUBLIC_` vars (safe for client components)
- `createServiceClient()` — uses `SUPABASE_SERVICE_ROLE_KEY` (server/scripts only)

---

### 4. CRUD API routes

#### [NEW] app/api/scholarships/route.ts
- `GET` – reads all rows from Supabase; supports `?region=`, `?degree=`, `?funding=`, `?query=` query params
- `POST` – inserts a new scholarship (expects full [Scholarship](file:///c:/Users/thinh/EDUCATION/HCI/hackathon_scholarship_hunter/Scholar-Path-Hackathon-Lotus/scripts/scholarshipDB.ts#38-52) JSON body)

#### [NEW] app/api/scholarships/[id]/route.ts
- `PUT` – updates a scholarship by [id](file:///c:/Users/thinh/EDUCATION/HCI/hackathon_scholarship_hunter/Scholar-Path-Hackathon-Lotus/scripts/scholarshipDB.ts#142-146)
- `DELETE` – deletes a scholarship by [id](file:///c:/Users/thinh/EDUCATION/HCI/hackathon_scholarship_hunter/Scholar-Path-Hackathon-Lotus/scripts/scholarshipDB.ts#142-146)

---

### 5. Scraper script update

#### [MODIFY] scripts/scholarshipDB.ts

- Replace the final [toTypeScriptFile()](file:///c:/Users/thinh/EDUCATION/HCI/hackathon_scholarship_hunter/Scholar-Path-Hackathon-Lotus/scripts/scholarshipDB.ts#464-506) write with a **Supabase upsert** using the service role client
- Keep the JSON snapshot write for auditing
- Require `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in addition to existing env vars
- Add new npm script: `"db:seed": "tsx scripts/scholarshipDB.ts"` (rename existing `db:init`)

---

### 6. Frontend update

#### [MODIFY] app/scholarships/page.tsx

Convert from a static import to a `useEffect` / `useState` fetch from `/api/scholarships`.  
Add loading and error states.

#### [NEW] app/admin/scholarships/page.tsx

Simple admin panel (no auth for the hackathon):
- Table listing all scholarships with **Edit** and **Delete** buttons
- **Add New** button → modal form pre-filled with empty [Scholarship](file:///c:/Users/thinh/EDUCATION/HCI/hackathon_scholarship_hunter/Scholar-Path-Hackathon-Lotus/scripts/scholarshipDB.ts#38-52) fields
- Calls `POST`, `PUT`, `DELETE` via `fetch`

#### [MODIFY] package.json

Rename `db:init` → `db:seed` (more descriptive) and nothing else changes.

---

## Verification Plan

### Automated (none currently exist in the repo)

No test files were found in the repository, so no automated tests will be added in this pass.

### Manual Verification

After setup and `npm run dev`:

1. **Scholarships page loads from DB**  
   Open `http://localhost:3000/scholarships` → scholarships should appear (sourced from API, not static file)

2. **CRUD via admin panel**  
   Open `http://localhost:3000/admin/scholarships` →  
   - Click **Add New**, fill in any scholarship, click Save → row appears in the table  
   - Click **Edit** on a row, change the name, Save → row updates  
   - Click **Delete** on a row → row disappears  
   - Verify in Supabase dashboard (Table Editor → scholarships) that changes persisted

3. **Scraper populates DB**  
   After setting `INTERFAZE_API_KEY`:  
   ```
   npm run db:seed
   ```  
   → Terminal should show `Wrote N scholarships to Supabase`  
   → Visit `http://localhost:3000/scholarships` and confirm new scraped entries appear
