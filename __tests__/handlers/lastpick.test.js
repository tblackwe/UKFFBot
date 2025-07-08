const { handleLastPickCommand } = require('../../handlers/lastpick.js');
const datastore = require('../../services/datastore.js');
const sleeper = require('../../services/sleeper.js');

// Mock the services that the handler depends on
jest.mock('../../services/datastore.js');
jest.mock('../../services/sleeper.js');

describe('handleLastPickCommand', () => {
    let say;

    beforeEach(() => {
        // Reset all mocks to a clean state before each test
        jest.clearAllMocks();
        // Create a fresh mock for the 'say' function
        say = jest.fn();
    });

    it('should fetch and display the last pick for a registered draft', async () => {
        // Arrange: Set up the mock data and API responses
        const command = { channel_id: 'C123' };
        const mockData = {
            player_map: { 'user1': 'slack_user1', 'user2': 'slack_user2' },
            drafts: {
                'draft123': {
                    slack_channel_id: 'C123',
                    last_known_pick_count: 1
                }
            }
        };
        const mockDraft = {
            type: 'snake',
            settings: { rounds: 2, teams: 2 },
            draft_order: { 'user1': 1, 'user2': 2 },
            status: 'in_progress'
        };
        const mockPicks = [
            { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One' }, picked_by: 'user1' },
            { pick_no: 2, round: 1, metadata: { first_name: 'Player', last_name: 'Two' }, picked_by: 'user2' }
        ];

        datastore.getData.mockResolvedValue(mockData);
        sleeper.getDraft.mockResolvedValue(mockDraft);
        sleeper.getDraftPicks.mockResolvedValue(mockPicks);

        // Act: Run the handler
        await handleLastPickCommand({ command, say });

        // Assert: Verify the behavior
        expect(datastore.getData).toHaveBeenCalledTimes(1);
        expect(sleeper.getDraft).toHaveBeenCalledWith('draft123');
        expect(sleeper.getDraftPicks).toHaveBeenCalledWith('draft123');
        expect(say).toHaveBeenCalledTimes(1);
        // Check that the message contains the blocks structure and text fallback
        expect(say).toHaveBeenCalledWith(expect.objectContaining({
            blocks: expect.any(Array),
            text: expect.stringContaining("Player Two was selected. slack_user2")
        }));
    });

    it('should send a message if no draft is registered for the channel', async () => {
        const command = { channel_id: 'C_OTHER' };
        const mockData = {
            player_map: {},
            drafts: { 'draft123': { slack_channel_id: 'C123' } }
        };
        datastore.getData.mockResolvedValue(mockData);

        await handleLastPickCommand({ command, say });

        expect(sleeper.getDraft).not.toHaveBeenCalled();
        expect(say).toHaveBeenCalledWith('There is no draft registered for this channel. Please use `@YourBotName registerdraft [draft_id]` to get started.');
    });

    it('should send a message if the draft has not started', async () => {
        const command = { channel_id: 'C123' };
        const mockData = {
            player_map: {},
            drafts: { 'draft123': { slack_channel_id: 'C123' } }
        };
        const mockDraft = { status: 'pre_draft' };
        const mockPicks = []; // No picks yet

        datastore.getData.mockResolvedValue(mockData);
        sleeper.getDraft.mockResolvedValue(mockDraft);
        sleeper.getDraftPicks.mockResolvedValue(mockPicks);

        await handleLastPickCommand({ command, say });

        expect(say).toHaveBeenCalledWith('The draft for ID `draft123` has not started yet.');
    });

    it('should send an error message if the Sleeper API call fails', async () => {
        const command = { channel_id: 'C123' };
        const mockData = {
            player_map: {},
            drafts: { 'draft123': { slack_channel_id: 'C123' } }
        };
        datastore.getData.mockResolvedValue(mockData);
        // Simulate a failure from the Sleeper API
        sleeper.getDraft.mockRejectedValue(new Error('API Error'));

        await handleLastPickCommand({ command, say });

        expect(say).toHaveBeenCalledWith(expect.stringContaining("Sorry, I couldn't fetch the draft details."));
    });
});