# TBS Student Portfolio — access model & setup (v14)

## The policy this implements

| Who | Landing page (`/`) | Can open a portfolio when… |
|---|---|---|
| **Visitor** (not signed in) | A night sky of ~100 random students shown as **initials only**. No names, photos or year groups are ever sent to the browser. | Never directly. They send a request; if the SuperAdmin approves, the SuperAdmin emails them an expiring secure link. |
| **Member** (any parent, student or staff who can sign in) | The same sky, with each student's **first name**. Open portfolios show the **real profile photo**; closed ones show initials. | **By default every portfolio is open to signed-in members.** Closed only if the SuperAdmin closed it, in which case one click sends a request (approval = 30 days' access). Their own / their child's portfolio is always open. |
| **SuperAdmin** | Same as a member. | Always. Reviews requests (Workspace → **Access requests**) and can close an individual portfolio (Workspace → Sharing & access → *TBS community access*). |

Only approved moments and public evidence are ever shown to other members.

## What people see

- **Landing (`/`)** — *Every student is a star.* Students appear as planets and stars of different sizes
  and colours (some with Saturn-style rings, some glowing brighter) orbiting the TBS heading,
  joined by constellation lines. Every few seconds one star fades and another student from the random
  sample of 100 takes its place. The page never loads all 900+ students.
- **Search on the landing page:** the search icon in the top bar slides open a search field;
  members get live results (server-side, max 24) and open or
  request a portfolio straight from the list. Visitors can type a name, but no names are
  ever sent to them: they see **"Sign in to see results" → View**, which goes to login and
  brings them back with the same search already running.
- **Browse portfolios** in the workspace adds the year-group filter. Nothing is listed until
  you type two letters or pick a year group.
- Stars are joined by constellation lines between every pair of nearby students that has no
  other student between them, so the lines never cross.
- **Own / child's portfolio** → choose *View* or *Edit*.
- ADM numbers are never shown in any search or list, and every message on screen is written
  in friendly, everyday language (technical details only go to the browser console).
- A portfolio without an introduction or About me shows **"Portfolio in progress"** and hides
  every section below it. The **Panthers** section only appears when the student has Panthers data.

## Setup (in this order)

### 1. Run the new migration

    supabase/migrations/20261003_open_by_default.sql

It is **additive only** (adds `community_closed`, updates the guard trigger, adds an index),
so you should not see the "destructive operations" warning this time.

### 2. (If not done already) salt for anonymous keys

    supabase secrets set DIRECTORY_SALT="any-long-random-string"

### 3. Redeploy four functions (JWT verification OFF)

    supabase functions deploy journey-directory --no-verify-jwt
    supabase functions deploy journey-access-request --no-verify-jwt
    supabase functions deploy journey-member-portfolio --no-verify-jwt
    supabase functions deploy journey-media --no-verify-jwt

Each file is self-contained, so pasting into the dashboard editor also works — just switch
**Enforce JWT verification** off for each.

## Please check: possible existing bug in `journey-public`
`journey-public` only returns entries whose `verification_status = 'approved'`, but the app
marks approved entries as `'verified'`. If your data uses `'verified'`, public share links
show no Journey moments. To fix, change `.eq('verification_status','approved')` to
`.in('verification_status',['approved','verified'])` in `journey-public`.

## Everyday use (SuperAdmin)
- **Close a portfolio** (e.g. at a family's request): Workspace → search the student →
  Sharing & access → *TBS community access* switch.
- **Requests:** Workspace → Access requests (badge shows the pending count).
  - *Member* → **Approve · 30 days** grants in-app access immediately; **Revoke** any time.
  - *Visitor* → **Approve**, then **Create secure link** and **Reply by email**.

## v13 · Sign-in first, and requests from the sign-in page

1. Run `supabase/migrations/20261004_requests_from_sign_in.sql` in the SQL editor
   (lets a request arrive without a student chosen yet).
2. Redeploy the Edge Function `journey-access-request` with the new
   `supabase/functions/journey-access-request/index.ts`.

Requests from the sign-in page show in the SuperAdmin inbox as
"Not matched yet". Find the student the visitor named, choose them, then
approve as usual.

## v14 · 150 students in space

Redeploy the Edge Function `journey-directory` with the new
`supabase/functions/journey-directory/index.ts` (the random sample is now
150 students instead of 100). Until then the page works with 100.
