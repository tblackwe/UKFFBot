/**
 * ESPN data access for NFL bye weeks.
 *
 * Bye weeks are derived from ESPN's core API, which lists `teamsOnBye` per week.
 * This is the live source of truth used by the cache layer; the hardcoded tables
 * in nflDataCache.js are only a fallback when ESPN is unavailable or invalid.
 */

const { resilientFetch } = require('./sleeper.js');
const { mapEspnToSleeperTeam } = require('../shared/teamMappings.js');

// ESPN core API numeric team id -> abbreviation (verified against the ESPN API).
const ESPN_TEAM_ID_TO_ABBR = {
    1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET',
    9: 'GB', 10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR', 15: 'MIA', 16: 'MIN',
    17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ', 21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC',
    25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WSH', 29: 'CAR', 30: 'JAX', 33: 'BAL', 34: 'HOU'
};

const NFL_TEAM_COUNT = 32;
const REGULAR_SEASON_WEEKS = 18;

/**
 * Fetch the teams on bye for a single week from the ESPN core API.
 * @param {string|number} season The season year.
 * @param {number} week The week number (1-18).
 * @returns {Promise<string[]>} Team abbreviations (Sleeper format) on bye that week.
 */
async function fetchWeekByes(season, week) {
    const url = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${season}/types/2/weeks/${week}`;
    const response = await resilientFetch(url, { label: `ESPN byes wk${week}` });
    if (!response.ok) {
        throw new Error(`ESPN bye-week request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const teams = [];
    for (const ref of data.teamsOnBye || []) {
        const teamId = ref.$ref?.match(/teams\/(\d+)/)?.[1];
        const abbr = teamId && ESPN_TEAM_ID_TO_ABBR[teamId];
        if (abbr) {
            teams.push(mapEspnToSleeperTeam(abbr));
        }
    }
    return teams;
}

/**
 * Fetch and validate the full NFL bye-week map for a season from ESPN.
 * Weeks are fetched in parallel. Throws if the result is incomplete so callers
 * can fall back to hardcoded data rather than serve a partial/invalid map.
 * @param {string|number} season The season year (e.g. 2026).
 * @returns {Promise<object>} Map of team abbreviation (Sleeper format) -> bye week.
 * @throws {Error} if ESPN data is incomplete (not all 32 teams accounted for).
 */
async function fetchNflByeWeeks(season) {
    const weeks = Array.from({ length: REGULAR_SEASON_WEEKS }, (_, i) => i + 1);
    const results = await Promise.allSettled(weeks.map((week) => fetchWeekByes(season, week)));

    const byeWeeks = {};
    results.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
            for (const team of result.value) {
                byeWeeks[team] = idx + 1;
            }
        }
    });

    const teamsFound = Object.keys(byeWeeks).length;
    if (teamsFound !== NFL_TEAM_COUNT) {
        throw new Error(`ESPN bye weeks incomplete for ${season}: ${teamsFound}/${NFL_TEAM_COUNT} teams`);
    }

    return byeWeeks;
}

module.exports = {
    fetchNflByeWeeks,
    ESPN_TEAM_ID_TO_ABBR
};
