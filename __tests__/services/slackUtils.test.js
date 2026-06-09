const {
    resolveSlackUsername,
    resolveSlackUsernames,
    updateAllPlayerSlackNames
} = require('../../services/slackUtils.js');

// Build a fake Bolt app whose users.info returns a canned response per member id.
const makeApp = (usersById) => ({
    client: {
        users: {
            info: jest.fn(async ({ user }) => {
                if (usersById[user] === undefined) {
                    throw new Error('user_not_found');
                }
                return usersById[user];
            })
        }
    }
});

describe('slackUtils', () => {
    beforeEach(() => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('resolveSlackUsername', () => {
        it('prefers display_name', async () => {
            const app = makeApp({ U1: { ok: true, user: { profile: { display_name: 'Disp', real_name: 'Real' }, name: 'handle' } } });
            await expect(resolveSlackUsername(app, 'U1')).resolves.toBe('Disp');
        });

        it('falls back to real_name then handle then memberId', async () => {
            const realOnly = makeApp({ U1: { ok: true, user: { profile: { real_name: 'Real' }, name: 'handle' } } });
            await expect(resolveSlackUsername(realOnly, 'U1')).resolves.toBe('Real');

            const handleOnly = makeApp({ U2: { ok: true, user: { profile: {}, name: 'handle' } } });
            await expect(resolveSlackUsername(handleOnly, 'U2')).resolves.toBe('handle');

            const nothing = makeApp({ U3: { ok: true, user: { profile: {} } } });
            await expect(resolveSlackUsername(nothing, 'U3')).resolves.toBe('U3');
        });

        it('returns null when the API responds not ok', async () => {
            const app = makeApp({ U1: { ok: false } });
            await expect(resolveSlackUsername(app, 'U1')).resolves.toBeNull();
        });

        it('returns null when the API throws', async () => {
            const app = makeApp({}); // any lookup throws
            await expect(resolveSlackUsername(app, 'Uxxx')).resolves.toBeNull();
        });
    });

    describe('resolveSlackUsernames', () => {
        it('maps each resolvable member id and skips failures', async () => {
            const app = makeApp({
                U1: { ok: true, user: { profile: { display_name: 'One' } } },
                U2: { ok: true, user: { profile: { display_name: 'Two' } } }
                // U3 missing -> throws -> skipped
            });

            const result = await resolveSlackUsernames(app, ['U1', 'U2', 'U3']);

            expect(result.get('U1')).toBe('One');
            expect(result.get('U2')).toBe('Two');
            expect(result.has('U3')).toBe(false);
        });
    });

    describe('updateAllPlayerSlackNames', () => {
        it('updates only players whose name changed and returns the count', async () => {
            const app = makeApp({
                U1: { ok: true, user: { profile: { display_name: 'NewName' } } },
                U2: { ok: true, user: { profile: { display_name: 'Same' } } }
            });
            const datastore = {
                getAllPlayers: jest.fn().mockResolvedValue([
                    { sleeperId: 's1', slackMemberId: 'U1', slackName: 'OldName' }, // changes
                    { sleeperId: 's2', slackMemberId: 'U2', slackName: 'Same' },    // unchanged
                    { sleeperId: 's3', slackMemberId: 'bad', slackName: 'x' }       // filtered out (no 'U')
                ]),
                updatePlayerSlackName: jest.fn().mockResolvedValue()
            };

            const count = await updateAllPlayerSlackNames(app, datastore);

            expect(count).toBe(1);
            expect(datastore.updatePlayerSlackName).toHaveBeenCalledTimes(1);
            expect(datastore.updatePlayerSlackName).toHaveBeenCalledWith('s1', 'NewName');
        });

        it('returns 0 when there are no valid member IDs', async () => {
            const app = makeApp({});
            const datastore = {
                getAllPlayers: jest.fn().mockResolvedValue([{ sleeperId: 's1', slackMemberId: null }]),
                updatePlayerSlackName: jest.fn()
            };

            const count = await updateAllPlayerSlackNames(app, datastore);

            expect(count).toBe(0);
            expect(datastore.updatePlayerSlackName).not.toHaveBeenCalled();
        });

        it('propagates datastore errors', async () => {
            const app = makeApp({});
            const datastore = {
                getAllPlayers: jest.fn().mockRejectedValue(new Error('db down')),
                updatePlayerSlackName: jest.fn()
            };

            await expect(updateAllPlayerSlackNames(app, datastore)).rejects.toThrow('db down');
        });
    });
});
