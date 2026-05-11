# Learning Next.js Through This Project

A hands-on curriculum for a CS student with DS&A and T-SQL background who wants to *actually understand* the Next.js side of ScholarPath — not just memorize answers. Every concept is tied to a real file in this repo, and every module ends with small exercises you can run locally.

**Prerequisites you already have:** loops, data structures, SQL, HTTP basics.
**What you'll pick up:** how a modern React + Next.js app is built, end to end.

Suggested pace: one module per sitting. Read, poke at the referenced files, do the exercise, move on.

---

## Module 0 — The 30-second mental model

| You already know | The web analog |
|---|---|
| A C# program compiled into a `.exe` that runs on a server | A Node.js process running JavaScript on a server |
| Razor pages (`.cshtml`) that return HTML | React components (`.tsx`) that return HTML-like markup called JSX |
| Web API controllers that return JSON | Next.js route handlers (`route.ts`) that return JSON |
| Stored procedures / views | SQL migrations + Supabase client methods |
| A build step that produces one deployable artifact | `npm run build` produces an optimized `.next/` bundle |
| Static types (C# / T-SQL column types) | TypeScript types on every variable, function, prop |

Hold onto that table. Everything below is flesh on those bones.

---

## Module 1 — JavaScript, TypeScript, and the toolchain

Before React or Next.js, you need to be comfortable with the language and the tools that run it.

### 1.1 Node.js, npm, and `package.json`

- **Node.js** is the runtime. It's a C++ program that embeds Google's V8 JavaScript engine so JS can run outside a browser.
- **npm** is the package manager (like NuGet in .NET). It reads `package.json`, downloads dependencies into `node_modules/`, and runs scripts you define.
- **`package.json`** (repo root) has two important sections:
  - `"dependencies"` — packages needed at runtime (`next`, `react`, `openai`, `@supabase/supabase-js`, etc.).
  - `"scripts"` — shortcut commands. `"dev": "next dev"` means `npm run dev` executes `next dev`.
- **`node_modules/`** — where npm dumps the downloaded packages. Huge, never committed to git. Produced by `npm install`.

**Try it:** open `package.json`. For each dependency, guess what it's for. Then check by looking for its imports via `grep` in the repo.

### 1.2 ES Modules (import / export)

Modern JavaScript uses `import`/`export` to share code between files. This repo uses it everywhere:

```ts
// lib/openai.ts
export function getOpenAIClient(): OpenAI { … }

// app/api/chat/route.ts
import { getOpenAIClient } from "@/lib/openai";
```

The `@/` prefix is a TypeScript path alias configured in `tsconfig.json`:

```json
"paths": { "@/*": ["./*"] }
```

It saves you from writing `../../../lib/openai` from deeply nested files. `@/lib/openai` always resolves from the project root.

### 1.3 TypeScript in one page

TypeScript = JavaScript + static types. Types are erased at build time; they only help you at development time.

```ts
// A basic typed function
function add(a: number, b: number): number {
  return a + b;
}

// An object type (like a C# record or a SQL row shape)
type Scholarship = {
  id: string;
  name: string;
  country: string;
  deadline: string;
};

// An array of those
const results: Scholarship[] = [];

// A union (value is one of these)
type Funding = "full" | "partial";

// A generic (reusable over any T)
function first<T>(items: T[]): T | undefined {
  return items[0];
}

// Async function — returns a Promise<T>
async function loadNames(): Promise<string[]> {
  const response = await fetch("/api/scholarships");
  const data = (await response.json()) as Scholarship[];
  return data.map((s) => s.name);
}
```

**Every type in this repo's domain lives in [`lib/types.ts`](./lib/types.ts).** Open it; you will recognize most of it from SQL column definitions.

**Try it:** add a new field `featured: boolean` to the `Scholarship` type. Watch the TypeScript compiler (in your editor or via `npx tsc --noEmit`) light up every place that needs to handle it. This is the *point* of TypeScript: it tells you what else you broke.

---

## Module 2 — React fundamentals

Next.js is a framework *on top of* React. You can't learn Next.js without React.

### 2.1 Components are just functions

A React component is a function whose name starts with a capital letter and that returns JSX (HTML-like markup). Example from this repo, [`components/ui/Button.tsx`](./components/ui/Button.tsx):

```tsx
export function Button({ variant = "primary", children, ...props }: ButtonProps) {
  return (
    <button className={cn(…)} {...props}>
      {children}
    </button>
  );
}
```

Using it:

```tsx
<Button variant="outline">Click me</Button>
```

That's it. A component *is* a function. You call it by writing `<Button />` in JSX.

### 2.2 JSX is sugar over function calls

```tsx
<div className="box">Hello</div>
// compiles to:
React.createElement("div", { className: "box" }, "Hello")
```

Key oddities coming from HTML:
- `class` → `className` (because `class` is reserved in JavaScript).
- `onclick` → `onClick` (camelCase).
- Curly braces `{ … }` let you embed JavaScript expressions: `<p>{user.name}</p>`, `<p>{1 + 2}</p>`.
- Components must return a single root element (wrap siblings in `<>…</>` — a "fragment").

### 2.3 Props = function arguments

`Button` takes `{ variant, children, …props }` as its argument. That argument is called "props" in React culture.

TypeScript lets you define the prop shape as a type (`ButtonProps` in the example). This is your component's public API — like a method signature.

### 2.4 State with `useState`

"State" is data that belongs to a component and, when it changes, triggers a re-render. From [`app/scholarships/page.tsx`](./app/scholarships/page.tsx):

```tsx
const [query, setQuery] = useState("");
const [scholarships, setScholarships] = useState<Scholarship[]>([]);
const [isLoading, setIsLoading] = useState(true);
```

Pattern: `const [value, setValue] = useState(initial)`. Call `setValue(newValue)` and React re-renders the component. The angle brackets (`<Scholarship[]>`) are a TypeScript generic telling `useState` what type the value is.

### 2.5 Side effects with `useEffect`

`useEffect` runs code *after* the component renders. Used for things that shouldn't happen during render — fetching data, subscribing to events, timers. From the same file:

```tsx
useEffect(() => {
  const timer = window.setTimeout(() => {
    setDebouncedQuery(query.trim());
  }, 250);

  return () => window.clearTimeout(timer);  // cleanup
}, [query]);  // re-run when `query` changes
```

Three parts:
1. **Effect function** — runs after render.
2. **Cleanup function** (the `return`) — runs before the next effect or when the component unmounts.
3. **Dependency array** — `useEffect` re-runs only when these values change. `[]` means "run once on mount." No array means "run on every render" (usually a bug).

The example above is a *debounce* — a classic algorithm for "do this thing 250 ms after the user stops typing." Each keystroke cancels the previous timer.

### 2.6 Hooks rules

`useState`, `useEffect`, `useMemo`, `useRef` are all "hooks." Two rules:
- Only call them at the top level of a component (not inside `if`, loops, or nested functions).
- Only call them from React components (or other hooks).

Enforced by an ESLint plugin in this repo; if you break the rules you'll see a red squiggle.

### 2.7 Rendering lists

```tsx
{scholarships.map((s) => (
  <ScholarshipCard key={s.id} scholarship={s} />
))}
```

The `key` prop must be unique per item in a list. React uses it to match items across re-renders. Never use array index as a key if the list can reorder.

**Exercise:** create a new component `components/ui/Badge.tsx` that takes a `label: string` and `tone: "blue" | "red"` prop and renders a colored `<span>`. Use it somewhere — e.g. next to a scholarship's name in `ScholarshipCard.tsx`.

---

## Module 3 — The Next.js App Router

Now the specifically-Next.js part.

### 3.1 File-based routing

In Next.js 14's App Router (the `app/` directory):
- **Folders = URL segments.** `app/counselor/` is `/counselor`.
- **`page.tsx` = an HTML page at that URL.**
- **`route.ts` = an HTTP API endpoint at that URL.**
- **`layout.tsx` = a wrapper applied to every page beneath it.**
- **`[id]` folder = dynamic segment** (like `:id` in Express).
- **Parallel `(group)` folders** (not used here) group routes without affecting the URL.

Contrast with what you might expect (e.g. from Express): there is no central router file. Next.js walks the `app/` directory at build time and derives the router from the folder structure.

**Try it:** create `app/hello/page.tsx` with a single line: `export default function Hello() { return <h1>Hello</h1>; }`. Visit `http://localhost:3000/hello`. Done — you made a route.

### 3.2 Layouts

[`app/layout.tsx`](./app/layout.tsx) wraps every page:

```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" …>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
```

`{children}` is the current page. This is where the sidebar/topbar gets attached.

You can add nested layouts — e.g. `app/admin/layout.tsx` could wrap all admin pages with an admin sidebar. (This repo does it via the `AdminSidebar` component in `AppShell` instead.)

### 3.3 Route handlers (`route.ts`)

`route.ts` files export named functions that match HTTP methods. From [`app/api/scholarships/route.ts`](./app/api/scholarships/route.ts):

```ts
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country");
  // … query Supabase …
  return NextResponse.json(scholarships);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  // … insert into Supabase …
  return NextResponse.json(result, { status: 201 });
}
```

This is the backend. One file, two HTTP methods. Think "controller with two actions."

Dynamic segments: [`app/api/scholarships/[id]/route.ts`](./app/api/scholarships/%5Bid%5D/route.ts) receives `{ params: { id: string } }` as the second argument to its handlers.

**Exercise:** add a `DELETE /api/hello/[name]` handler that returns `{ goodbye: name }`. Call it with `curl -X DELETE http://localhost:3000/api/hello/thinh` and confirm the JSON response.

### 3.4 Server components vs client components

This is the single biggest conceptual shift Next.js 14 introduces. By default every component in `app/` is a **Server Component**:
- Runs on the server during the request.
- Can be `async` — `await` a database query directly in the component.
- Its code is **never shipped to the browser**.
- Cannot use `useState`, `useEffect`, `onClick`, etc. (there's no browser to run them in).

If a file starts with `"use client";` it becomes a **Client Component**:
- Its code is bundled and shipped to the browser.
- Can use hooks and event handlers.
- Renders the first time on the server (hydration), then takes over in the browser.

In this repo, search for `"use client"` to see exactly which files are interactive:
- `app/scholarships/page.tsx` — needs state for filters, `useEffect` for fetch.
- `components/chat/ChatWindow.tsx`, `components/chat/ChatInput.tsx` — input state, streaming.
- `components/evaluator/EvaluatorClient.tsx` — form state.
- `components/layout/Sidebar.tsx` — uses `usePathname` hook.
- `components/ui/Select.tsx` — stateful dropdown.

**Everything else is a server component.** That's why most of `app/*/page.tsx` files are simple — they render a `<ClientThing />` that holds the interactive bits.

The right mental model: **"use client" is a boundary, not a file-level setting.** Once a file opts in, every component it imports can also be client. You push the boundary as deep into the tree as possible to minimize the JS shipped.

### 3.5 Data fetching patterns

Two patterns coexist in this repo:

**Pattern A — fetch from a client component.** Used in `app/scholarships/page.tsx`:

```tsx
"use client";
export default function ScholarshipsPage() {
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  useEffect(() => {
    fetch("/api/scholarships").then(r => r.json()).then(setScholarships);
  }, []);
  // …
}
```

Browser calls your own API. Familiar, SPA-like.

**Pattern B — fetch in a server component (not currently used here but worth knowing).** You could rewrite the same page as:

```tsx
// Note: no "use client"
export default async function ScholarshipsPage() {
  const db = createBrowserClient();
  const { data } = await db.from("scholarships").select("*");
  return <ScholarshipGrid scholarships={data} />;
}
```

No `useState`, no `useEffect`, no `/api/scholarships` hop. The DB call runs on the server during the HTML render. Faster first paint, less JS shipped, but you lose client-side filtering without extra work.

**Interview-worthy insight:** when you see an endpoint like `/api/scholarships` being called by the app's own frontend, ask whether it *has* to exist. Sometimes it's there to serve external consumers; sometimes it's accidental complexity that could be a direct DB query in a server component.

### 3.6 Streaming responses

Open [`app/api/chat/route.ts`](./app/api/chat/route.ts) and [`components/chat/ChatWindow.tsx`](./components/chat/ChatWindow.tsx). The chat endpoint returns a `ReadableStream`:

```ts
return new Response(readable, {
  headers: { "Content-Type": "text/plain; charset=utf-8" },
});
```

The client reads it incrementally:

```tsx
const reader = response.body!.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  assistantText += decoder.decode(value, { stream: true });
  setMessages([...nextMessages, { role: "assistant", content: assistantText }]);
}
```

This is the same Web Streams API the browser uses for `fetch`. You now know how "ChatGPT-style typing animation" is implemented.

### 3.7 Environment variables

Next.js loads `.env` / `.env.local` at build/dev time. Rules:
- Variables without a prefix (`OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) are **server-only**. Accessing them in a client component returns `undefined`.
- Variables prefixed with `NEXT_PUBLIC_` (`NEXT_PUBLIC_SUPABASE_URL`) are **inlined into the browser bundle** at build time. Safe for non-secret values only.

Never put a secret behind `NEXT_PUBLIC_`. It will end up in view-source.

---

## Module 4 — TypeScript patterns that show up constantly

### 4.1 Typed props with a `type` or `interface`

```tsx
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  children: ReactNode;
};
```

`ButtonHTMLAttributes<HTMLButtonElement>` is a type from React that includes every standard `<button>` attribute (`onClick`, `disabled`, `type`, etc.). The `& { … }` adds our custom props on top. This is TypeScript's **intersection type** — "a value that satisfies both."

### 4.2 Optional properties and default values

```tsx
function Button({ variant = "primary", size = "md", isLoading = false, … }: ButtonProps) { … }
```

`variant?: "primary" | …` in the type means it's optional. The `= "primary"` in the function signature gives it a default when the caller omits it.

### 4.3 Discriminated unions

React's `Message` type in `lib/types.ts`:

```ts
type Message = {
  role: "user" | "assistant";
  content: string;
  isRoadmap?: boolean;
};
```

You can filter by role and TypeScript narrows the type:

```ts
messages.filter((m): m is Message => m.role === "assistant")
```

### 4.4 Type assertions and narrowing

```ts
const payload = (await response.json()) as Scholarship[] | { error?: string };
if (!Array.isArray(payload)) {
  // TS now knows payload is { error?: string }
  throw new Error(payload.error ?? "unknown");
}
// Here payload is Scholarship[]
```

`as` is an assertion (you are telling TS "trust me"). Narrowing via `Array.isArray`, `typeof`, or `in` checks is *verified* by TS. Prefer narrowing over `as`.

### 4.5 `const` assertions for schemas

```ts
const CHAT_RESPONSE_SCHEMA = {
  type: "object",
  properties: { phase: { type: "string", enum: ["ask_more", "guide", "recommend"] } },
  // …
} as const;
```

`as const` freezes the literal types so `"ask_more"` stays `"ask_more"` (not widened to `string`). Required by OpenAI's strict-schema API to type-check enum values correctly.

---

## Module 5 — Styling with Tailwind

Tailwind lets you style by composing utility classes inline. From `components/ui/Button.tsx`:

```tsx
className="inline-flex items-center justify-center gap-2 font-semibold transition-colors disabled:cursor-not-allowed"
```

Each class is one CSS rule. Mental mapping:
- `px-4` → `padding-left: 1rem; padding-right: 1rem`
- `text-sm` → `font-size: 0.875rem`
- `rounded-xl` → `border-radius: 0.75rem`
- `bg-brand-500` → custom brand color defined in `tailwind.config.ts`
- `hover:bg-brand-600` → applies on hover
- `md:px-10` → applies at the `md` breakpoint (768px+)
- `disabled:cursor-not-allowed` → applies when the element is `disabled`

Why inline? You never have to invent CSS class names, and you never leave dead CSS rules behind when you delete a component. The trade-off is that your JSX gets long.

`tailwind.config.ts` defines custom colors (`brand-*`, `warm-*`), fonts, and plugins. `app/globals.css` has three Tailwind directives and a handful of base styles — that's the whole stylesheet.

Utility: `cn()` in `lib/utils.ts` merges class strings and handles conditional classes cleanly.

---

## Module 6 — Practical patterns in this codebase worth copying

### 6.1 The "thin page + fat client component" split

`app/evaluator/page.tsx` is ~5 lines; it renders `<EvaluatorClient />`. All the state, form handling, and fetching lives in `components/evaluator/EvaluatorClient.tsx`. This keeps the `"use client"` boundary explicit and makes the page easy to reason about.

### 6.2 Debounced fetch + AbortController

`app/scholarships/page.tsx` uses **two** `useEffect`s:
1. Debounce the search query (250 ms after typing stops).
2. Fetch scholarships when the debounced query or any filter changes; cancel in-flight requests with `AbortController` if the user changes filters mid-request.

This is worth internalizing — it shows up in almost every real React app.

### 6.3 Domain types in one place

Every domain shape in `lib/types.ts`. Every route, every component, every helper imports from there. No duplicated shapes. When the DB schema changes, update `lib/types.ts` and the compiler shows you every consumer.

### 6.4 The DB ↔ UI transform boundary

`lib/scholarshipTransform.ts` is the *only* place that knows both shapes. Route handlers always go through `rowToScholarship(row)` / `scholarshipToRow(obj)`. This decouples the DB layout from the UI; you can rename a column without touching every component.

### 6.5 LLM calls always return typed JSON

Every LLM call uses `response_format: { type: "json_schema", strict: true }` and is parsed into a TypeScript type. The prose the user sees is rendered *from* that typed object, not the other way around. This is what makes the AI features composable.

### 6.6 The two-Supabase-clients privilege boundary

`createBrowserClient()` vs `createServiceClient()` in `lib/supabase.ts`. The moment you see a file import one, you know its privilege level. A general design lesson: name the privileged and unprivileged entry points differently so misuse is obvious at the import site.

---

## Module 7 — Commands and workflow

```bash
npm install          # install all dependencies into node_modules/
npm run dev          # start the dev server (auto-reload on save), http://localhost:3000
npm run build        # production build — fails on TS errors
npm run start        # serve the production build
npm run lint         # ESLint (Next.js's recommended config)
npx tsc --noEmit     # type-check without building (fast feedback loop)
```

Dev workflow:
1. `npm run dev` in one terminal. Leave it running.
2. Edit a file. The browser auto-refreshes.
3. Before committing, run `npm run lint` and `npx tsc --noEmit` to catch issues.
4. Run `npm run build` occasionally to catch build-only errors (rare but real).

---

## Module 8 — Suggested exercises, from easy to meaty

These are graded challenges. Do them in order.

### Level 1 — Wiring
1. Add a new route: `app/about/page.tsx`. Render a short bio. Visit `/about`.
2. Add a new API route: `app/api/ping/route.ts` that returns `{ ok: true, time: new Date().toISOString() }` on `GET`. Hit it with `curl`.
3. Add an "About" link to the sidebar in `components/layout/Sidebar.tsx`.

### Level 2 — React state
4. Build a `/counter` page that shows a number and has `+` / `-` buttons.
5. Extend the counter to persist in `localStorage` across page reloads (use `useEffect` for read/write).
6. Add a `useMemo` that shows whether the current count is prime. (Algorithm practice; React is just the UI.)

### Level 3 — Data round-trip
7. Add a `POST /api/feedback` endpoint that accepts `{ message: string }` and appends it to `data/feedback.json` (follow the pattern in `lib/chat-storage.ts`).
8. Build a `/feedback` page with a form that POSTs to it and shows past feedback.
9. Type-check the whole round-trip with a shared `Feedback` type in `lib/types.ts`.

### Level 4 — Real feature
10. In `/scholarships`, add a "favorites" feature: each card gets a star button; favorites persist to `localStorage`; a filter toggle shows "Favorites only."
11. Add a new filter to `GET /api/scholarships` — e.g. `?fundingMin=` that only returns scholarships whose description mentions a funding amount above X (be creative with the parsing).

### Level 5 — Understanding the pipeline
12. Read `app/api/chat/route.ts` end to end. Sketch the pipeline as a flowchart. Then change `REGION_ALIASES` to add a new alias (e.g. "Benelux" → ["Belgium", "Netherlands", "Luxembourg"]) and verify it shows up in recommendations.
13. Convert `app/scholarships/page.tsx` from client-side fetch to a server component that queries Supabase directly. Keep the filter UI interactive by splitting the filter form into a client child component. Compare page-load performance before and after in the browser devtools Network tab.

When you can do Level 5 without looking at the existing code, you actually know Next.js — not just "enough to vibecode."

---

## Module 9 — Where to go next

When you've worked through the exercises:

- **React docs (react.dev)** — the official site is genuinely good. Read "Thinking in React" and "You Might Not Need an Effect."
- **Next.js docs (nextjs.org/docs)** — focus on the App Router section. Skip the Pages Router entirely; it's legacy.
- **TypeScript handbook (typescriptlang.org/docs)** — read "Everyday Types" and "Narrowing." You already know enough types from this project; the handbook fills in the corners.
- **Kent C. Dodds' "Epic React"** or any free course on React Server Components if you want to go deeper on the server/client split.

The concepts you still haven't touched in this codebase: authentication (NextAuth/Auth.js), middleware, parallel routes, intercepting routes, server actions, image optimization, caching and revalidation. None are needed to understand *this* project, but they come up on real jobs.

---

## Appendix — The "oh that's what it's called" glossary

| Term | What it means here |
|---|---|
| **JSX** | The HTML-like syntax inside `.tsx` files. |
| **Component** | A function that returns JSX. |
| **Prop** | An argument to a component. |
| **State** | Component-local data that triggers re-renders when changed. |
| **Hook** | A special function (starts with `use`) that lets components use state, effects, etc. Must be called at the top level of a component. |
| **Render** | React runs your component function to produce JSX. |
| **Re-render** | React runs the function again because state or props changed. |
| **Mount / unmount** | The first / last render of a component instance. |
| **Hydration** | The browser takes over an HTML page rendered on the server and "attaches" React to it. |
| **Server Component** | Runs on server, no JS shipped. Default in App Router. |
| **Client Component** | Opts in with `"use client"`, ships JS, can be interactive. |
| **Route handler** | A `route.ts` file's `GET`/`POST`/etc. exports. Next.js's term for an API endpoint. |
| **Layout** | A component that wraps every page beneath its folder. |
| **Dynamic segment** | A `[param]` folder in the route tree; the value shows up in `params`. |
| **RLS (Row-Level Security)** | Postgres feature Supabase uses to gate reads/writes per row based on the caller's identity. |
| **RPC** | "Remote Procedure Call." In Supabase, `db.rpc("fn_name", args)` calls a SQL function you defined in a migration. |
| **Embedding** | A vector representation of a text's meaning. Used for semantic search. |
| **Streaming response** | An HTTP response whose body arrives in chunks; the client can start rendering before the server is done. |
| **Debounce** | Wait until the user stops doing X for N ms before running expensive work. |
| **Hoisting** / **closure** / **Promise** / **async/await** | Standard JS features; if any are unfamiliar, the MDN docs (developer.mozilla.org) are the canonical reference. |
