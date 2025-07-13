const { handleRegisterDraftCommand } = require('../../handlers/registerDraft.js');
const datastore = require('../../services/datastore.js');

// Mock the datastore service
jest.mock('../../services/datastore.js');
jest.mock('../../shared/inputValidation.js');

const { parseDraftId } = require('../../shared/inputValidation.js');

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
        parseDraftId.mockReturnValue({ isValid: true, draftId: 'new_draft_123' });
        datastore.getData.mockResolvedValue(initialData);
        datastore.saveDraft.mockResolvedValue();

        await handleRegisterDraftCommand({ command, say });

        // Verify that the draft was saved correctly
        expect(datastore.saveDraft).toHaveBeenCalledWith('new_draft_123', 'C12345', 0);

        // Verify the confirmation message was sent
        expect(say).toHaveBeenCalledWith(expect.stringContaining('Successfully registered draft'));
    });

    it('should return an error message if no draft ID is provided', async () => {
        const command = { text: '  ', channel_id: 'C12345' }; // Empty text
        
        parseDraftId.mockReturnValue({ 
            isValid: false, 
            errorMessage: 'Please provide a Sleeper Draft ID. Example: `@YourBotName register draft 987654321`' 
        });

        await handleRegisterDraftCommand({ command, say });

        // Verify that no data operations were attempted
        expect(datastore.getData).not.toHaveBeenCalled();
        expect(datastore.saveDraft).not.toHaveBeenCalled();
        // Verify the correct error message was sent
        expect(say).toHaveBeenCalledWith('Please provide a Sleeper Draft ID. Example: `@YourBotName register draft 987654321`');
    });
});