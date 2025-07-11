const { handleUnregisterDraftCommand } = require('../../handlers/unregisterDraft.js');
const datastore = require('../../services/datastore.js');

// Mock the datastore service
jest.mock('../../services/datastore.js');

describe('handleUnregisterDraftCommand', () => {
    let say;

    beforeEach(() => {
        // Reset mocks before each test
        jest.clearAllMocks();
        // Create a mock 'say' function for each test
        say = jest.fn();
    });

    it('should unregister a draft from a channel and save the data', async () => {
        const command = { channel_id: 'C123' };
        const initialData = {
            player_map: {},
            drafts: {
                'draft123': { slack_channel_id: 'C123', last_known_pick_count: 5 },
                'draft456': { slack_channel_id: 'C456', last_known_pick_count: 10 }
            }
        };

        // Setup mocks
        datastore.getData.mockResolvedValue(initialData);
        datastore.saveData.mockResolvedValue();

        await handleUnregisterDraftCommand({ command, say });

        // Verify that the data was saved correctly, with the draft removed
        const expectedSavedData = {
            player_map: {},
            drafts: {
                'draft456': { slack_channel_id: 'C456', last_known_pick_count: 10 }
            }
        };
        expect(datastore.saveData).toHaveBeenCalledWith(expectedSavedData);

        // Verify the confirmation message was sent
        expect(say).toHaveBeenCalledWith(':white_check_mark: Successfully unregistered draft `draft123` from this channel.');
    });

    it('should send a message if no draft is registered for the channel', async () => {
        const command = { channel_id: 'C_NOT_REGISTERED' };
        const initialData = {
            player_map: {},
            drafts: { 'draft123': { slack_channel_id: 'C123' } }
        };
        datastore.getData.mockResolvedValue(initialData);

        await handleUnregisterDraftCommand({ command, say });

        // Verify that saveData was not called and the correct message was sent
        expect(datastore.saveData).not.toHaveBeenCalled();
        expect(say).toHaveBeenCalledWith('There is no draft registered for this channel.');
    });

    it('should handle cases where the drafts object is missing', async () => {
        const command = { channel_id: 'C123' };
        const initialData = { player_map: {} }; // No 'drafts' key
        datastore.getData.mockResolvedValue(initialData);

        await handleUnregisterDraftCommand({ command, say });

        expect(datastore.saveData).not.toHaveBeenCalled();
        expect(say).toHaveBeenCalledWith('There is no draft registered for this channel.');
    });
});