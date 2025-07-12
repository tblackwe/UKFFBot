const { handleRegisterPlayerCommand } = require('../../handlers/registerPlayer.js');
const datastore = require('../../services/datastore.js');
const sleeper = require('../../services/sleeper.js');

// Mock the datastore and sleeper services
jest.mock('../../services/datastore.js');
jest.mock('../../services/sleeper.js');

describe('handleRegisterPlayerCommand', () => {
    let say;

    beforeEach(() => {
        // Reset mocks before each test
        jest.clearAllMocks();
        // Create a mock 'say' function for each test
        say = jest.fn();
    });

    it('should register a new player and save the data', async () => {
        const command = { text: 'john_doe slack_user_123' };
        const initialData = { player_map: {}, drafts: {} };
        const mockSleeperUser = { user_id: 'sleeper123', username: 'john_doe' };

        // Setup mocks
        sleeper.getUserByUsername.mockResolvedValue(mockSleeperUser);
        datastore.getData.mockResolvedValue(initialData);
        datastore.saveData.mockResolvedValue();

        await handleRegisterPlayerCommand({ command, say });

        // Verify that the Sleeper API was called with the username
        expect(sleeper.getUserByUsername).toHaveBeenCalledWith('john_doe');

        // Verify that the data was saved correctly (using the ID as key)
        const expectedSavedData = {
            player_map: { 'sleeper123': 'slack_user_123' },
            drafts: {}
        };
        expect(datastore.saveData).toHaveBeenCalledWith(expectedSavedData);

        // Verify the confirmation message was sent
        expect(say).toHaveBeenCalledWith(':white_check_mark: Successfully registered player. Sleeper username `john_doe` (ID: `sleeper123`) is now mapped to `slack_user_123`.');
    });

    it('should update an existing player mapping', async () => {
        const command = { text: 'john_doe new_slack_name' };
        const initialData = {
            player_map: { 'sleeper123': 'old_slack_name' },
            drafts: {}
        };
        const mockSleeperUser = { user_id: 'sleeper123', username: 'john_doe' };

        sleeper.getUserByUsername.mockResolvedValue(mockSleeperUser);
        datastore.getData.mockResolvedValue(initialData);
        datastore.saveData.mockResolvedValue();

        await handleRegisterPlayerCommand({ command, say });

        const expectedSavedData = {
            player_map: { 'sleeper123': 'new_slack_name' },
            drafts: {}
        };
        expect(datastore.saveData).toHaveBeenCalledWith(expectedSavedData);
        expect(say).toHaveBeenCalledWith(':white_check_mark: Successfully registered player. Sleeper username `john_doe` (ID: `sleeper123`) is now mapped to `new_slack_name`.');
    });

    it('should return an error message if arguments are missing', async () => {
        const command = { text: 'john_doe' }; // Missing slack name

        await handleRegisterPlayerCommand({ command, say });

        expect(sleeper.getUserByUsername).not.toHaveBeenCalled();
        expect(datastore.getData).not.toHaveBeenCalled();
        expect(datastore.saveData).not.toHaveBeenCalled();
        expect(say).toHaveBeenCalledWith('Please provide a Sleeper username and a Slack username. Usage: `@YourBotName registerplayer [sleeper_username] [slack_name]`');
    });

    it('should return an error message if Sleeper user is not found', async () => {
        const command = { text: 'nonexistent_user slack_user_123' };

        sleeper.getUserByUsername.mockResolvedValue(null);

        await handleRegisterPlayerCommand({ command, say });

        expect(sleeper.getUserByUsername).toHaveBeenCalledWith('nonexistent_user');
        expect(datastore.getData).not.toHaveBeenCalled();
        expect(datastore.saveData).not.toHaveBeenCalled();
        expect(say).toHaveBeenCalledWith('❌ Could not find Sleeper user with username `nonexistent_user`. Please check the username and try again.');
    });
});