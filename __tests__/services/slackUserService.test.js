const {
    resolveSlackUser,
    getDisplayName,
    MENTION_REQUIRED_MESSAGE
} = require('../../services/slackUserService.js');

const makeListClient = (pages) => {
    let call = 0;
    return {
        users: {
            info: jest.fn(),
            list: jest.fn(async () => {
                const page = pages[call] || { members: [] };
                call += 1;
                return page;
            })
        }
    };
};

describe('slackUserService', () => {
    beforeEach(() => {
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('resolveSlackUser', () => {
        it('resolves a mention via users.info', async () => {
            const client = {
                users: {
                    info: jest.fn().mockResolvedValue({
                        ok: true,
                        user: { profile: { display_name: 'Alice' } }
                    })
                }
            };

            await expect(resolveSlackUser('<@U1234567890>', client)).resolves.toEqual({
                slackMemberId: 'U1234567890',
                slackName: 'Alice'
            });
        });

        it('looks up a bare username with users.list', async () => {
            const client = makeListClient([{
                members: [
                    { id: 'U111', deleted: true, name: 'alice' },
                    { id: 'U222', is_bot: true, name: 'alice' },
                    { id: 'U333', name: 'alice', profile: { display_name: 'Alice' } }
                ]
            }]);

            await expect(resolveSlackUser('alice', client)).resolves.toEqual({
                slackMemberId: 'U333',
                slackName: 'Alice'
            });
        });

        it('rejects an unknown username', async () => {
            const client = makeListClient([{ members: [{ id: 'U1', name: 'bob' }] }]);

            await expect(resolveSlackUser('alice', client)).rejects.toMatchObject({
                code: 'INVALID_SLACK_USER',
                message: expect.stringContaining("Couldn't find a Slack user named `alice`")
            });
        });

        it('rejects an ambiguous username', async () => {
            const client = makeListClient([{
                members: [
                    { id: 'U1', name: 'alice' },
                    { id: 'U2', profile: { display_name: 'Alice' } }
                ]
            }]);

            await expect(resolveSlackUser('alice', client)).rejects.toMatchObject({
                code: 'INVALID_SLACK_USER',
                message: expect.stringContaining('Several Slack users match')
            });
        });

        it('asks for an @mention when username lookup is unavailable', async () => {
            const client = {
                users: {
                    list: jest.fn().mockRejectedValue(new Error('missing_scope'))
                }
            };

            await expect(resolveSlackUser('alice', client)).rejects.toMatchObject({
                code: 'INVALID_SLACK_USER',
                message: MENTION_REQUIRED_MESSAGE
            });
        });

        it('asks for an @mention when there is no Slack client', async () => {
            await expect(resolveSlackUser('alice')).rejects.toMatchObject({
                code: 'INVALID_SLACK_USER',
                message: MENTION_REQUIRED_MESSAGE
            });
        });
    });

    describe('getDisplayName', () => {
        it('returns a mention for notifications when a member ID exists', () => {
            expect(getDisplayName({ slackMemberId: 'U1', slackName: 'Alice' }, true)).toBe('<@U1>');
        });

        it('falls back to slackName then Unknown User', () => {
            expect(getDisplayName({ slackName: 'Alice' })).toBe('Alice');
            expect(getDisplayName(null)).toBe('Unknown User');
        });
    });
});
