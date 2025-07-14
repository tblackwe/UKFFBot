# Requirements Document

## Introduction

The current last pick feature only displays the most recent draft pick when the `/lastpick` command is used. However, the draft monitor runs periodically, and multiple players can be drafted between monitor runs. This enhancement will update the last pick feature to display all players drafted since the last monitor update, providing users with a complete view of recent draft activity.

## Requirements

### Requirement 1

**User Story:** As a fantasy football league member, I want to see all players drafted since the last update when I use the `/lastpick` command, so that I don't miss any picks that happened between monitor runs.

#### Acceptance Criteria

1. WHEN the `/lastpick` command is executed AND multiple picks have occurred since the last monitor update THEN the system SHALL display all new picks in chronological order
2. WHEN displaying multiple picks THEN the system SHALL show each pick with its pick number, player name, position, and the user who made the pick
3. WHEN no new picks have occurred since the last update THEN the system SHALL display the most recent pick as it currently does
4. WHEN the draft has not started THEN the system SHALL display the appropriate "draft not started" message

### Requirement 2

**User Story:** As a fantasy football league member, I want the multi-pick display to be clearly formatted and easy to read, so that I can quickly understand all the recent draft activity.

#### Acceptance Criteria

1. WHEN displaying multiple picks THEN the system SHALL use a clear visual separator between each pick
2. WHEN showing multiple picks THEN the system SHALL include a header indicating how many new picks are being displayed
3. WHEN displaying picks THEN the system SHALL maintain the same formatting style as the current single pick display
4. WHEN showing the next picker information THEN the system SHALL display it only once at the end of the multi-pick message

### Requirement 3

**User Story:** As a fantasy football league member, I want the system to accurately track which picks are "new" since the last update, so that I see the correct set of recent picks.

#### Acceptance Criteria

1. WHEN the monitor updates the pick count THEN the system SHALL store the current pick count as the baseline for determining new picks
2. WHEN the `/lastpick` command is executed THEN the system SHALL compare the current pick count with the stored baseline to identify new picks
3. WHEN there are new picks to display THEN the system SHALL show picks from the stored baseline + 1 to the current pick count
4. WHEN the draft is complete THEN the system SHALL handle the end-of-draft scenario appropriately for multiple picks

### Requirement 4

**User Story:** As a system administrator, I want the multi-pick feature to maintain backward compatibility and error handling, so that existing functionality continues to work reliably.

#### Acceptance Criteria

1. WHEN the stored pick count data is missing or invalid THEN the system SHALL fall back to showing only the most recent pick
2. WHEN API calls fail during multi-pick retrieval THEN the system SHALL display appropriate error messages
3. WHEN the draft data is corrupted or incomplete THEN the system SHALL handle errors gracefully without crashing
4. WHEN the feature is disabled or unavailable THEN the system SHALL fall back to the original single-pick behavior