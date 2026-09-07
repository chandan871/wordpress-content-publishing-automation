# KahaniWorld Automation

This workspace contains the KahaniWorld WordPress automation scripts. Phase 1 fixed the technical SEO foundation; Phase 2 adds a reusable publishing pipeline that reads the existing Google Sheet, prepares metadata, and publishes only when production mode is explicitly enabled.

## Setup

Create `.env` from `.env.example` and fill the secrets locally. Do not commit `.env`.

Required variables:

- `KW_SITE_URL`: WordPress site URL, for example `https://kahaniworld.com`
- `KW_WP_USERNAME`: WordPress REST API user for publishing
- `KW_WP_APP_PASSWORD`: WordPress Application Password for that user
- `KW_GOOGLE_SHEET_ID`: existing Google Sheet ID
- `KW_GOOGLE_SHEET_NAME`: sheet tab name, default `Content Queue`
- `KW_SHEET_WEBHOOK_URL`: Apps Script web app URL for writeback
- `KW_SHEET_WEBHOOK_SECRET`: shared webhook secret

## Google Sheet

The publisher uses the existing sheet. It expects these columns:

`ID`, `Title`, `Story`, `Status`, `Category`, `Tags`, `SEO Title`, `Meta Description`, `Slug`, `WordPress URL`, `Error Log`

Optional workflow columns may be added by the writeback script:

`WordPress Post ID`, `Published Date`, `Last Updated`

Header matching trims extra spaces, so `Title ` and `Story ` still work.

## Status Values

- `Ready`: eligible for processing
- `Publishing`: set immediately before a live publish request
- `Published`: set only after WordPress publish and page verification succeed
- `Failed`: validation, publishing, or verification failed; see `Error Log`
- `Draft` or empty: ignored

Only rows with `Status = Ready` are processed.

## Commands

Check the sheet:

```bash
npm run phase2:check:sheet
```

Check WordPress REST authentication:

```bash
npm run phase2:check:wp
```

Dry run one Ready row without changing WordPress or the sheet:

```bash
npm run phase2:dry-run
```

Publish one Ready row only after manual approval:

```bash
npm run phase2:publish
```

You can also target one row:

```bash
node scripts/kahaniworld-phase2-publisher.mjs --dry-run --row-id KW-0006
```

## Publishing Pipeline

For each Ready row, the Phase 2 publisher:

1. Reads the row from the existing Google Sheet.
2. Validates required fields and duplicate signals.
3. Generates missing SEO title, meta description, slug, excerpt, and tags.
4. Verifies the category exists in WordPress.
5. Resolves tags and creates missing tags only in production mode.
6. Adds relevant internal links to existing KahaniWorld posts when available.
7. Builds a WordPress REST payload using Rank Math meta fields.
8. In production mode, marks the row `Publishing`, publishes, verifies the live page, then writes back `Published`.
9. On failure, writes `Failed` and a readable `Error Log`.

The story body is not generated or rewritten by Codex. It is only wrapped into WordPress-ready paragraphs.

## Duplicate Protection

The agent refuses to publish when:

- `WordPress URL` is already filled.
- The same slug already exists on another WordPress post.
- The same title already exists.
- The story ID is already visible in WordPress post meta.

This prevents retries from publishing the same row twice.

## SEO Verification

After a production publish, the verifier checks:

- HTTP 200
- canonical URL
- indexable robots directive
- expected title signal
- meta description
- Rank Math Article schema
- BreadcrumbList schema
- single canonical tag
- URL matches the generated slug

Google Search Console indexing is intentionally manual.

## Apps Script Writeback

Use `scripts/google-sheet-writeback.gs` in the existing Apps Script project. Set Script Properties:

- `KW_SHEET_WEBHOOK_SECRET`
- `KW_GOOGLE_SHEET_ID`

Deploy it as a web app and put the URL in `KW_SHEET_WEBHOOK_URL`.

## Adding A Story

Add a new row to `Content Queue` with:

- unique `ID`
- `Title`
- full `Story`
- `Status = Ready`
- existing WordPress `Category`

Optional fields can be supplied manually: `Tags`, `SEO Title`, `Meta Description`, `Slug`. The agent only fills missing fields.

## Troubleshooting

- `Missing column`: check Sheet headers.
- `Category does not exist`: create or correct the category in WordPress.
- `Slug already exists`: choose a different slug or confirm the story was not already published.
- `Sheet fetch returned binary content`: convert the file to a native Google Sheet.
- `Unauthorized` writeback: confirm Apps Script secret matches `.env`.

## Phase 1 SEO Foundation

Do not remove the Phase 1 work:

- clean story URLs
- `index, follow`
- canonical URLs
- Rank Math Article schema
- BreadcrumbList schema
- category indexing
- sitemap configuration
- robots.txt sitemap declaration
- redirects from old broken story URLs
