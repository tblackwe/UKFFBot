# Implementation Plan

- [x] 1. Create utility functions for pick range calculation

  - Implement `getNewPicksSinceLastUpdate(picks, lastKnownPickCount)` function to extract new picks from full picks array
  - Add validation logic to ensure pick data integrity and handle edge cases
  - Write unit tests for pick range calculation with various scenarios (0, 1, multiple new picks)
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 2. Implement multi-pick message generation

  - Create `generateMultiPickMessagePayload(draft, picks, newPicksStartIndex, data, notifyNextPicker)` function
  - Format multiple picks using Slack block kit with clear visual separators between picks
  - Include header indicating number of new picks being displayed
  - Reuse existing pick formatting logic for individual pick display
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3_

- [x] 3. Add pick data validation and error handling

  - Implement `validatePickData(picks, lastKnownPickCount)` function to validate input data
  - Add error handling for missing or invalid `last_known_pick_count` data
  - Implement graceful fallback to single-pick display when validation fails
  - Write unit tests for validation logic and error scenarios
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 4. Modify lastpick command handler logic

  - Update `handleLastPickCommand` function to determine when to use multi-pick vs single-pick display
  - Add logic to compare current pick count with stored baseline from datastore
  - Implement decision tree for choosing appropriate message format
  - Ensure backward compatibility with existing single-pick behavior
  - _Requirements: 1.1, 3.2, 4.4_

- [x] 5. Add configuration and limits for multi-pick display

  - Define `MULTI_PICK_CONFIG` constants for maximum picks to show and feature flags
  - Implement message size limiting to prevent Slack message overflow
  - Add logic to truncate pick list with "and X more" message when needed
  - Write tests for configuration limits and message truncation
  - _Requirements: 2.1, 4.1_

- [x] 6. Create comprehensive unit tests for multi-pick functionality

  - Write tests for `getNewPicksSinceLastUpdate` with edge cases and invalid inputs
  - Test `generateMultiPickMessagePayload` with various pick count scenarios
  - Create test cases for error handling and fallback behavior
  - Test integration between pick calculation and message generation
  - _Requirements: 1.1, 1.2, 3.1, 3.2, 4.1, 4.2_

- [x] 7. Add integration tests for end-to-end command flow

  - Test `/lastpick` command with multiple new picks scenario
  - Test command with single new pick (should use existing format)
  - Test command with no new picks since last update
  - Test error scenarios with API failures and data corruption
  - _Requirements: 1.1, 1.4, 4.2, 4.3_

- [x] 8. Update existing tests to ensure backward compatibility
  - Verify existing `generatePickMessagePayload` function still works correctly
  - Update existing lastpick handler tests to cover new logic paths
  - Ensure no regression in single-pick display functionality
  - Test fallback behavior when multi-pick feature is disabled
  - _Requirements: 4.4_
