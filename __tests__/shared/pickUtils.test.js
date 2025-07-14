const { getNewPicksSinceLastUpdate, validatePickData } = require('../../shared/pickUtils.js');

describe('pickUtils', () => {
  // Sample pick data for testing
  const samplePicks = [
    {
      pick_no: 1,
      round: 1,
      picked_by: 'user1',
      metadata: { first_name: 'Player', last_name: 'One', position: 'RB' }
    },
    {
      pick_no: 2,
      round: 1,
      picked_by: 'user2',
      metadata: { first_name: 'Player', last_name: 'Two', position: 'WR' }
    },
    {
      pick_no: 3,
      round: 1,
      picked_by: 'user3',
      metadata: { first_name: 'Player', last_name: 'Three', position: 'QB' }
    },
    {
      pick_no: 4,
      round: 2,
      picked_by: 'user4',
      metadata: { first_name: 'Player', last_name: 'Four', position: 'TE' }
    }
  ];

  describe('getNewPicksSinceLastUpdate', () => {
    it('should return empty result when no new picks', () => {
      const result = getNewPicksSinceLastUpdate(samplePicks, 4);
      
      expect(result).toEqual({
        newPicks: [],
        startIndex: 4,
        endIndex: 4,
        count: 0,
        hasNewPicks: false
      });
    });

    it('should return single new pick when one pick added', () => {
      const result = getNewPicksSinceLastUpdate(samplePicks, 3);
      
      expect(result).toEqual({
        newPicks: [samplePicks[3]],
        startIndex: 3,
        endIndex: 3,
        count: 1,
        hasNewPicks: true
      });
    });

    it('should return multiple new picks when multiple picks added', () => {
      const result = getNewPicksSinceLastUpdate(samplePicks, 1);
      
      expect(result).toEqual({
        newPicks: [samplePicks[1], samplePicks[2], samplePicks[3]],
        startIndex: 1,
        endIndex: 3,
        count: 3,
        hasNewPicks: true
      });
    });

    it('should handle zero as last known pick count (all picks are new)', () => {
      const result = getNewPicksSinceLastUpdate(samplePicks, 0);
      
      expect(result).toEqual({
        newPicks: samplePicks,
        startIndex: 0,
        endIndex: 3,
        count: 4,
        hasNewPicks: true
      });
    });

    it('should handle empty picks array', () => {
      const result = getNewPicksSinceLastUpdate([], 0);
      
      expect(result).toEqual({
        newPicks: [],
        startIndex: 0,
        endIndex: 0,
        count: 0,
        hasNewPicks: false
      });
    });

    it('should handle case where last known pick count equals current picks', () => {
      const result = getNewPicksSinceLastUpdate(samplePicks, 4);
      
      expect(result).toEqual({
        newPicks: [],
        startIndex: 4,
        endIndex: 4,
        count: 0,
        hasNewPicks: false
      });
    });

    it('should throw error for invalid picks parameter', () => {
      expect(() => getNewPicksSinceLastUpdate(null, 1)).toThrow('Picks must be an array');
      expect(() => getNewPicksSinceLastUpdate('not an array', 1)).toThrow('Picks must be an array');
      expect(() => getNewPicksSinceLastUpdate(undefined, 1)).toThrow('Picks must be an array');
    });

    it('should throw error for invalid lastKnownPickCount parameter', () => {
      expect(() => getNewPicksSinceLastUpdate(samplePicks, -1)).toThrow('Last known pick count must be a non-negative number');
      expect(() => getNewPicksSinceLastUpdate(samplePicks, 'not a number')).toThrow('Last known pick count must be a non-negative number');
      expect(() => getNewPicksSinceLastUpdate(samplePicks, null)).toThrow('Last known pick count must be a non-negative number');
      expect(() => getNewPicksSinceLastUpdate(samplePicks, undefined)).toThrow('Last known pick count must be a non-negative number');
    });

    // Additional comprehensive edge case tests
    it('should throw error for float lastKnownPickCount', () => {
      expect(() => getNewPicksSinceLastUpdate(samplePicks, 1.5)).toThrow('Last known pick count must be a non-negative number');
      expect(() => getNewPicksSinceLastUpdate(samplePicks, 2.7)).toThrow('Last known pick count must be a non-negative number');
    });

    it('should throw error for NaN lastKnownPickCount', () => {
      expect(() => getNewPicksSinceLastUpdate(samplePicks, NaN)).toThrow('Last known pick count must be a non-negative number');
    });

    it('should throw error for Infinity lastKnownPickCount', () => {
      expect(() => getNewPicksSinceLastUpdate(samplePicks, Infinity)).toThrow('Last known pick count must be a non-negative number');
      expect(() => getNewPicksSinceLastUpdate(samplePicks, -Infinity)).toThrow('Last known pick count must be a non-negative number');
    });

    it('should throw error for object as picks parameter', () => {
      expect(() => getNewPicksSinceLastUpdate({}, 1)).toThrow('Picks must be an array');
      expect(() => getNewPicksSinceLastUpdate({ length: 2 }, 1)).toThrow('Picks must be an array');
    });

    it('should throw error for number as picks parameter', () => {
      expect(() => getNewPicksSinceLastUpdate(123, 1)).toThrow('Picks must be an array');
    });

    it('should throw error for boolean as picks parameter', () => {
      expect(() => getNewPicksSinceLastUpdate(true, 1)).toThrow('Picks must be an array');
      expect(() => getNewPicksSinceLastUpdate(false, 1)).toThrow('Picks must be an array');
    });

    it('should handle large lastKnownPickCount greater than picks length', () => {
      const result = getNewPicksSinceLastUpdate(samplePicks, 100);
      
      expect(result).toEqual({
        newPicks: [],
        startIndex: 100,
        endIndex: 100,
        count: 0,
        hasNewPicks: false
      });
    });

    it('should handle single pick array with zero lastKnownPickCount', () => {
      const singlePick = [samplePicks[0]];
      const result = getNewPicksSinceLastUpdate(singlePick, 0);
      
      expect(result).toEqual({
        newPicks: singlePick,
        startIndex: 0,
        endIndex: 0,
        count: 1,
        hasNewPicks: true
      });
    });

    it('should handle single pick array with lastKnownPickCount equal to length', () => {
      const singlePick = [samplePicks[0]];
      const result = getNewPicksSinceLastUpdate(singlePick, 1);
      
      expect(result).toEqual({
        newPicks: [],
        startIndex: 1,
        endIndex: 1,
        count: 0,
        hasNewPicks: false
      });
    });

    it('should correctly calculate endIndex for multiple new picks', () => {
      const result = getNewPicksSinceLastUpdate(samplePicks, 2);
      
      expect(result.startIndex).toBe(2);
      expect(result.endIndex).toBe(3); // Last index in array
      expect(result.count).toBe(2);
      expect(result.newPicks).toEqual([samplePicks[2], samplePicks[3]]);
    });

    it('should handle array-like objects that are not arrays', () => {
      const arrayLike = { 0: 'pick1', 1: 'pick2', length: 2 };
      expect(() => getNewPicksSinceLastUpdate(arrayLike, 1)).toThrow('Picks must be an array');
    });
  });

  describe('validatePickData', () => {
    it('should validate correct pick data', () => {
      const result = validatePickData(samplePicks, 2);
      
      expect(result).toEqual({
        isValid: true,
        error: null
      });
    });

    it('should reject non-array picks', () => {
      const result = validatePickData(null, 1);
      
      expect(result).toEqual({
        isValid: false,
        error: 'Picks data must be an array'
      });
    });

    it('should reject string as picks parameter', () => {
      const result = validatePickData('not an array', 1);
      
      expect(result).toEqual({
        isValid: false,
        error: 'Picks data must be an array'
      });
    });

    it('should reject undefined as picks parameter', () => {
      const result = validatePickData(undefined, 1);
      
      expect(result).toEqual({
        isValid: false,
        error: 'Picks data must be an array'
      });
    });

    it('should reject object as picks parameter', () => {
      const result = validatePickData({}, 1);
      
      expect(result).toEqual({
        isValid: false,
        error: 'Picks data must be an array'
      });
    });

    it('should reject invalid lastKnownPickCount', () => {
      let result = validatePickData(samplePicks, -1);
      expect(result).toEqual({
        isValid: false,
        error: 'Last known pick count must be a non-negative number'
      });

      result = validatePickData(samplePicks, 'invalid');
      expect(result).toEqual({
        isValid: false,
        error: 'Last known pick count must be a non-negative number'
      });
    });

    it('should reject null as lastKnownPickCount', () => {
      const result = validatePickData(samplePicks, null);
      
      expect(result).toEqual({
        isValid: false,
        error: 'Last known pick count must be a non-negative number'
      });
    });

    it('should reject undefined as lastKnownPickCount', () => {
      const result = validatePickData(samplePicks, undefined);
      
      expect(result).toEqual({
        isValid: false,
        error: 'Last known pick count must be a non-negative number'
      });
    });

    it('should reject float as lastKnownPickCount', () => {
      const result = validatePickData(samplePicks, 1.5);
      
      expect(result).toEqual({
        isValid: false,
        error: 'Last known pick count must be a non-negative number'
      });
    });

    it('should reject picks not in chronological order', () => {
      const invalidPicks = [
        { pick_no: 2, round: 1, picked_by: 'user1', metadata: {} },
        { pick_no: 1, round: 1, picked_by: 'user2', metadata: {} }
      ];
      
      const result = validatePickData(invalidPicks, 0);
      
      expect(result).toEqual({
        isValid: false,
        error: 'Picks are not in chronological order'
      });
    });

    it('should reject picks with duplicate pick_no', () => {
      const invalidPicks = [
        { pick_no: 1, round: 1, picked_by: 'user1', metadata: {} },
        { pick_no: 1, round: 1, picked_by: 'user2', metadata: {} }
      ];
      
      const result = validatePickData(invalidPicks, 0);
      
      expect(result).toEqual({
        isValid: false,
        error: 'Picks are not in chronological order'
      });
    });

    it('should reject picks with missing pick_no', () => {
      const invalidPicks = [
        { round: 1, picked_by: 'user1', metadata: {} },
        { pick_no: 2, round: 1, picked_by: 'user2', metadata: {} }
      ];
      
      const result = validatePickData(invalidPicks, 0);
      
      expect(result).toEqual({
        isValid: false,
        error: 'Pick data is missing pick_no field'
      });
    });

    it('should reject picks with null pick_no', () => {
      const invalidPicks = [
        { pick_no: null, round: 1, picked_by: 'user1', metadata: {} },
        { pick_no: 2, round: 1, picked_by: 'user2', metadata: {} }
      ];
      
      const result = validatePickData(invalidPicks, 0);
      
      expect(result).toEqual({
        isValid: false,
        error: 'Pick data is missing pick_no field'
      });
    });

    it('should reject picks with missing required fields', () => {
      const invalidPicks = [
        { pick_no: 1, round: 1, picked_by: 'user1' }, // missing metadata
        { pick_no: 2, round: 1, metadata: {} } // missing picked_by
      ];
      
      let result = validatePickData([invalidPicks[0]], 0);
      expect(result).toEqual({
        isValid: false,
        error: 'Pick at index 0 is missing required fields (metadata, picked_by, or round)'
      });

      result = validatePickData([invalidPicks[1]], 0);
      expect(result).toEqual({
        isValid: false,
        error: 'Pick at index 0 is missing required fields (metadata, picked_by, or round)'
      });
    });

    it('should reject picks with missing round field', () => {
      const invalidPicks = [
        { pick_no: 1, picked_by: 'user1', metadata: {} } // missing round
      ];
      
      const result = validatePickData(invalidPicks, 0);
      
      expect(result).toEqual({
        isValid: false,
        error: 'Pick at index 0 is missing required fields (metadata, picked_by, or round)'
      });
    });

    it('should reject picks with null metadata', () => {
      const invalidPicks = [
        { pick_no: 1, round: 1, picked_by: 'user1', metadata: null }
      ];
      
      const result = validatePickData(invalidPicks, 0);
      
      expect(result).toEqual({
        isValid: false,
        error: 'Pick at index 0 is missing required fields (metadata, picked_by, or round)'
      });
    });

    it('should reject when lastKnownPickCount is greater than current picks', () => {
      const result = validatePickData(samplePicks, 10);
      
      expect(result).toEqual({
        isValid: false,
        error: 'Last known pick count is greater than current pick count'
      });
    });

    it('should handle empty picks array', () => {
      const result = validatePickData([], 0);
      
      expect(result).toEqual({
        isValid: true,
        error: null
      });
    });

    it('should handle single pick', () => {
      const singlePick = [samplePicks[0]];
      const result = validatePickData(singlePick, 0);
      
      expect(result).toEqual({
        isValid: true,
        error: null
      });
    });

    it('should validate when lastKnownPickCount equals current picks length', () => {
      const result = validatePickData(samplePicks, 4);
      
      expect(result).toEqual({
        isValid: true,
        error: null
      });
    });

    it('should handle edge case with zero lastKnownPickCount', () => {
      const result = validatePickData(samplePicks, 0);
      
      expect(result).toEqual({
        isValid: true,
        error: null
      });
    });

    it('should handle corrupted pick data with mixed valid and invalid picks', () => {
      const mixedPicks = [
        samplePicks[0], // valid
        { pick_no: 2, round: 1, metadata: {} }, // missing picked_by
        samplePicks[2] // valid
      ];
      
      const result = validatePickData(mixedPicks, 0);
      
      expect(result).toEqual({
        isValid: false,
        error: 'Pick at index 1 is missing required fields (metadata, picked_by, or round)'
      });
    });
  });
});