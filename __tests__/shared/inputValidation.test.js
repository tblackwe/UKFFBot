const {
    parseSlackUserInput,
    validateCommandArgs,
    parseDraftId,
    parseLeagueId
} = require('../../shared/inputValidation.js');

describe('inputValidation', () => {
    describe('parseSlackUserInput', () => {
        it('parses a plain Slack mention', () => {
            const result = parseSlackUserInput('<@U1234567890>');
            expect(result).toEqual({
                memberId: 'U1234567890',
                isValidMemberId: true,
                originalInput: '<@U1234567890>'
            });
        });

        it('parses a Slack mention that includes a username', () => {
            const result = parseSlackUserInput('<@U1234567890|alice>');
            expect(result.memberId).toBe('U1234567890');
            expect(result.isValidMemberId).toBe(true);
        });

        it('accepts a bare 11-character member ID', () => {
            const result = parseSlackUserInput('U1234567890');
            expect(result.memberId).toBe('U1234567890');
            expect(result.isValidMemberId).toBe(true);
        });

        it('treats anything else as a username', () => {
            const result = parseSlackUserInput('alice');
            expect(result).toEqual({
                memberId: 'alice',
                isValidMemberId: false,
                originalInput: 'alice'
            });
        });

        it('does not accept a malformed member ID as valid', () => {
            const result = parseSlackUserInput('U123'); // too short
            expect(result.isValidMemberId).toBe(false);
        });
    });

    describe('validateCommandArgs', () => {
        it('flags too few arguments with a usage message', () => {
            const result = validateCommandArgs(['one'], 2, 'cmd a b');
            expect(result.isValid).toBe(false);
            expect(result.errorMessage).toContain('cmd a b');
        });

        it('passes when enough arguments are provided', () => {
            expect(validateCommandArgs(['a', 'b'], 2, 'cmd a b')).toEqual({ isValid: true });
        });
    });

    describe('parseDraftId', () => {
        it('rejects empty input', () => {
            const result = parseDraftId('   ');
            expect(result.isValid).toBe(false);
            expect(result.errorMessage).toMatch(/Draft ID/i);
        });

        it('rejects non-numeric input', () => {
            const result = parseDraftId('abc123');
            expect(result.isValid).toBe(false);
            expect(result.errorMessage).toMatch(/numeric/i);
        });

        it('accepts and trims a numeric draft ID', () => {
            const result = parseDraftId('  987654321  ');
            expect(result).toEqual({ isValid: true, draftId: '987654321' });
        });
    });

    describe('parseLeagueId', () => {
        it('rejects empty input', () => {
            expect(parseLeagueId('').isValid).toBe(false);
        });

        it('rejects non-numeric input', () => {
            const result = parseLeagueId('league-1');
            expect(result.isValid).toBe(false);
            expect(result.errorMessage).toMatch(/numeric/i);
        });

        it('accepts and trims a numeric league ID', () => {
            expect(parseLeagueId(' 123456 ')).toEqual({ isValid: true, leagueId: '123456' });
        });
    });
});
