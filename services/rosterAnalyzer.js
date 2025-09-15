const { getLeagueRosters, getLeagueUsers, getNflState, getLeague } = require('./sleeper.js');
const { getNflByeWeeksWithCache, getPlayersFromCacheOrFetch, getNflScheduleWithCache, hasTeamPlayedThisWeek } = require('./nflDataCache.js');


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
        // Get league data and current NFL state
        const [league, nflState] = await Promise.all([
            getLeague(leagueId),
            getNflState()
        ]);
        
        const currentWeek = nflState.display_week || nflState.week;
        // Use the league's season, not the NFL state season
        const currentSeason = league.season;

        console.log(`[ROSTER_ANALYZER] Analyzing league ${leagueId} for season ${currentSeason}, week ${currentWeek}`);

        // Get league data and bye weeks/schedule data in parallel
        const [rosters, users, byeWeeks, weekSchedule] = await Promise.all([
            getLeagueRosters(leagueId),
            getLeagueUsers(leagueId),
            getNflByeWeeksWithCache(currentSeason),
            getNflScheduleWithCache(currentSeason, currentWeek)
        ]);

        // Create user lookup map
        const userMap = {};
        users.forEach(user => {
            userMap[user.user_id] = user;
        });

        // Check if this is a guillotine league by looking for empty rosters
        const isGuillotineLeague = detectGuillotineLeague(league, rosters);
        if (isGuillotineLeague) {
            console.log(`[ROSTER_ANALYZER] Detected guillotine league: ${league.name}`);
        }

        // NEW APPROACH: Collect ALL unique player IDs from ALL rosters first
        const allRosterPlayerIds = new Set();
        
        for (const roster of rosters) {
            // Skip empty rosters in guillotine leagues (eliminated teams)
            if (isGuillotineLeague && isEmptyRoster(roster)) {
                continue;
            }

            // Collect all player IDs from this roster (both starters and bench)
            const allRosterPlayers = [
                ...(roster.starters || []),
                ...(roster.players || [])
            ];
            
            for (const playerId of allRosterPlayers) {
                if (playerId && playerId !== '0' && playerId !== '') {
                    allRosterPlayerIds.add(playerId);
                }
            }
        }

        console.log(`[ROSTER_ANALYZER] Found ${allRosterPlayerIds.size} unique players across all rosters`);

        // Fetch ONLY the players that are on rosters (using new roster-based caching)
        const allPlayers = await getPlayersFromCacheOrFetch(Array.from(allRosterPlayerIds), 'nfl');
        console.log(`[ROSTER_ANALYZER] Retrieved ${Object.keys(allPlayers).length} players for analysis`);

        const rosterAnalysis = [];

        // Analyze each roster (now with only the players we actually need)
        for (const roster of rosters) {
            // Skip empty rosters in guillotine leagues (eliminated teams)
            if (isGuillotineLeague && isEmptyRoster(roster)) {
                console.log(`[ROSTER_ANALYZER] Skipping empty roster ${roster.roster_id} in guillotine league`);
                continue;
            }

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

        // Count active rosters for reporting purposes (exclude empty rosters in guillotine leagues)
        const activeRosters = isGuillotineLeague 
            ? rosters.filter(roster => !isEmptyRoster(roster)) 
            : rosters;

        return {
            leagueId,
            currentWeek,
            currentSeason,
            totalRosters: rosters.length,
            activeRosters: activeRosters.length,
            rostersWithIssues: rosterAnalysis.length,
            isGuillotineLeague,
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
    const rosterCount = analysis.activeRosters || analysis.totalRosters;
    const leagueTypeInfo = analysis.isGuillotineLeague ? " (Guillotine League)" : "";
    
    if (analysis.rostersWithIssues === 0) {
        const successText = `✅ All ${rosterCount} active starting lineups look good for Week ${analysis.currentWeek}! No issues found.${leagueTypeInfo}`;
        
        return {
            text: successText,
            blocks: [
                {
                    "type": "section",
                    "text": { "type": "mrkdwn", "text": `:white_check_mark: *ROSTER CHECK - WEEK ${analysis.currentWeek}*${leagueTypeInfo} :white_check_mark:` }
                },
                {
                    "type": "section",
                    "text": { "type": "mrkdwn", "text": `🎯 All ${rosterCount} active starting lineups look good! No issues found. 🏆` }
                }
            ]
        };
    }

    // Build blocks for issues
    const blocks = [
        {
            "type": "section",
            "text": { "type": "mrkdwn", "text": `:warning: *ROSTER ALERT - WEEK ${analysis.currentWeek}*${leagueTypeInfo} :warning:` }
        },
        {
            "type": "section",
            "text": { "type": "mrkdwn", "text": `⚠️ Found issues with *${analysis.rostersWithIssues}* out of *${rosterCount}* active rosters:` }
        },
        { "type": "divider" }
    ];

    // Create fallback text
    let fallbackText = `Roster Alert - Week ${analysis.currentWeek}${leagueTypeInfo}: Found issues with ${analysis.rostersWithIssues} out of ${rosterCount} active rosters:\n\n`;

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

/**
 * Detects if a league is a guillotine league by looking for empty rosters and league name patterns
 * @param {object} league The league object from Sleeper
 * @param {object[]} rosters Array of roster objects
 * @returns {boolean} True if this appears to be a guillotine league
 */
function detectGuillotineLeague(league, rosters) {
    // Check for empty rosters (primary indicator)
    const hasEmptyRosters = rosters.some(roster => isEmptyRoster(roster));
    
    // Check league name for guillotine-related keywords
    const guillotineKeywords = ['guillotine', 'chopping', 'elimination', 'survival', 'last man', 'survivor'];
    const leagueName = league.name ? league.name.toLowerCase() : '';
    const hasGuillotineName = guillotineKeywords.some(keyword => leagueName.includes(keyword));
    
    // Return true if we have empty rosters OR guillotine keywords in the name
    return hasEmptyRosters || hasGuillotineName;
}

/**
 * Checks if a roster is completely empty (no players)
 * @param {object} roster The roster object from Sleeper
 * @returns {boolean} True if the roster has no players
 */
function isEmptyRoster(roster) {
    return !roster.players || roster.players.length === 0;
}

module.exports = {
    analyzeLeagueRosters,
    analyzeRoster,
    analyzePlayer,
    formatAnalysisMessage,
    getPositionForSlot,
    detectGuillotineLeague,
    isEmptyRoster
};
