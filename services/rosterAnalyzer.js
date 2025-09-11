const { getLeagueRosters, getLeagueUsers, getNflState } = require('./sleeper.js');
const { getNflByeWeeksWithCache, getAllPlayersWithCache, getNflScheduleWithCache, hasTeamPlayedThisWeek } = require('./nflDataCache.js');

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
        const [rosters, users, cachedPlayers, byeWeeks, weekSchedule] = await Promise.all([
            getLeagueRosters(leagueId),
            getLeagueUsers(leagueId),
            getAllPlayersWithCache('nfl'),
            getNflByeWeeksWithCache(currentSeason),
            getNflScheduleWithCache(currentSeason, currentWeek)
        ]);

        // Check if we have missing players and need to fetch full data
        const allPlayerIds = new Set();
        rosters.forEach(roster => {
            if (roster.starters) {
                roster.starters.forEach(playerId => {
                    if (playerId && playerId !== '0' && playerId !== '') {
                        allPlayerIds.add(playerId);
                    }
                });
            }
        });

        // Check for missing players in cached data
        const missingPlayerIds = Array.from(allPlayerIds).filter(playerId => !cachedPlayers[playerId]);
        
        let allPlayers = cachedPlayers;
        
        // If we have missing players (likely IDP), fetch full player data
        if (missingPlayerIds.length > 0) {
            console.log(`[ROSTER_ANALYZER] Found ${missingPlayerIds.length} players not in cache, fetching full player data...`);
            const { getAllPlayers: sleeperGetAllPlayers } = require('./sleeper.js');
            allPlayers = await sleeperGetAllPlayers('nfl');
            console.log(`[ROSTER_ANALYZER] Using full player dataset with ${Object.keys(allPlayers).length} players`);
        }

        // Create user lookup map
        const userMap = {};
        users.forEach(user => {
            userMap[user.user_id] = user;
        });

        const rosterAnalysis = [];

        // Analyze each roster
        for (const roster of rosters) {
            const owner = userMap[roster.owner_id];
            const rosterIssues = analyzeRoster(roster, allPlayers, currentWeek, byeWeeks, weekSchedule);
            
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
 * @param {object[]} weekSchedule Array of game objects for the current week
 * @returns {object} Analysis of roster issues
 */
function analyzeRoster(roster, allPlayers, currentWeek, byeWeeks, weekSchedule) {
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

        // Skip players whose games have already been played this week
        if (hasTeamPlayedThisWeek(player.team, weekSchedule)) {
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
 * Formats the analysis results into a readable message using Slack blocks
 * @param {object} analysis The analysis results
 * @returns {object} Slack message payload with blocks and fallback text
 */
function formatAnalysisMessage(analysis) {
    if (analysis.rostersWithIssues === 0) {
        const successText = `✅ All ${analysis.totalRosters} starting lineups look good for Week ${analysis.currentWeek}! No issues found.`;
        
        return {
            text: successText,
            blocks: [
                {
                    "type": "section",
                    "text": { "type": "mrkdwn", "text": `:white_check_mark: *ROSTER CHECK - WEEK ${analysis.currentWeek}* :white_check_mark:` }
                },
                {
                    "type": "section",
                    "text": { "type": "mrkdwn", "text": `🎯 All ${analysis.totalRosters} starting lineups look good! No issues found. 🏆` }
                }
            ]
        };
    }

    // Build blocks for issues
    const blocks = [
        {
            "type": "section",
            "text": { "type": "mrkdwn", "text": `:warning: *ROSTER ALERT - WEEK ${analysis.currentWeek}* :warning:` }
        },
        {
            "type": "section",
            "text": { "type": "mrkdwn", "text": `⚠️ Found issues with *${analysis.rostersWithIssues}* out of *${analysis.totalRosters}* rosters:` }
        },
        { "type": "divider" }
    ];

    // Create fallback text
    let fallbackText = `Roster Alert - Week ${analysis.currentWeek}: Found issues with ${analysis.rostersWithIssues} out of ${analysis.totalRosters} rosters:\n\n`;

    for (const rosterIssue of analysis.rosterAnalysis) {
        // Add owner header
        blocks.push({
            "type": "section",
            "text": { "type": "mrkdwn", "text": `👤 *${rosterIssue.owner}*` }
        });

        fallbackText += `${rosterIssue.owner}:\n`;

        const issueFields = [];

        // Empty starting slots (critical)
        if (rosterIssue.issues.emptyStartingSlots.length > 0) {
            const emptySlots = rosterIssue.issues.emptyStartingSlots.map(slot => {
                if (slot.issue) {
                    return `${slot.position} (${slot.issue})`;
                }
                return `${slot.position} (Empty)`;
            }).join(', ');
            
            issueFields.push({
                "type": "mrkdwn",
                "text": `❌ *Empty Slots:* ${emptySlots}`
            });
            fallbackText += `  ❌ Empty Slots: ${emptySlots}\n`;
        }

        // Starting lineup bye week players (critical)
        if (rosterIssue.issues.startingByeWeekPlayers.length > 0) {
            const byePlayers = rosterIssue.issues.startingByeWeekPlayers.map(p => `${p.name} (${p.position}, ${p.team})`).join(', ');
            
            issueFields.push({
                "type": "mrkdwn",
                "text": `🏖️ *On Bye:* ${byePlayers}`
            });
            fallbackText += `  🏖️ On Bye: ${byePlayers}\n`;
        }

        // Starting lineup injured players (critical)
        if (rosterIssue.issues.startingInjuredPlayers.length > 0) {
            const injuredPlayers = rosterIssue.issues.startingInjuredPlayers.map(p => `${p.name} (${p.position}, ${p.injuryStatus})`).join(', ');
            
            issueFields.push({
                "type": "mrkdwn",
                "text": `🚑 *Injured:* ${injuredPlayers}`
            });
            fallbackText += `  🚑 Injured: ${injuredPlayers}\n`;
        }

        // Add fields to the block
        if (issueFields.length > 0) {
            blocks.push({
                "type": "section",
                "fields": issueFields
            });
        }

        // Add divider between rosters (except after the last one)
        if (rosterIssue !== analysis.rosterAnalysis[analysis.rosterAnalysis.length - 1]) {
            blocks.push({ "type": "divider" });
        }

        fallbackText += '\n';
    }

    // Add timestamp
    blocks.push(
        { "type": "divider" },
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": `⏰ Analysis completed at ${new Date(analysis.analyzedAt).toLocaleString()}`
                }
            ]
        }
    );

    fallbackText += `Analysis completed at ${new Date(analysis.analyzedAt).toLocaleString()}`;

    return {
        text: fallbackText,
        blocks: blocks
    };
}

module.exports = {
    analyzeLeagueRosters,
    analyzeRoster,
    analyzePlayer,
    formatAnalysisMessage,
    getPositionForSlot
};
