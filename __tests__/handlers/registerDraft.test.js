const { handleRegisterDraftCommand } = require('../../handlers/registerDraft.js');
const datastore = require('../../services/datastore.js');

// Mock the datastore service
jest.mock('../../services/datastore.js');

describe('handleRegisterDraftCommand', () => {
    let say;

    beforeEach(() => {
        // Reset mocks before each test
        jest.clearAllMocks();
        // Create a mock 'say' function for each test
        say = jest.fn();
    });

    it('should register a new draft and save it', async () => {
        const command = {
            text: 'new_draft_123',
            channel_id: 'C12345'
        };
        const initialData = { player_map: {}, drafts: {} };

        // Setup mocks
        datastore.getData.mockResolvedValue(initialData);
        datastore.saveData.mockResolvedValue();

        await handleRegisterDraftCommand({ command, say });

        // Verify that the data was saved correctly
        const expectedSavedData = {
            player_map: {},
            drafts: {
                'new_draft_123': {
                    slack_channel_id: 'C12345',
                    last_known_pick_count: 0
                }
            }
        };
        expect(datastore.saveData).toHaveBeenCalledWith(expectedSavedData);

        // Verify the confirmation message was sent
        expect(say).toHaveBeenCalledWith(expect.stringContaining('Successfully registered draft'));
    });

    it('should return an error message if no draft ID is provided', async () => {
        const command = { text: '  ', channel_id: 'C12345' }; // Empty text

        await handleRegisterDraftCommand({ command, say });

        // Verify that no data operations were attempted
        expect(datastore.getData).not.toHaveBeenCalled();
        expect(datastore.saveData).not.toHaveBeenCalled();
        // Verify the correct error message was sent
        expect(say).toHaveBeenCalledWith(expect.stringContaining('Please provide a Sleeper Draft ID'));
    });
});