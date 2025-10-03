# NFL Data Caching System

This document describes the NFL data caching system implemented to improve performance and reduce API calls to the Sleeper API.

## Overview

The caching system provides cached access to two critical pieces of NFL data:
1. **NFL Bye Weeks** - Mapping of team abbreviations to bye week numbers for each season
2. **NFL Player Database** - **ROSTER-BASED CACHING**: Only players that are actually on fantasy rosters are cached

### Key Improvement: Roster-Based Caching

**Previous Behavior**: Cached ALL ~3,000+ NFL players from Sleeper API, regardless of whether they were on any rosters.

**New Behavior**: Cache starts empty and only stores players that are found on actual Sleeper rosters during roster analysis.

**Benefits**:
- ~99% reduction in cache size (from 3,000+ players to ~100-200 roster players)
- Faster cache operations
- Reduced DynamoDB storage costs
- Lower bandwidth usage
- Cache grows organically with actual usage

## Architecture

### Components

1. **`services/nflDataCache.js`** - Main caching service with cache-first, API-fallback logic
2. **`services/datastore.js`** - Extended with cache storage/retrieval functions
3. **`handlers/cacheManagement.js`** - Admin commands for cache management
4. **`services/rosterAnalyzer.js`** - Updated to use cached data

### Data Flow

```
Roster Analysis Request
    ↓
Collect ALL player IDs from rosters
    ↓
Check cache for each player ID
    ↓
If Cache Hit → Use cached data
    ↓
If Cache Miss → Fetch ONLY missing players from Sleeper API → Cache them → Return data
```

**Key Change**: Instead of fetching ALL players, we now only fetch and cache players that are actually on rosters.

## Cache TTL Strategy

- **Bye Weeks**: 1 year TTL (updated once per season)
- **Player Data**: 24 hours TTL (updated daily for injury status, etc.)

## Functions

### NFL Data Cache Service (`services/nflDataCache.js`)

#### `getNflByeWeeksWithCache(season)`
- **Purpose**: Get bye weeks for a specific season with caching
- **Cache Strategy**: DynamoDB first, hardcoded fallback
- **TTL**: 1 year
- **Usage**: `const byeWeeks = await getNflByeWeeksWithCache(2025);`

#### `getPlayersFromCacheOrFetch(playerIds, sport = 'nfl')`
- **Purpose**: Get specific players with roster-based caching (**MAIN FUNCTION**)
- **Cache Strategy**: Check cache for each player, fetch only missing ones from Sleeper API
- **TTL**: 24 hours  
- **Usage**: `const players = await getPlayersFromCacheOrFetch(['player1', 'player2'], 'nfl');`
- **Benefits**: Only caches players that are actually needed

#### `fetchAndCacheRosterPlayers(playerIds, sport = 'nfl')`
- **Purpose**: Fetch specific players and add them to cache
- **Usage**: Internal function used by getPlayersFromCacheOrFetch

#### `refreshNflPlayersCache(sport = 'nfl')`
- **Purpose**: Force refresh of player cache
- **Usage**: Manual cache invalidation

#### `refreshNflByeWeeksCache(season)`
- **Purpose**: Force refresh of bye weeks cache
- **Usage**: Manual cache invalidation

#### `getCacheStatus()`
- **Purpose**: Get current cache status for monitoring
- **Returns**: Object with cache status for both data types

### Datastore Functions (`services/datastore.js`)

#### `saveNflByeWeeks(season, byeWeeks)`
- Saves bye weeks to DynamoDB with TTL

#### `getNflByeWeeks(season)`
- Retrieves bye weeks from DynamoDB (checks TTL)

#### `saveNflPlayers(sport, players)`
- Saves player data to DynamoDB with TTL

#### `getNflPlayers(sport)`
- Retrieves player data from DynamoDB (checks TTL)

## Cache Management Commands

### `@UKFFBot cache status`
Shows current cache status including:
- Whether data is cached
- Number of cached players
- Any cache errors
- Last cached timestamps

### `@UKFFBot cache refresh`
Force refreshes both caches:
- Fetches fresh player data from Sleeper API
- Updates bye weeks cache
- Reports success/failure for each cache

## DynamoDB Schema

### Cache Items Structure

```javascript
{
  PK: 'NFL_CACHE',
  SK: 'BYE_WEEKS#2025' | 'PLAYERS#NFL',
  season: 2025,           // For bye weeks
  sport: 'nfl',          // For players
  byeWeeks: {...},       // Bye weeks data
  players: {...},        // Players data
  cachedAt: '2025-09-09T12:00:00Z',
  expiresAt: '2026-09-09T12:00:00Z'  // TTL
}
```

## Usage Examples

### In Roster Analysis
```javascript
// NEW: Only fetches roster players
const allRosterPlayerIds = collectPlayerIdsFromRosters(rosters);
const players = await getPlayersFromCacheOrFetch(allRosterPlayerIds, 'nfl');
const byeWeeks = await getNflByeWeeksWithCache(currentSeason);
```

### Cache Management
```javascript
// Check cache status
const status = await getCacheStatus();

// Force refresh
await refreshNflPlayersCache('nfl');
await refreshNflByeWeeksCache(2025);
```

## Benefits

1. **Performance**: Reduced API calls to Sleeper, faster response times
2. **Efficiency**: Only cache players that are actually on rosters (~99% cache size reduction)
3. **Cost**: Significantly reduced DynamoDB storage costs  
4. **Reliability**: Fallback mechanisms ensure data availability
5. **Monitoring**: Built-in cache status and management commands
6. **Flexibility**: Easy to adjust TTL and refresh strategies
7. **Organic Growth**: Cache grows naturally with roster changes

## Monitoring

- Use `@UKFFBot cache status` to check cache health
- Monitor console logs for cache hits/misses
- DynamoDB items include `cachedAt` timestamps for debugging

## Future Enhancements

1. **Automated Cache Warming**: Schedule periodic cache refreshes
2. **Season Detection**: Automatically detect new seasons and update bye weeks
3. **Cache Metrics**: Track cache hit rates and performance
4. **Partial Updates**: Update only changed player data instead of full refresh
