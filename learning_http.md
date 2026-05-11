# Learning HTTP

A primer for someone with DS&A + T-SQL background who has never formally studied HTTP. Read this before [`learning_nextjs.md`](./learning_nextjs.md). Every concept is tied to a real request that happens in ScholarPath.

By the end you should be able to answer, without hesitation:

- What happens when I type a URL into the address bar?
- What does `fetch('/api/scholarships?country=Japan')` actually send and receive?
- What's the difference between `GET`, `POST`, `PUT`, `DELETE`?
- What do status codes like 200, 404, 500 mean?
- What's a header? What's a body?
- What's the `Content-Type: application/json` line everyone mentions?

---

## 1. The big picture in one paragraph

HTTP (HyperText Transfer Protocol) is a **text-based request/response protocol** that runs over TCP. A **client** (your browser, `curl`, a mobile app, another server) opens a connection to a **server**, sends a single text message called a **request**, and the server sends back a single text message called a **response**. That's one HTTP transaction. The connection may close, or it may be reused for more requests. The protocol is **stateless**: each request is independent; the server does not remember the previous one unless you explicitly carry state (via cookies, tokens, or a database).

SQL analogy: think of HTTP like opening a connection to SQL Server, sending one statement, getting one result set back, and closing the connection. Except the "statement" is structured as `METHOD URL HEADERS BODY` and the "result set" is structured as `STATUS HEADERS BODY`.

---

## 2. A URL, piece by piece

```
https://example.com:443/api/scholarships/japan-mext-2025?country=japan&degree=masters#requirements
└─┬─┘   └────┬────┘└┬┘└──────────┬───────────────────┘└──────────┬───────────────────┘└────┬────┘
scheme    host     port          path                      query string               fragment
```

- **Scheme** (`http` / `https`) — the protocol. `https` = HTTP over TLS (encrypted).
- **Host** — the server's domain name. DNS resolves it to an IP address.
- **Port** — TCP port on the server. Defaults: `80` for http, `443` for https. In dev you see `localhost:3000` because Next.js listens on port 3000.
- **Path** — what resource you're asking for. The server decides what it means.
- **Query string** — extra key/value parameters after `?`, separated by `&`. Used for filters, search terms, pagination.
- **Fragment** — after `#`. Never sent to the server; browsers use it to scroll to a section.

In this project: when you hit `http://localhost:3000/api/scholarships?country=Japan&degree=masters`, you're telling the local Next.js dev server: "run the `GET` handler in `app/api/scholarships/route.ts` and pass it `country=Japan` and `degree=masters` as query params."

---

## 3. The HTTP request

A raw HTTP request is plain text. Here's what your browser actually sends when `app/scholarships/page.tsx` calls `fetch('/api/scholarships?country=Japan')`:

```
GET /api/scholarships?country=Japan HTTP/1.1
Host: localhost:3000
Accept: application/json
User-Agent: Mozilla/5.0 ...

```

Four parts, in order:

1. **Request line** — `METHOD PATH HTTP-VERSION`.
2. **Headers** — one per line, `Name: value`.
3. **Blank line** — separates headers from body.
4. **Body** — optional. `GET` requests usually have none. `POST` / `PUT` usually do.

For a POST from `components/chat/ChatWindow.tsx`:

```
POST /api/chat HTTP/1.1
Host: localhost:3000
Content-Type: application/json
Content-Length: 87

{"messages":[{"role":"user","content":"I want to study in Japan"}]}
```

The JSON body is just a string of bytes after the blank line. `Content-Type` tells the server how to parse those bytes. `Content-Length` tells it how many bytes to read.

**You almost never write raw HTTP.** Your browser, `fetch`, `curl`, and server frameworks all construct it for you. But knowing the shape means you can read any HTTP debugging output.

---

## 4. The HTTP response

The server replies with the same shape: status line + headers + blank line + body.

```
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Content-Length: 1247
Cache-Control: no-store

[{"id":"mext-2025","name":"MEXT Scholarship","country":"Japan", …}]
```

- **Status line** — `HTTP-VERSION CODE TEXT`. The text is for humans; only the code matters.
- **Headers** — server metadata about the response (content type, caching, cookies, etc.).
- **Body** — the actual payload. For `/api/scholarships` it's JSON. For a regular page like `/counselor` it's HTML. For an image it's binary bytes.

---

## 5. HTTP methods (verbs)

The method tells the server what kind of operation you want. This is a *convention*, not a constraint — the server decides what each method does for each path. But every mature API follows REST conventions:

| Method | Convention | "Safe"? | "Idempotent"? | Example in this repo |
|---|---|---|---|---|
| `GET` | Read a resource. No body. | Yes | Yes | `GET /api/scholarships` — list scholarships |
| `POST` | Create a resource, or trigger an action. Has body. | No | No | `POST /api/chat` — send a chat message; `POST /api/scholarships` — create one |
| `PUT` | Replace a resource entirely. Has body. | No | Yes | `PUT /api/scholarships/[id]` — update a scholarship |
| `PATCH` | Partially update. Has body. | No | No (usually) | not used here |
| `DELETE` | Remove a resource. Usually no body. | No | Yes | `DELETE /api/scholarships/[id]` |
| `HEAD` | Like `GET` but only returns headers. | Yes | Yes | rarely used directly |
| `OPTIONS` | Ask what methods are allowed. Used by CORS preflight. | Yes | Yes | handled automatically |

Definitions:
- **Safe** = doesn't change server state. A spider crawling your site should only use safe methods.
- **Idempotent** = calling it N times has the same effect as calling it once. `DELETE /foo/1` twice is fine (second time is a no-op or 404). `POST /orders` twice creates two orders.

SQL analogy: `GET` ≈ `SELECT`, `POST` ≈ `INSERT`, `PUT` ≈ `UPDATE` (whole row), `PATCH` ≈ `UPDATE` (set some cols), `DELETE` ≈ `DELETE`.

---

## 6. Status codes

Three-digit numbers, grouped by first digit:

| Range | Meaning | Common codes |
|---|---|---|
| `1xx` | Informational | `101 Switching Protocols` (used for WebSocket upgrade) |
| `2xx` | Success | `200 OK`, `201 Created`, `204 No Content` |
| `3xx` | Redirect | `301 Moved Permanently`, `302 Found`, `304 Not Modified` |
| `4xx` | Client error (your fault) | `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `409 Conflict`, `422 Unprocessable Entity`, `429 Too Many Requests` |
| `5xx` | Server error (server's fault) | `500 Internal Server Error`, `502 Bad Gateway`, `503 Service Unavailable`, `504 Gateway Timeout` |

The ones you'll use most writing code:

- **`200 OK`** — default success. `NextResponse.json(data)` returns 200.
- **`201 Created`** — a `POST` that successfully created something. See `app/api/scholarships/route.ts:105`: `return NextResponse.json(..., { status: 201 })`.
- **`204 No Content`** — success but no body (e.g. after a `DELETE`).
- **`400 Bad Request`** — the request was malformed. Missing fields, bad JSON, etc. This repo uses it in `app/api/scholarships/route.ts` when required fields are missing.
- **`401 Unauthorized`** — you aren't logged in. (The name is historical; it really means "not authenticated.")
- **`403 Forbidden`** — you're logged in but not allowed.
- **`404 Not Found`** — the resource doesn't exist.
- **`500 Internal Server Error`** — your server code threw an uncaught exception. The counselor route uses 500 as its catch-all: `NextResponse.json({ error: message }, { status: 500 })`.

**Read the status code first when debugging.** It tells you whether the problem is on your side (`4xx`) or the server's (`5xx`).

---

## 7. Headers

Key/value metadata. Case-insensitive names. A handful you'll see constantly:

**Request headers** (client → server):
- `Host` — the domain. Required in HTTP/1.1.
- `Content-Type` — what format the body is in. `application/json`, `multipart/form-data` (file upload), `application/x-www-form-urlencoded` (old HTML form), `text/plain`.
- `Content-Length` — body size in bytes.
- `Accept` — what formats the client *wants* back. `application/json` means "send me JSON, not HTML."
- `Authorization` — credentials. `Authorization: Bearer eyJ0eXAi…` for API tokens.
- `Cookie` — cookies the server previously set.
- `User-Agent` — identifies the client (browser or library).

**Response headers** (server → client):
- `Content-Type` — format of the response body.
- `Content-Length` — body size.
- `Set-Cookie` — tells the client to store a cookie.
- `Cache-Control` — caching rules. `no-store` means "never cache." ScholarPath's chat route sets this.
- `Location` — where to redirect to (with a `3xx` status).
- `Access-Control-Allow-Origin` — CORS (see §13).

In code, this is how you set them. From `app/api/chat/route.ts`:

```ts
return new Response(readable, {
  headers: {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  },
});
```

And when `ChatWindow.tsx` sends a request, it sets headers on the way out:

```ts
const response = await fetch("/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ messages: nextMessages }),
});
```

---

## 8. Where data lives in a request

There are four places a request can carry information. Knowing which to use is a real skill:

| Location | Example | When to use |
|---|---|---|
| **Path segments** | `/api/scholarships/japan-mext-2025` | Identify a specific resource. Typed as `[id]` in Next.js. |
| **Query string** | `?country=Japan&degree=masters` | Filters, search, pagination, optional modifiers on a `GET`. |
| **Headers** | `Authorization: Bearer …` | Cross-cutting metadata: auth, caching hints, content negotiation. |
| **Body** | `{"messages": [...]}` | The "payload" of a `POST`/`PUT`/`PATCH`. Can be any content type. |

Rule of thumb: **`GET` = use path + query. `POST`/`PUT` = use body for the interesting data**, path for the resource it affects.

In Next.js, you read these like so:

```ts
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country");           // query string
  const auth = request.headers.get("authorization");     // header
}

export async function POST(request: NextRequest) {
  const body = await request.json();                      // body
}

// For dynamic path segments:
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;                                   // path
}
```

---

## 9. JSON is the lingua franca

Modern APIs send JSON in bodies. JSON is just text that looks like this:

```json
{
  "id": "mext-2025",
  "country": "Japan",
  "funding": "full",
  "tags": ["graduate", "asia"]
}
```

In JavaScript / TypeScript:

```ts
const obj = JSON.parse('{"id":"mext-2025"}');   // string → object
const str = JSON.stringify({ id: "mext-2025" }); // object → string
```

When you `fetch` an endpoint that returns JSON:

```ts
const response = await fetch("/api/scholarships");
const data = await response.json();   // reads the body and JSON.parses it
```

`response.json()` is just a helper that does `JSON.parse(await response.text())`.

**Content-Type matters.** If the server returns `Content-Type: text/html` but you call `response.json()`, it throws. Always set the right `Content-Type` on requests *and* responses, and check the status code before trusting the body.

---

## 10. Cookies and sessions (quick take)

The server can ask the browser to remember something by sending a header like `Set-Cookie: session=abc123; HttpOnly; Secure`. The browser then automatically includes `Cookie: session=abc123` on every future request to that domain.

That's how "being logged in" usually works: after you log in, the server sets a session cookie; every later request silently carries it; the server looks up the session to know who you are. Without it, HTTP has no concept of "user" — each request is independent.

This project has no auth yet, so cookies don't show up in the code. But when you add login later, this is the mechanism.

---

## 11. HTTPS in one paragraph

HTTPS = HTTP over TLS. The HTTP messages are the same; they're just sent inside an encrypted TCP tunnel so intermediaries (your WiFi, ISP, etc.) can't read or tamper with them. The server presents a certificate proving it's really `example.com`; your browser validates the certificate against a set of trusted root authorities. You don't deal with this in code — Next.js gives you HTTPS automatically when deployed to Vercel, and locally you use plain `http://localhost:3000`.

---

## 12. Streaming responses

Normally the server builds the whole response body, sets `Content-Length`, and sends it. **Streaming** is when the server starts sending bytes before the body is complete — useful for long responses (chat, LLM output, file downloads, server-sent events).

Under the hood this uses HTTP/1.1 **chunked transfer encoding** or HTTP/2's native framing. From the code's perspective:

- On the server: return a `ReadableStream` instead of a string. See `streamText` in `app/api/chat/route.ts:645`.
- On the client: instead of `await response.json()`, use `response.body.getReader()` and read chunks as they arrive. See `ChatWindow.tsx:54`.

SQL analogy: like a cursor — you iterate over results without loading the full set into memory.

---

## 13. CORS in one paragraph (you can skip this for now)

Browsers block JavaScript on `siteA.com` from calling an API at `siteB.com` unless `siteB` opts in with an `Access-Control-Allow-Origin` header. This is called CORS (Cross-Origin Resource Sharing). Before the real request, the browser may send a preflight `OPTIONS` request to ask whether the real one is allowed.

This project's frontend and API are on the same origin (`localhost:3000`), so CORS never triggers. You'll meet it the first time you call a third-party API from browser JS — at which point, read MDN's CORS page.

---

## 14. Tools: how to look at real HTTP

Three habits that will serve you forever:

### 14.1 Browser DevTools → Network tab

Open `http://localhost:3000/scholarships`, press F12, go to the **Network** tab, reload.

You'll see every request: the HTML page, JavaScript bundles, CSS, images, and `/api/scholarships?…`. Click a request to see:
- **Headers** — request and response headers, full URL, method, status.
- **Payload** — request body (for POST/PUT).
- **Preview** / **Response** — response body, rendered or raw.
- **Timing** — DNS → TCP → TLS → server → download breakdown.

This is the single best tool for learning what your app is actually doing.

### 14.2 `curl` — HTTP from the terminal

```bash
# GET
curl http://localhost:3000/api/scholarships

# GET with query string and pretty-print
curl "http://localhost:3000/api/scholarships?country=Japan" | jq

# POST with a JSON body
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hi"}]}'

# Show response headers too
curl -i http://localhost:3000/api/scholarships

# Show the raw request being sent and response received
curl -v http://localhost:3000/api/scholarships
```

`curl` is language-agnostic and scriptable. When debugging a route handler, hitting it with `curl` removes the frontend from the equation.

### 14.3 `fetch` in the browser console

Open DevTools → Console tab on any page, and you can call your own API live:

```js
await fetch("/api/scholarships?country=Japan").then(r => r.json())
```

Instant feedback. Great for exploring API shapes without writing UI code.

---

## 15. Every HTTP concept, mapped to this project

Open these files and read them with the above framework in mind:

| Concept | File + roughly where |
|---|---|
| Reading query params | `app/api/scholarships/route.ts:16-23` — `new URL(request.url).searchParams.get(...)` |
| Reading a JSON body | `app/api/scholarships/route.ts:73` — `await request.json()` |
| Returning JSON | `app/api/scholarships/route.ts:67` — `NextResponse.json(scholarships)` |
| Returning a status code | `app/api/scholarships/route.ts:88-95` — `{ status: 400 }` |
| Returning `201 Created` | `app/api/scholarships/route.ts:105` — `{ status: 201 }` |
| Dynamic path param `[id]` | `app/api/scholarships/[id]/route.ts` |
| Custom headers on a response | `app/api/chat/route.ts:702-706` — `Content-Type`, `Cache-Control` |
| Streaming response body | `app/api/chat/route.ts:645` (server) + `components/chat/ChatWindow.tsx:54` (client) |
| Client sending POST with JSON body | `components/chat/ChatWindow.tsx:36-40` |
| Aborting an in-flight request | `app/scholarships/page.tsx:42` — `new AbortController()` and `signal` |
| Cache control on a request | `app/scholarships/page.tsx:67` — `fetch(…, { cache: "no-store" })` |
| Handling error status codes | `components/chat/ChatWindow.tsx:42-47` — `if (!response.ok) throw …` |

---

## 16. Exercises

### Level 1 — Observe

1. `npm run dev`. Open `/scholarships` in the browser with DevTools → Network tab open. Find the `/api/scholarships?...` request. Record:
   - Its method, full URL, status code.
   - What `Content-Type` did the server return?
   - What are the first two items in the JSON response?
2. Type in the search box. Watch new requests appear. Why does one request fire after you stop typing rather than one per keystroke? (Hint: §Module 2.5 of `learning_nextjs.md`.)
3. On `/counselor`, send a message. In the Network tab, find the `/api/chat` POST. Open the Response tab — you'll see the text arriving in chunks. Compare it with the `/api/scholarships` request, which arrives all at once.

### Level 2 — Hand-write requests

4. With the dev server running, use `curl` to:
   - List all scholarships (`GET`).
   - List only Japan + masters (add query params).
   - Trigger a 400 by `POST`ing JSON that's missing a required field to `/api/scholarships`.
   - Trigger a 404 by `GET`ing a path that doesn't exist.
5. Do the same from the browser console using `fetch`.

### Level 3 — Write a small endpoint

6. Create `app/api/echo/route.ts` with `POST` and `GET` handlers:
   - `GET /api/echo?msg=hello` → returns `{ echoed: "hello", timestamp: "..." }` with status 200.
   - `POST /api/echo` with body `{ msg: "hi" }` → same shape, status 201.
   - If `msg` is missing or empty, return status 400 with `{ error: "msg required" }`.
7. Test all four scenarios with `curl`.
8. Set `Cache-Control: no-store` on the response. Confirm it shows up in DevTools.

### Level 4 — Read a real pipeline

9. Trace what happens end to end when a user sends a chat message:
   - Client: what does `fetch` send? (method, URL, headers, body)
   - Server: where does the request body get parsed?
   - Server: what does the response look like — status, `Content-Type`, body shape?
   - Client: how does the UI read the streamed response?

Write this out in your own words. If you can do it without opening the code, you understand HTTP well enough to move on to `learning_nextjs.md`.

---

## 17. Cheat sheet to keep nearby

```
Request              Response
-------              --------
METHOD /path ...     HTTP/1.1 <code> <text>
Header-Name: value   Header-Name: value
...                  ...
<blank line>         <blank line>
<body>               <body>


Common methods:      Common codes:
  GET    read          200 OK
  POST   create/act    201 Created
  PUT    replace       204 No Content
  PATCH  partial       400 Bad Request
  DELETE remove        401 Unauthorized
                       403 Forbidden
                       404 Not Found
                       500 Internal Server Error


Body formats (Content-Type):
  application/json                       ← 99% of APIs here
  application/x-www-form-urlencoded      ← old HTML forms
  multipart/form-data                    ← file uploads
  text/plain                             ← raw text; chat route uses this for streaming
  text/html                              ← regular web pages


Where to put data:
  /users/123         ← identity (path)
  ?q=foo&page=2      ← filters (query)
  Authorization: …   ← cross-cutting (header)
  {json}             ← payload (body)
```

That's HTTP. Now the fetch/route pieces of `learning_nextjs.md` should read like mechanics of something you already understand.
