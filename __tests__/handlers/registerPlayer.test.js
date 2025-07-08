const { handleRegisterPlayerCommand } = require('../../handlers/registerPlayer.js');
const datastore = require('../../services/datastore.js');

// Mock the datastore service
jest.mock('../../services/datastore.js');

describe('handleRegisterPlayerCommand', () => {
    let say;

    beforeEach(() => {
        // Reset mocks before each test
        jest.clearAllMocks();
        // Create a mock 'say' function for each test
        say = jest.fn();
    });

    it('should register a new player and save the data', async () => {
        const command = { text: 'sleeper123 slack_user_123' };
        const initialData = { player_map: {}, drafts: {} };

        // Setup mocks
        datastore.getData.mockResolvedValue(initialData);
        datastore.saveData.mockResolvedValue();

        await handleRegisterPlayerCommand({ command, say });

        // Verify that the data was saved correctly
        const expectedSavedData = {
            player_map: { 'sleeper123': 'slack_user_123' },
            drafts: {}
        };
        expect(datastore.saveData).toHaveBeenCalledWith(expectedSavedData);

        // Verify the confirmation message was sent
        expect(say).toHaveBeenCalledWith(':white_check_mark: Successfully registered player. Sleeper ID `sleeper123` is now mapped to `slack_user_123`.');
    });

    it('should update an existing player mapping', async () => {
        const command = { text: 'sleeper123 new_slack_name' };
        const initialData = {
            player_map: { 'sleeper123': 'old_slack_name' },
            drafts: {}
        };

        datastore.getData.mockResolvedValue(initialData);
        datastore.saveData.mockResolvedValue();

        await handleRegisterPlayerCommand({ command, say });

        const expectedSavedData = {
            player_map: { 'sleeper123': 'new_slack_name' },
            drafts: {}
        };
        expect(datastore.saveData).toHaveBeenCalledWith(expectedSavedData);
        expect(say).toHaveBeenCalledWith(':white_check_mark: Successfully registered player. Sleeper ID `sleeper123` is now mapped to `new_slack_name`.');
    });

    it('should return an error message if arguments are missing', async () => {
        const command = { text: 'sleeper123' }; // Missing slack name

        await handleRegisterPlayerCommand({ command, say });

        expect(datastore.getData).not.toHaveBeenCalled();
        expect(datastore.saveData).not.toHaveBeenCalled();
        expect(say).toHaveBeenCalledWith('Please provide a Sleeper User ID and a Slack username. Usage: `@YourBotName registerplayer [sleeper_id] [slack_name]`');
    });
});