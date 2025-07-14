/**
 * Utility functions for pick range calculation and validation
 */

/**
 * Extracts new picks from the full picks array since the last known pick count
 * @param {Array} picks - Array of all picks from Sleeper API
 * @param {number} lastKnownPickCount - The last known pick count from datastore
 * @returns {Object} Object containing new picks and metadata
 */
function getNewPicksSinceLastUpdate(picks, lastKnownPickCount) {
  // Validate inputs
  if (!Array.isArray(picks)) {
    throw new Error('Picks must be an array');
  }
  
  if (typeof lastKnownPickCount !== 'number' || lastKnownPickCount < 0 || !Number.isInteger(lastKnownPickCount)) {
    throw new Error('Last known pick count must be a non-negative number');
  }

  const currentPickCount = picks.length;
  
  // If no new picks, return empty result
  if (currentPickCount <= lastKnownPickCount) {
    return {
      newPicks: [],
      startIndex: lastKnownPickCount,
      endIndex: lastKnownPickCount,
      count: 0,
      hasNewPicks: false
    };
  }

  // Extract new picks (picks array is 0-indexed, so lastKnownPickCount is the start index)
  const newPicks = picks.slice(lastKnownPickCount);
  
  return {
    newPicks,
    startIndex: lastKnownPickCount,
    endIndex: currentPickCount - 1,
    count: newPicks.length,
    hasNewPicks: true
  };
}

/**
 * Validates pick data integrity and handles edge cases
 * @param {Array} picks - Array of picks to validate
 * @param {number} lastKnownPickCount - The last known pick count
 * @returns {Object} Validation result with isValid flag and error message
 */
function validatePickData(picks, lastKnownPickCount) {
  // Check if picks is an array
  if (!Array.isArray(picks)) {
    return {
      isValid: false,
      error: 'Picks data must be an array'
    };
  }

  // Check if lastKnownPickCount is valid (must be a non-negative integer)
  if (typeof lastKnownPickCount !== 'number' || lastKnownPickCount < 0 || !Number.isInteger(lastKnownPickCount)) {
    return {
      isValid: false,
      error: 'Last known pick count must be a non-negative number'
    };
  }

  // Check if picks are in chronological order (pick_no should be sequential)
  for (let i = 1; i < picks.length; i++) {
    if (!picks[i].pick_no || !picks[i-1].pick_no) {
      return {
        isValid: false,
        error: 'Pick data is missing pick_no field'
      };
    }
    
    if (picks[i].pick_no <= picks[i-1].pick_no) {
      return {
        isValid: false,
        error: 'Picks are not in chronological order'
      };
    }
  }

  // Check if each pick has required metadata
  for (let i = 0; i < picks.length; i++) {
    const pick = picks[i];
    if (!pick.metadata || !pick.picked_by || !pick.round) {
      return {
        isValid: false,
        error: `Pick at index ${i} is missing required fields (metadata, picked_by, or round)`
      };
    }
  }

  // Check if lastKnownPickCount is reasonable compared to current picks
  if (lastKnownPickCount > picks.length) {
    return {
      isValid: false,
      error: 'Last known pick count is greater than current pick count'
    };
  }

  return {
    isValid: true,
    error: null
  };
}

module.exports = {
  getNewPicksSinceLastUpdate,
  validatePickData
};