# ARG Relay

ARG Relay is a small, reusable Instagram automation app for sending a Discord invite and joining instructions when someone DMs your Instagram professional account or comments on one of your posts/Reels.

It uses Meta's official Instagram Messaging API. It does not use browser automation, scrape Instagram, or ask you to put your Instagram password in the app.

## Features

- Password-protected settings page at `/`.
- Separate keyword triggers and message copy for DMs and post/Reel comments.
- Editable campaign name and Discord invite URL.
- Message placeholders: `{campaign}` and `{discord_link}`.
- Pause/resume switch, duplicate-event protection, webhook signature checks, and `/health` endpoint.
- File storage for local use; PostgreSQL storage when `DATABASE_URL` is configured.

## Run locally

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env` and set `ADMIN_PASSWORD`, `SESSION_SECRET`, and `META_VERIFY_TOKEN` to private values.
3. Run `npm install` and `npm start`.
4. Open `http://localhost:3000` and sign in with `ADMIN_PASSWORD`.

To receive real Meta webhooks locally, expose the local server through an HTTPS tunnel and enter its public `/webhook` URL in your Meta app. Do not commit `.env` or share Meta access tokens.

## Connect Instagram

Meta's screens and permission names can change. At a high level:

1. Use an Instagram **Creator or Business** account.
2. Create a Meta developer app using **Manage messaging & content on Instagram**. This project uses Instagram Login, which does not require a Facebook Page. Authorize the Instagram professional account you want the app to manage.
3. Request the Instagram messaging and comment permissions required by the Instagram Login flow. Configure the webhook callback and verification token, then subscribe to the `messages` and `comments` fields.
4. Complete Meta App Review and obtain the required access for people outside your app roles. Comment webhooks and private replies have additional access requirements; Meta's current documentation is authoritative.
5. Add the values below as environment variables in your host. Set `APP_BASE_URL` to your deployed service's public base URL.
6. In the settings page, enter the Discord invite and copy, check the trigger keywords, then turn on **Enable replies**.

Required environment values:

| Variable | Purpose |
| --- | --- |
| `ADMIN_PASSWORD` | Password for the settings page |
| `SESSION_SECRET` | Signs the admin login cookie; use a long random value |
| `META_VERIFY_TOKEN` | Shared token used for Meta's webhook verification handshake |
| `META_APP_SECRET` | Verifies that incoming webhook requests are genuinely signed by Meta |
| `META_IG_USER_ID` | ID of the connected Instagram professional account |
| `META_IG_ACCESS_TOKEN` | Instagram user access token with the required Instagram messaging permissions |
| `META_GRAPH_API_VERSION` | Graph API version; defaults to `v27.0` |
| `APP_BASE_URL` | Public service URL, without `/webhook` |
| `DATABASE_URL` | Optional PostgreSQL connection string for durable settings and event deduplication |

Only enable the campaign after testing it with a permitted test account and checking that the link and message wording are correct.

## Deploy to Render

The included `render.yaml` creates a free Render web service. In Render, provide the secret environment values above and set `APP_BASE_URL` to the service URL Render assigns.

The app works without a database, but then it saves settings in `data/settings.json`. Render's free service filesystem is temporary, so settings and duplicate-event history can be lost when the service spins down, restarts, or deploys. For settings that must survive those events, attach a PostgreSQL database through `DATABASE_URL`. Render's free PostgreSQL databases expire after 30 days, so they are suitable for trials, not long-term campaign storage. A durable database may have a cost.

Render's free web service can sleep between requests. That makes it useful for experimenting, but cold starts can delay an Instagram webhook during a live campaign. For reliable launch-day responses, use an always-on service and durable database.

## Reply behavior and limits

- A matching DM gets one automatic reply with the Discord link and instructions.
- A matching post/Reel comment gets one private reply (DM) with the comment-reply copy. Instagram only allows one private reply to a comment; the person must respond before a continued DM conversation is available.
- Keyword matching is case-insensitive and checks whether the incoming text contains any configured trigger. An empty trigger list matches all text DMs or all comments for that channel.
- The app does not send proactive follow-up DMs to people who have not contacted or interacted with the account.
- Keep future release announcements in the Discord server. Instagram messaging policy limits follow-up messages outside the applicable messaging window.

## Project files

- `src/server.js` — dashboard, login, webhook verification, trigger matching, and Meta API calls.
- `src/store.js` — campaign settings and processed-event storage.
- `.env.example` — environment variable template.
- `render.yaml` — Render service definition.
