const { checkDraftForUpdates } = require('../../services/draftMonitor.js');
const datastore = require('../../services/datastore.js');
const sleeper = require('../../services/sleeper.js');
const { generatePickMessagePayload } = require('../../handlers/lastpick.js');

// Mock dependencies
jest.mock('../../services/datastore.js');
jest.mock('../../services/sleeper.js');
jest.mock('../../handlers/lastpick.js');

describe('Draft Monitor Service', () => {
    let mockApp;

    beforeEach(() => {
        jest.clearAllMocks();
        // Create a mock app object with the nested structure needed for the client
        mockApp = {
            client: {
                chat: {
                    postMessage: jest.fn().mockResolvedValue({ ok: true }),
                },
            },
        };
    });

    it('should post a message when a new pick is detected', async () => {
        // Arrange
        const draftId = 'draft123';
        const channelId = 'C123';
        const mockData = {
            drafts: {
                [draftId]: {
                    slack_channel_id: channelId,
                    last_known_pick_count: 1,
                },
            },
            player_map: {},
        };
        const mockPicks = [{ pick_no: 1 }, { pick_no: 2 }]; // New pick count is 2
        const mockDraft = { draft_order: {}, settings: {} };
        const mockMessagePayload = { text: 'New pick!', blocks: [] };

        datastore.getData.mockResolvedValue(mockData);
        sleeper.getDraftPicks.mockResolvedValue(mockPicks);
        sleeper.getDraft.mockResolvedValue(mockDraft);
        generatePickMessagePayload.mockReturnValue(mockMessagePayload);
        datastore.saveData.mockResolvedValue();

        // Act
        await checkDraftForUpdates(mockApp);

        // Assert
        expect(datastore.getData).toHaveBeenCalledTimes(1);
        expect(sleeper.getDraftPicks).toHaveBeenCalledWith(draftId);
        expect(sleeper.getDraft).toHaveBeenCalledWith(draftId);
        expect(generatePickMessagePayload).toHaveBeenCalledWith(mockDraft, mockPicks, mockData, true);
        expect(mockApp.client.chat.postMessage).toHaveBeenCalledWith({
            channel: channelId,
            ...mockMessagePayload,
        });
        expect(datastore.saveDraft).toHaveBeenCalledTimes(1);
        // Check that the draft was updated with the new pick count
        expect(datastore.saveDraft).toHaveBeenCalledWith(draftId, channelId, 2);
    });

    it('should do nothing if no new picks are found', async () => {
        // Arrange
        const draftId = 'draft123';
        const mockData = {
            drafts: {
                [draftId]: {
                    slack_channel_id: 'C123',
                    last_known_pick_count: 2, // Pick count is already 2
                },
            },
        };
        const mockPicks = [{ pick_no: 1 }, { pick_no: 2 }]; // Current pick count is 2

        datastore.getData.mockResolvedValue(mockData);
        sleeper.getDraftPicks.mockResolvedValue(mockPicks);
        sleeper.getDraft.mockResolvedValue({});

        // Act
        await checkDraftForUpdates(mockApp);

        // Assert
        expect(datastore.getData).toHaveBeenCalledTimes(1);
        expect(sleeper.getDraftPicks).toHaveBeenCalledWith(draftId);
        // Nothing should be posted or saved
        expect(mockApp.client.chat.postMessage).not.toHaveBeenCalled();
        expect(datastore.saveDraft).not.toHaveBeenCalled();
    });

    it('should do nothing if no drafts are registered', async () => {
        // Arrange
        const mockData = { drafts: {} };
        datastore.getData.mockResolvedValue(mockData);

        // Act
        await checkDraftForUpdates(mockApp);

        // Assert
        expect(datastore.getData).toHaveBeenCalledTimes(1);
        // No other functions should be called
        expect(sleeper.getDraftPicks).not.toHaveBeenCalled();
        expect(mockApp.client.chat.postMessage).not.toHaveBeenCalled();
        expect(datastore.saveDraft).not.toHaveBeenCalled();
    });
});