const { handleRegisterPlayerCommand } = require('../../handlers/registerPlayer.js');
const datastore = require('../../services/datastore.js');
const sleeper = require('../../services/sleeper.js');

// Mock the services
jest.mock('../../services/datastore.js');
jest.mock('../../services/sleeper.js');
jest.mock('../../shared/inputValidation.js');
jest.mock('../../services/slackUserService.js');

const { validateCommandArgs } = require('../../shared/inputValidation.js');
const { resolveSlackUser } = require('../../services/slackUserService.js');

describe('handleRegisterPlayerCommand', () => {
    let say;
    let client;

    beforeEach(() => {
        // Reset mocks before each test
        jest.clearAllMocks();
        // Create a mock 'say' function for each test
        say = jest.fn();
        client = { users: { info: jest.fn() } };
    });

    it('should register a new player and save the data', async () => {
        const command = { text: 'john_doe slack_user_123' };
        const mockSleeperUser = { user_id: 'sleeper123', username: 'john_doe' };

        // Setup mocks
        validateCommandArgs.mockReturnValue({ isValid: true });
        sleeper.getUserByUsername.mockResolvedValue(mockSleeperUser);
        resolveSlackUser.mockResolvedValue({
            slackMemberId: 'U123456',
            slackName: 'slack_user_123'
        });
        datastore.savePlayer.mockResolvedValue();

        await handleRegisterPlayerCommand({ command, say, client });

        // Verify that the Sleeper API was called with the username
        expect(sleeper.getUserByUsername).toHaveBeenCalledWith('john_doe');

        // Verify that the player was saved correctly
        expect(datastore.savePlayer).toHaveBeenCalledWith('sleeper123', 'U123456', 'slack_user_123');

        // Verify the confirmation message was sent
        expect(say).toHaveBeenCalledWith(':white_check_mark: Successfully registered player. Sleeper username `john_doe` (ID: `sleeper123`) is now mapped to `slack_user_123` (U123456).');
    });

    it('should update an existing player mapping', async () => {
        const command = { text: 'john_doe new_slack_name' };
        const mockSleeperUser = { user_id: 'sleeper123', username: 'john_doe' };

        // Setup mocks
        validateCommandArgs.mockReturnValue({ isValid: true });
        sleeper.getUserByUsername.mockResolvedValue(mockSleeperUser);
        resolveSlackUser.mockResolvedValue({
            slackMemberId: 'U789012',
            slackName: 'new_slack_name'
        });
        datastore.savePlayer.mockResolvedValue();

        await handleRegisterPlayerCommand({ command, say, client });

        expect(datastore.savePlayer).toHaveBeenCalledWith('sleeper123', 'U789012', 'new_slack_name');
        expect(say).toHaveBeenCalledWith(':white_check_mark: Successfully registered player. Sleeper username `john_doe` (ID: `sleeper123`) is now mapped to `new_slack_name` (U789012).');
    });

    it('should return an error message if arguments are missing', async () => {
        const command = { text: 'john_doe' }; // Missing slack name
        
        validateCommandArgs.mockReturnValue({ 
            isValid: false, 
            errorMessage: 'Please provide all required arguments. Usage: `@YourBotName register player [sleeper_username] [@slack_user or slack_username]`'
        });

        await handleRegisterPlayerCommand({ command, say, client });

        expect(sleeper.getUserByUsername).not.toHaveBeenCalled();
        expect(datastore.savePlayer).not.toHaveBeenCalled();
        expect(say).toHaveBeenCalledWith('Please provide all required arguments. Usage: `@YourBotName register player [sleeper_username] [@slack_user or slack_username]`');
    });

    it('should return an error message if Sleeper user is not found', async () => {
        const command = { text: 'nonexistent_user slack_user_123' };

        validateCommandArgs.mockReturnValue({ isValid: true });
        sleeper.getUserByUsername.mockResolvedValue(null);

        await handleRegisterPlayerCommand({ command, say, client });

        expect(sleeper.getUserByUsername).toHaveBeenCalledWith('nonexistent_user');
        expect(datastore.savePlayer).not.toHaveBeenCalled();
        expect(say).toHaveBeenCalledWith('❌ Could not find Sleeper user with username `nonexistent_user`. Please check the username and try again.');
    });
});