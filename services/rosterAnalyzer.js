const { getLeagueRosters, getLeagueUsers, getAllPlayers, getNflState } = require('./sleeper.js');

/**
 * NFL teams and their bye weeks for 2025 season
 * This should be updated each season
 */
const NFL_BYE_WEEKS_2025 = {
    // Week 5 byes
    'DET': 5, 'LAC': 5, 'PHI': 5, 'TEN': 5,
    // Week 6 byes  
    'KC': 6, 'LAR': 6, 'MIA': 6, 'MIN': 6,
    // Week 7 byes
    'CHI': 7, 'DAL': 7,
    // Week 9 byes
    'CLE': 9, 'GB': 9, 'LV': 9, 'SEA': 9,
    // Week 10 byes
    'ATL': 10, 'DEN': 10, 'IND': 10, 'NE': 10,
    // Week 11 byes
    'BAL': 11, 'HOU': 11, 'WAS': 11, 'NYJ': 11,
    // Week 12 byes
    'ARI': 12, 'CAR': 12, 'NYG': 12, 'TB': 12,
    // Week 14 byes
    'BUF': 14, 'CIN': 14, 'JAX': 14, 'NO': 14, 'PIT': 14, 'SF': 14
};

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

        // Get league data
        const [rosters, users, allPlayers] = await Promise.all([
            getLeagueRosters(leagueId),
            getLeagueUsers(leagueId),
            getAllPlayers('nfl')
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
            const rosterIssues = analyzeRoster(roster, allPlayers, currentWeek);
            
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
 * @returns {object} Analysis of roster issues
 */
function analyzeRoster(roster, allPlayers, currentWeek) {
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

        const playerIssues = analyzePlayer(player, currentWeek);

        // Check for bye week (only starting players)
        if (playerIssues.onBye) {
            issues.startingByeWeekPlayers.push({
                playerId,
                name: `${player.first_name} ${player.last_name}`,
                position: player.position,
                team: player.team,
                slotIndex: i + 1
            });
        }

        // Check for injury (only starting players)
        if (playerIssues.injured) {
            issues.startingInjuredPlayers.push({
                playerId,
                name: `${player.first_name} ${player.last_name}`,
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
 * @returns {object} Player analysis
 */
function analyzePlayer(player, currentWeek) {
    const analysis = {
        onBye: false,
        injured: false,
        injuryStatus: null
    };

    // Check if player is on bye week
    if (player.team && NFL_BYE_WEEKS_2025[player.team] === currentWeek) {
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
        return `✅ **League Roster Check - Week ${analysis.currentWeek}**\n\nAll ${analysis.totalRosters} starting lineups look good! No issues found. 🏈`;
    }

    const messages = [`🔍 **League Starting Lineup Analysis - Week ${analysis.currentWeek}**\n`];
    messages.push(`Found starting lineup issues with **${analysis.rostersWithIssues}** out of **${analysis.totalRosters}** rosters:\n`);

    for (const rosterIssue of analysis.rosterAnalysis) {
        messages.push(`**${rosterIssue.owner}:**`);

        // Empty starting slots (critical)
        if (rosterIssue.issues.emptyStartingSlots.length > 0) {
            const emptySlots = rosterIssue.issues.emptyStartingSlots.map(slot => {
                if (slot.issue) {
                    return `${slot.position} (${slot.issue})`;
                }
                return `${slot.position} (Empty)`;
            }).join(', ');
            messages.push(`  ❌ **Empty starting slots:** ${emptySlots}`);
        }

        // Starting lineup bye week players (critical)
        if (rosterIssue.issues.startingByeWeekPlayers.length > 0) {
            messages.push(`  ⚠️ **Starting players on BYE:** ${rosterIssue.issues.startingByeWeekPlayers.map(p => `${p.name} (${p.position}, ${p.team})`).join(', ')}`);
        }

        // Starting lineup injured players (critical)
        if (rosterIssue.issues.startingInjuredPlayers.length > 0) {
            messages.push(`  🚑 **Starting injured players:** ${rosterIssue.issues.startingInjuredPlayers.map(p => `${p.name} (${p.position}, ${p.injuryStatus})`).join(', ')}`);
        }

        messages.push(''); // Empty line between rosters
    }

    messages.push(`*Analysis completed at ${new Date(analysis.analyzedAt).toLocaleString()}*`);

    return messages.join('\n');
}

module.exports = {
    analyzeLeagueRosters,
    analyzeRoster,
    analyzePlayer,
    formatAnalysisMessage,
    getPositionForSlot,
    NFL_BYE_WEEKS_2025
};
