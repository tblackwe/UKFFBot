const { getLeagueRosters, getLeagueUsers, getNflState } = require('./sleeper.js');
const { getNflByeWeeksWithCache, getAllPlayersWithCache } = require('./nflDataCache.js');

/**
 * Position mappings for fantasy relevance
 */
const FANTASY_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

/**
 * Injury status mappings - only serious injuries that should be flagged
 */
const INJURY_STATUS = {
    'Out': 'OUT',
    'Doubtful': 'DOUBTFUL', 
    'IR': 'IR',
    'PUP': 'PUP',
    'COV': 'COVID',
    'Sus': 'SUSPENDED'
    // Note: 'Questionable' is excluded as these players often play
};

/**
 * Analyzes all rosters in a league for potential issues
 * @param {string} leagueId The league ID to analyze
 * @returns {Promise<object>} Analysis results with roster issues
 */
async function analyzeLeagueRosters(leagueId) {
    try {
        // Get current NFL state to determine current week
        const nflState = await getNflState();
        const currentWeek = nflState.display_week || nflState.week;
        const currentSeason = nflState.season;

        // Get league data and cached NFL data in parallel
        const [rosters, users, allPlayers, byeWeeks] = await Promise.all([
            getLeagueRosters(leagueId),
            getLeagueUsers(leagueId),
            getAllPlayersWithCache('nfl'),
            getNflByeWeeksWithCache(currentSeason)
        ]);

        // Create user lookup map
        const userMap = {};
        users.forEach(user => {
            userMap[user.user_id] = user;
        });

        const rosterAnalysis = [];

        // Analyze each roster
        for (const roster of rosters) {
            const owner = userMap[roster.owner_id];
            const rosterIssues = analyzeRoster(roster, allPlayers, currentWeek, byeWeeks);
            
            if (rosterIssues.hasIssues) {
                rosterAnalysis.push({
                    owner: owner ? owner.display_name || owner.username : 'Unknown Owner',
                    ownerId: roster.owner_id,
                    rosterId: roster.roster_id,
                    issues: rosterIssues
                });
            }
        }

        return {
            leagueId,
            currentWeek,
            currentSeason,
            totalRosters: rosters.length,
            rostersWithIssues: rosterAnalysis.length,
            rosterAnalysis,
            analyzedAt: new Date().toISOString()
        };

    } catch (error) {
        console.error('Error analyzing league rosters:', error);
        throw error;
    }
}

/**
 * Analyzes a single roster for issues
 * @param {object} roster The roster object from Sleeper
 * @param {object} allPlayers All players data from Sleeper
 * @param {number} currentWeek Current NFL week
 * @param {object} byeWeeks NFL bye weeks mapping for current season
 * @returns {object} Analysis of roster issues
 */
function analyzeRoster(roster, allPlayers, currentWeek, byeWeeks) {
    const issues = {
        startingByeWeekPlayers: [],
        startingInjuredPlayers: [],
        emptyStartingSlots: [],
        hasIssues: false
    };

    // Get starting lineup player IDs
    const startingLineup = roster.starters || [];
    
    // Analyze only starting lineup
    for (let i = 0; i < startingLineup.length; i++) {
        const playerId = startingLineup[i];
        
        // Check for empty starting slots
        if (!playerId || playerId === '0' || playerId === '') {
            issues.emptyStartingSlots.push({
                slotIndex: i + 1,
                position: getPositionForSlot(i) // Helper function to determine position
            });
            continue;
        }
        
        const player = allPlayers[playerId];
        if (!player) {
            // Player not found in database - treat as empty slot
            issues.emptyStartingSlots.push({
                slotIndex: i + 1,
                position: getPositionForSlot(i),
                issue: 'Player not found'
            });
            continue;
        }

        const playerIssues = analyzePlayer(player, currentWeek, byeWeeks);

        // Check for bye week (only starting players)
        if (playerIssues.onBye) {
            issues.startingByeWeekPlayers.push({
                playerId,
                name: player.full_name || `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown Player',
                position: player.position,
                team: player.team,
                slotIndex: i + 1
            });
        }

        // Check for injury (only starting players)
        if (playerIssues.injured) {
            issues.startingInjuredPlayers.push({
                playerId,
                name: player.full_name || `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown Player',
                position: player.position,
                team: player.team,
                injuryStatus: playerIssues.injuryStatus,
                slotIndex: i + 1
            });
        }
    }

    // Determine if there are any issues
    issues.hasIssues = issues.startingByeWeekPlayers.length > 0 || 
                       issues.startingInjuredPlayers.length > 0 ||
                       issues.emptyStartingSlots.length > 0;

    return issues;
}

/**
 * Helper function to determine position for a starting slot
 * This is a general mapping - actual leagues may have different configurations
 * @param {number} slotIndex The index of the starting slot (0-based)
 * @returns {string} The likely position for this slot
 */
function getPositionForSlot(slotIndex) {
    // Common fantasy lineup order: QB, RB, RB, WR, WR, TE, FLEX, K, DEF
    const commonPositions = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'];
    return commonPositions[slotIndex] || `Slot ${slotIndex + 1}`;
}

/**
 * Analyzes a single player for issues
 * @param {object} player Player data from Sleeper
 * @param {number} currentWeek Current NFL week
 * @param {object} byeWeeks NFL bye weeks mapping for current season
 * @returns {object} Player analysis
 */
function analyzePlayer(player, currentWeek, byeWeeks) {
    const analysis = {
        onBye: false,
        injured: false,
        injuryStatus: null
    };

    // Check if player is on bye week using cached bye weeks data
    if (player.team && byeWeeks[player.team] === currentWeek) {
        analysis.onBye = true;
    }

    // Check injury status - exclude QUESTIONABLE players as they often play
    if (player.injury_status && 
        player.injury_status !== 'Healthy' && 
        player.injury_status !== 'Questionable') {
        analysis.injured = true;
        analysis.injuryStatus = INJURY_STATUS[player.injury_status] || player.injury_status;
    }

    return analysis;
}

/**
 * Formats the analysis results into a readable message
 * @param {object} analysis The analysis results
 * @returns {string} Formatted message
 */
function formatAnalysisMessage(analysis) {
    if (analysis.rostersWithIssues === 0) {
        return `✅ 🏈 ROSTER CHECK - WEEK ${analysis.currentWeek} 🏈\n\n🎯 All ${analysis.totalRosters} starting lineups look good! No issues found. �`;
    }

    const messages = [`🔍 STARTING LINEUP ANALYSIS - WEEK ${analysis.currentWeek}\n`];
    messages.push(`⚠️ Found issues with ${analysis.rostersWithIssues} out of ${analysis.totalRosters} rosters:\n`);

    for (const rosterIssue of analysis.rosterAnalysis) {
        messages.push(`*${rosterIssue.owner}:*`);

        // Empty starting slots (critical)
        if (rosterIssue.issues.emptyStartingSlots.length > 0) {
            const emptySlots = rosterIssue.issues.emptyStartingSlots.map(slot => {
                if (slot.issue) {
                    return `${slot.position} (${slot.issue})`;
                }
                return `${slot.position} (Empty)`;
            }).join(', ');
            messages.push(`  ❌ EMPTY STARTING SLOTS: ${emptySlots}`);
        }

        // Starting lineup bye week players (critical)
        if (rosterIssue.issues.startingByeWeekPlayers.length > 0) {
            messages.push(`  🏖️ STARTING PLAYERS ON BYE: ${rosterIssue.issues.startingByeWeekPlayers.map(p => `${p.name} (${p.position}, ${p.team})`).join(', ')}`);
        }

        // Starting lineup injured players (critical)
        if (rosterIssue.issues.startingInjuredPlayers.length > 0) {
            messages.push(`  🚑 STARTING INJURED PLAYERS: ${rosterIssue.issues.startingInjuredPlayers.map(p => `${p.name} (${p.position}, ${p.injuryStatus})`).join(', ')}`);
        }

        messages.push(''); // Empty line between rosters
    }

    messages.push(`⏰ Analysis completed at ${new Date(analysis.analyzedAt).toLocaleString()} UTC`);

    return messages.join('\n');
}

module.exports = {
    analyzeLeagueRosters,
    analyzeRoster,
    analyzePlayer,
    formatAnalysisMessage,
    getPositionForSlot
};
