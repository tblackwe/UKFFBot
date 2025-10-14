# UKFFBot - AI Agent Instructions

## Project Overview
Fantasy football Slack bot integrating with Sleeper API for draft monitoring and roster analysis. Dual-mode architecture: Socket Mode for local dev, AWS Lambda + API Gateway for production.

## Architecture & Key Components

### Execution Modes
- **Local Dev**: `app.js` - Socket Mode with `SLACK_APP_TOKEN`
- **Production**: `lambda-handler.js` - HTTP mode via API Gateway (no app token needed)
- **Background Jobs**: 
  - `lambda-draft-monitor.js` - Checks drafts every minute
  - `lambda-roster-scheduler.js` - Runs roster checks Thu/Sun/Mon on schedule

### DynamoDB Data Model (Single Table Design)
Uses composite keys `PK` (partition) and `SK` (sort) for all entities:

```javascript
// Players: PK='PLAYER', SK='SLEEPER#<sleeper_id>'
{ sleeperId, slackMemberId, slackName }

// Drafts: PK='DRAFT', SK='DRAFT#<draft_id>'
{ draftId, slackChannelId, lastKnownPickCount }

// Leagues: PK='LEAGUE', SK='LEAGUE#<league_id>'
{ leagueId, slackChannelId, leagueName, season, sport, totalRosters, status }

// Cache: PK='CACHE', SK='NFL_PLAYERS#<sport>' or 'BYE_WEEKS#<season>'
{ data, ttl, lastUpdated }
```

**Critical**: Always use exact PK/SK prefixes. No GSI - use scans for channel-based queries.

### Command Routing Pattern
All commands flow through `shared/commandPatterns.js`:
1. Bot mention → `handleAppMention` → regex pattern matching
2. DM → `handleDirectMessage` → admin commands only
3. Pattern match → create payload → route to handler in `handlers/`

**Add new commands**: Update `createCommandPatterns()` with regex + handler mapping.

### Draft Logic - 3RR Support
Snake drafts with optional "3rd Round Reversal" (`reversal_round` setting):
- Standard snake: even rounds reverse
- With 3RR: flip the snake pattern at/after reversal round
- Implementation: `handlers/lastpick.js` lines 46-65

### NFL Data Caching Strategy
**Roster-based caching** - only cache players actually on rosters (99% reduction vs all players):
- `getPlayersFromCacheOrFetch(playerIds)` - cache-first, bulk fetch missing
- Cache TTL: Players 24h, Bye weeks 1 year
- Service: `services/nflDataCache.js`, Storage: `services/datastore.js`

## Development Workflows

### Local Development
```bash
npm run start:local          # Socket mode (requires SLACK_APP_TOKEN)
npm run start:sam            # Test Lambda handlers locally
./dev.sh                     # SAM local + setup instructions
```

Use `local-env.json` for environment variables (NOT `.env` for SAM).

### Testing
```bash
npm test                     # Jest tests
```
Tests located in `__tests__/handlers/` and `__tests__/services/`. Mock DynamoDB with `jest.mock()`.

### Deployment
```bash
./deploy.sh [env]            # Manual: dev/staging/prod
```
**GitHub Actions** (preferred):
- Push to `main` → auto-deploy production
- Push to `develop` → auto-deploy staging
- Workflow: `.github/workflows/deploy.yml`

Required secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`

## Common Patterns & Conventions

### Error Handling
Handlers must catch errors and respond to user with helpful messages:
```javascript
try {
  // API call
} catch (error) {
  console.error("Context message:", error);
  await say("User-friendly error message with guidance");
}
```

### Input Validation
Use `shared/inputValidation.js` helpers:
- `parseSlackUserInput()` - handles `<@U123>`, `U123`, or username
- `parseDraftId()` / `parseLeagueId()` - validates IDs
- Always validate before calling external APIs

### Message Formatting
- Use Slack Block Kit for rich messages (see `handlers/lastpick.js`)
- Thread responses with `thread_ts` when appropriate
- Always provide fallback `text` for notifications

### Datastore Access Pattern
1. Call domain-specific functions: `savePlayer()`, `getDraft()`, `getLeaguesByChannel()`
2. For backward compat, `getData()` returns legacy format: `{ player_map: {}, drafts: {} }`
3. Never construct raw DynamoDB queries - use wrapper functions

## Integration Points

### Sleeper API
Read-only client in `services/sleeper.js`:
- `getDraft(draftId)` - draft metadata with settings (type, reversal_round)
- `getDraftPicks(draftId)` - all picks array
- `getLeague(leagueId)` - league info
- `getLeagueRosters(leagueId)` - roster data for analysis

API returns `null` for not-found with 200 status - always null-check.

### Slack APIs
- Bot client: `app.client.chat.postMessage()`
- User info: `app.client.users.info({ user: memberId })` - resolve member ID to username
- Event deduplication: Lambda stores event IDs in DynamoDB to prevent reprocessing

## Utilities & Admin Commands

- `update-bye-weeks.js [season]` - Fetch bye weeks from ESPN API
- `clear-cache.js` - Clear DynamoDB cache entries
- `check-rosters.js` - Local roster analysis testing

Admin-only DM commands: `update players`, `list drafts` (security restriction in `commandPatterns.js`)

## Documentation References

- `LAMBDA_DEPLOYMENT.md` - AWS architecture, SAM deployment
- `ROSTER_SCHEDULER.md` - Scheduled roster checks
- `NFL_CACHE_DOCUMENTATION.md` - Caching strategy details
- `README.md` - User-facing setup and commands

## Watch-outs

- Node 22+ required (uses native `fetch`)
- Lambda `processBeforeResponse: true` - acknowledge before processing
- DynamoDB table name from `DYNAMODB_TABLE_NAME` env var
- Event retries in Lambda - idempotency important for draft monitoring
- Slack mentions format: `<@U123|username>` or `<@U123>` - parse with validation helpers
