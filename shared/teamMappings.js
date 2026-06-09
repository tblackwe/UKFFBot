/**
 * Single source of truth for NFL team abbreviation differences between providers.
 * Sleeper uses 'WAS' for Washington; ESPN uses 'WSH'. Add future mismatches here.
 */
const SLEEPER_TO_ESPN = {
    WAS: 'WSH'
};

const ESPN_TO_SLEEPER = Object.fromEntries(
    Object.entries(SLEEPER_TO_ESPN).map(([sleeper, espn]) => [espn, sleeper])
);

/**
 * Map a Sleeper team abbreviation to ESPN's abbreviation.
 * @param {string} sleeperTeam Team abbreviation in Sleeper format.
 * @returns {string} The ESPN abbreviation (unchanged if no mapping needed).
 */
function mapSleeperToEspnTeam(sleeperTeam) {
    return SLEEPER_TO_ESPN[sleeperTeam] || sleeperTeam;
}

/**
 * Map an ESPN team abbreviation to Sleeper's abbreviation.
 * @param {string} espnTeam Team abbreviation in ESPN format.
 * @returns {string} The Sleeper abbreviation (unchanged if no mapping needed).
 */
function mapEspnToSleeperTeam(espnTeam) {
    return ESPN_TO_SLEEPER[espnTeam] || espnTeam;
}

module.exports = {
    SLEEPER_TO_ESPN,
    ESPN_TO_SLEEPER,
    mapSleeperToEspnTeam,
    mapEspnToSleeperTeam
};
