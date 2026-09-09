/**
 * Game-day roster-check gate.
 *
 * EventBridge polls this every 30 minutes. Kickoff times come from ESPN on
 * each poll so a flexed game is visible before the next clock check. Slack
 * is posted at most once per America/New_York calendar date, 3 hours before
 * that day's first kickoff.
 */

const { getNflState, getNflSchedule: fetchEspnSchedule } = require('./sleeper.js');
const { saveNflSchedule, tryClaimRosterCheck } = require('./datastore.js');
const logger = require('../shared/logger.js');

const NFL_TZ = 'America/New_York';
const LEAD_MS = 3 * 60 * 60 * 1000;
const MAX_WEEK = 22;

/**
 * Format a timestamp as YYYY-MM-DD in the NFL (Eastern) calendar.
 * @param {Date|string|number} date
 * @returns {string}
 */
function etDateString(date) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: NFL_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date(date));
}

/**
 * Earliest kickoff among games whose Eastern calendar date matches `etDate`.
 * @param {object[]} games
 * @param {string} etDate YYYY-MM-DD
 * @returns {Date|null}
 */
function firstKickoffOnDate(games, etDate) {
    if (!Array.isArray(games) || !etDate) {
        return null;
    }

    const kickoffs = games
        .filter((game) => game?.start_time && etDateString(game.start_time) === etDate)
        .map((game) => new Date(game.start_time))
        .filter((kickoff) => !Number.isNaN(kickoff.getTime()))
        .sort((a, b) => a.getTime() - b.getTime());

    return kickoffs[0] || null;
}

/**
 * Pure window check: run once in [firstKickoff - 3h, firstKickoff).
 * @param {{ now: Date, firstKickoff: Date|null, alreadyRan?: boolean }} params
 * @returns {boolean}
 */
function shouldRunRosterCheck({ now, firstKickoff, alreadyRan = false }) {
    if (alreadyRan || !firstKickoff) {
        return false;
    }
    const windowStart = new Date(firstKickoff.getTime() - LEAD_MS);
    return now >= windowStart && now < firstKickoff;
}

function adjacentWeeks(week) {
    const current = parseInt(week, 10);
    if (!Number.isInteger(current)) {
        return [];
    }
    return [current - 1, current, current + 1].filter((w) => w >= 1 && w <= MAX_WEEK);
}

/**
 * Live ESPN scoreboards for the current week and its neighbours, write-through
 * to DynamoDB so roster analysis can reuse the data. Failures on a single week
 * are ignored so a 404 on week 0/19 does not skip the gate.
 * @param {number} season
 * @param {number} week
 * @returns {Promise<object[]>}
 */
async function loadUpcomingGames(season, week) {
    const weeks = adjacentWeeks(week);
    const results = await Promise.allSettled(weeks.map(async (w) => {
        const games = await fetchEspnSchedule(season, w);
        if (Array.isArray(games) && games.length > 0) {
            try {
                await saveNflSchedule(season, w, games);
            } catch (error) {
                logger.warn('Failed to write-through NFL schedule cache', {
                    season,
                    week: w,
                    error
                });
            }
        }
        return Array.isArray(games) ? games : [];
    }));

    return results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
}

function skip(reason, extra = {}) {
    return { shouldRun: false, reason, ...extra };
}

/**
 * Decide whether this poll should post a roster check. Claims the DynamoDB
 * lock when the window is open so concurrent polls cannot double-post.
 * @param {Date} [now]
 * @returns {Promise<{shouldRun: boolean, reason: string, etDate?: string, firstKickoff?: Date}>}
 */
async function evaluateRosterCheck(now = new Date()) {
    let nflState;
    try {
        nflState = await getNflState();
    } catch (error) {
        logger.error('Failed to load NFL state for roster-check gate', { error });
        return skip('nfl_state_error');
    }

    const seasonType = nflState?.season_type;
    if (seasonType !== 'regular' && seasonType !== 'post') {
        return skip('off_season', { seasonType });
    }

    const season = parseInt(nflState.season, 10);
    const week = parseInt(nflState.display_week || nflState.week, 10);
    const etDate = etDateString(now);

    let games;
    try {
        games = await loadUpcomingGames(season, week);
    } catch (error) {
        logger.error('Failed to load NFL schedule for roster-check gate', { error, season, week });
        return skip('schedule_error', { etDate, season, week });
    }

    const firstKickoff = firstKickoffOnDate(games, etDate);
    if (!firstKickoff) {
        return skip('no_games', { etDate, season, week });
    }

    if (now < new Date(firstKickoff.getTime() - LEAD_MS)) {
        return skip('too_early', { etDate, firstKickoff: firstKickoff.toISOString(), season, week });
    }
    if (now >= firstKickoff) {
        return skip('too_late', { etDate, firstKickoff: firstKickoff.toISOString(), season, week });
    }

    const claimed = await tryClaimRosterCheck(etDate);
    if (!claimed) {
        return skip('already_ran', { etDate, firstKickoff: firstKickoff.toISOString() });
    }

    return {
        shouldRun: true,
        reason: 'run',
        etDate,
        firstKickoff,
        season,
        week
    };
}

module.exports = {
    NFL_TZ,
    LEAD_MS,
    etDateString,
    firstKickoffOnDate,
    shouldRunRosterCheck,
    adjacentWeeks,
    loadUpcomingGames,
    evaluateRosterCheck
};
