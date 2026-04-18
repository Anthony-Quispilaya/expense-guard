# ExpenseGuard Product Roadmap

This document captures the most useful next product additions for the current ExpenseGuard prototype.

It is written as a practical handoff for implementation.

## Current State

The project already has a strong prototype foundation:

- Knot account linking
- Transaction ingestion and normalization
- Rule-based policy evaluation
- Alerting via Discord and Photon iMessage support on macOS
- Dashboard, transactions table, linked accounts page
- Expense simulation flow for approved, suspicious, and likely personal expenses

What is missing is the workflow layer that helps a user actually manage flagged expenses after detection.

## Product Goal

Turn the prototype from an alert demo into a usable expense review product.

The ideal user flow should be:

1. A transaction is ingested.
2. The policy engine classifies it.
3. An alert is sent.
4. A reviewer opens the flagged expense.
5. The reviewer sees context, reasoning, and evidence.
6. The reviewer approves, rejects, or requests more information.
7. The system stores the decision in an audit trail.

## Highest-Value Features

### 1. Review Queue

Build a dedicated queue for flagged transactions.

Users should be able to:

- See only `suspicious` and `likely_personal` transactions
- Filter by status, date, merchant, risk, and account
- Approve a transaction
- Reject a transaction
- Mark a transaction as `needs_receipt` or `needs_explanation`
- Add reviewer notes
- Track who reviewed it and when

Why this matters:

- This is the core missing workflow layer
- It turns alerts into actionable operations
- It makes the product useful for finance teams, not just demos

### 2. Transaction Detail View

Add a detail page or side panel for a single transaction.

It should show:

- Merchant
- Amount
- Transaction date/time
- Linked account
- Itemized line items
- Policy classification
- All policy reasons
- Alert delivery history
- Review decision and notes
- Raw transaction payload for admin/debug mode

Why this matters:

- The current transaction list is good for scanning, but not for decision-making
- Reviewers need full context to act confidently

### 3. Receipt and Business Justification

Allow users to attach supporting evidence.

Useful fields:

- Receipt image or PDF
- Freeform business justification
- Client / meeting context
- Attendees for meals
- Project code
- Department or cost center

Why this matters:

- Reduces false positives
- Helps reviewers approve valid expenses faster
- Creates a better audit trail

### 4. Policy Settings UI

Move policy logic from hard-coded constants into admin-configurable settings.

Admins should be able to edit:

- High amount threshold
- Personal keyword list
- Suspicious merchant patterns
- After-hours threshold
- Merchant allowlists / blocklists
- Alert routing rules

Why this matters:

- Non-engineers should be able to tune the system
- Different companies have different expense rules
- This is required for real-world adoption

## Strong Secondary Features

### 5. In-App Alert Center

Create an alerts page or inbox.

Features:

- Read / unread state
- Alert history by transaction
- Delivery channel shown clearly
- Retry / replay alert
- Failure reason if delivery failed

Why this matters:

- Alerts should be visible inside the product, not only in external channels

### 6. Search, Filters, and Saved Views

Upgrade the transactions experience with:

- Merchant search
- Date range filters
- Classification filters
- Amount range filters
- Source filters (`knot` vs `simulation`)
- Saved views such as:
  - High risk this week
  - Needs review
  - No receipt attached

Why this matters:

- This is one of the fastest UX wins
- It makes the product feel operational and scalable

### 7. Real-Time Updates

Use Supabase realtime to update the UI immediately when:

- A new transaction is ingested
- A transaction is flagged
- An alert is sent
- A review decision is made

Why this matters:

- Live systems feel much more trustworthy
- Great for demos and useful in production

### 8. Account Sync Health

Improve the linked accounts page with:

- Last successful sync
- Sync status
- Sync errors
- Credential expiration / reconnect needs
- Manual `Sync now` action

Why this matters:

- Users need confidence that account data is actually flowing

## Strategic Product Features

### 9. Explainability Layer

Improve how the system explains why a transaction was flagged.

For each flagged transaction, show:

- Which rule fired
- Why that rule matters
- What evidence triggered it
- What the reviewer should do next

Why this matters:

- Trust is critical for policy systems
- Explanations reduce reviewer friction

### 10. Team Roles and Permissions

Add roles such as:

- Employee
- Reviewer / manager
- Finance
- Admin

Permissions could control:

- Who can review expenses
- Who can edit policy rules
- Who can see raw payloads
- Who receives alerts

Why this matters:

- Real organizations need role separation

### 11. Weekly Digest and Trends

Add summary analytics such as:

- Flagged spend this week
- Top flagged merchants
- Highest-risk accounts
- Open review count
- Repeat personal-use patterns

Why this matters:

- Helps finance teams act strategically, not only transaction-by-transaction

### 12. False Positive Feedback Loop

Store review outcomes to improve policy quality over time.

Examples:

- Marked valid business expense
- Marked true policy violation
- Reviewer overrode rule

Future use:

- Tune thresholds
- Refine keyword lists
- Reduce reviewer noise

Why this matters:

- Makes the system smarter without needing full ML

## Recommended Top 3 Priorities

If only three features should be built next, build these:

1. Review Queue
2. Transaction Detail View with receipt / explanation support
3. Policy Settings UI

Together, these turn the prototype into a real workflow tool.

## Suggested Build Order

### Phase 1: Workflow Core

- Review queue
- Transaction detail view
- Review actions: approve / reject / request info
- Reviewer notes and audit trail

### Phase 2: Evidence and Context

- Receipt upload
- Business justification
- Attendee / project / department metadata

### Phase 3: Admin and Operations

- Policy settings UI
- Alert center
- Sync health and manual sync actions

### Phase 4: Scale and Intelligence

- Real-time updates
- Saved filters
- Trend reporting
- False-positive feedback loop

## Demo-Friendly Features

If optimizing for hackathon/demo value, prioritize:

1. Review queue
2. Transaction detail drawer
3. Receipt upload
4. Real-time updates
5. Better dashboard trends

These features will be highly visible and easy to demo.

## Production-Friendly Features

If optimizing for real team usage, prioritize:

1. Policy settings UI
2. Review workflow and audit trail
3. Roles and permissions
4. Sync health
5. Alert center

These features make the product usable in an actual business environment.

## Simple Implementation Prompt For Claude

Use this as a starting prompt for implementation:

> Build the next version of ExpenseGuard by adding a flagged expense review workflow. Start with a Review Queue page that lists suspicious and likely personal transactions. Add transaction detail views, reviewer actions (approve, reject, request receipt), reviewer notes, and an audit trail. Then add receipt upload and business justification fields. After that, build an admin Policy Settings UI so thresholds and keyword lists can be edited without code changes. Reuse the current Supabase-backed frontend/backend architecture and preserve the existing Knot ingestion, policy engine, simulation flow, and alerting behavior.

## Success Criteria

The next version should feel successful if a reviewer can:

1. Receive a flagged transaction
2. Open it in the app
3. Understand why it was flagged
4. See the relevant evidence
5. Make a decision
6. Leave notes
7. Have that decision saved for future audit

At that point, ExpenseGuard stops being just a detection demo and becomes a usable expense operations tool.
