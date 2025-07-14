const { 
  handleLastPickCommand, 
  generateMultiPickMessagePayload, 
  MULTI_PICK_CONFIG,
  estimateBlockCount,
  calculateSafePickLimit
} = require('../../handlers/lastpick.js');
const datastore = require('../../services/datastore.js');
const sleeper = require('../../services/sleeper.js');
const slackUserService = require('../../services/slackUserService.js');
const pickUtils = require('../../shared/pickUtils.js');

// Mock the services that the handler depends on
jest.mock('../../services/datastore.js');
jest.mock('../../services/sleeper.js');
jest.mock('../../services/slackUserService.js');
jest.mock('../../shared/pickUtils.js');

describe('handleLastPickCommand', () => {
    let say;

    beforeEach(() => {
        // Reset all mocks to a clean state before each test
        jest.clearAllMocks();
        // Create a fresh mock for the 'say' function
        say = jest.fn();
        
        // Set up default mock implementations
        datastore.getPlayer.mockResolvedValue(null);
        slackUserService.getDisplayName.mockImplementation((playerData, notify) => {
            return notify ? `<@${playerData}>` : playerData;
        });
        
        // Set up default pickUtils mocks
        pickUtils.validatePickData.mockReturnValue({ isValid: true, error: null });
        pickUtils.getNewPicksSinceLastUpdate.mockReturnValue({
            hasNewPicks: false,
            count: 0,
            startIndex: 0,
            newPicks: []
        });
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
            blocks: expect.arrayContaining([
                expect.objectContaining({
                    fields: expect.arrayContaining([
                        expect.objectContaining({ text: expect.stringContaining('*Pick:* `1.02`') })
                    ])
                })
            ]),
            text: expect.stringContaining("Pick 1.02: Player Two (N/A) was selected by slack_user2. Next up: slack_user2")
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

    it('should use multi-pick display when validation passes and multiple new picks exist', async () => {
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
            settings: { rounds: 2 },
            draft_order: { 'user1': 1, 'user2': 2 },
            status: 'in_progress'
        };
        const mockPicks = [
            { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One' }, picked_by: 'user1' },
            { pick_no: 2, round: 1, metadata: { first_name: 'Player', last_name: 'Two' }, picked_by: 'user2' },
            { pick_no: 3, round: 2, metadata: { first_name: 'Player', last_name: 'Three' }, picked_by: 'user2' }
        ];

        datastore.getData.mockResolvedValue(mockData);
        sleeper.getDraft.mockResolvedValue(mockDraft);
        sleeper.getDraftPicks.mockResolvedValue(mockPicks);
        
        // Mock validation to pass
        pickUtils.validatePickData.mockReturnValue({ isValid: true, error: null });
        pickUtils.getNewPicksSinceLastUpdate.mockReturnValue({
            hasNewPicks: true,
            count: 2,
            startIndex: 1,
            newPicks: mockPicks.slice(1)
        });

        await handleLastPickCommand({ command, say });

        expect(pickUtils.validatePickData).toHaveBeenCalledWith(mockPicks, 1);
        expect(pickUtils.getNewPicksSinceLastUpdate).toHaveBeenCalledWith(mockPicks, 1);
        expect(say).toHaveBeenCalledTimes(1);
        // Should use multi-pick format
        expect(say).toHaveBeenCalledWith(expect.objectContaining({
            text: expect.stringContaining('new picks since last update')
        }));
    });

    it('should fall back to single-pick display when validation fails', async () => {
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
            settings: { rounds: 2 },
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
        
        // Mock validation to fail
        pickUtils.validatePickData.mockReturnValue({ 
            isValid: false, 
            error: 'Picks are not in chronological order' 
        });

        await handleLastPickCommand({ command, say });

        expect(pickUtils.validatePickData).toHaveBeenCalledWith(mockPicks, 1);
        expect(pickUtils.getNewPicksSinceLastUpdate).not.toHaveBeenCalled();
        expect(say).toHaveBeenCalledTimes(1);
        // Should fall back to single-pick format
        expect(say).toHaveBeenCalledWith(expect.objectContaining({
            text: expect.stringContaining('Pick 1.02: Player Two')
        }));
    });

    it('should fall back to single-pick display when last_known_pick_count is missing', async () => {
        const command = { channel_id: 'C123' };
        const mockData = {
            player_map: { 'user1': 'slack_user1', 'user2': 'slack_user2' },
            drafts: {
                'draft123': {
                    slack_channel_id: 'C123'
                    // missing last_known_pick_count
                }
            }
        };
        const mockDraft = {
            type: 'snake',
            settings: { rounds: 2 },
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

        await handleLastPickCommand({ command, say });

        expect(pickUtils.validatePickData).not.toHaveBeenCalled();
        expect(pickUtils.getNewPicksSinceLastUpdate).not.toHaveBeenCalled();
        expect(say).toHaveBeenCalledTimes(1);
        // Should fall back to single-pick format
        expect(say).toHaveBeenCalledWith(expect.objectContaining({
            text: expect.stringContaining('Pick 1.02: Player Two')
        }));
    });

    it('should fall back to single-pick display when last_known_pick_count is invalid', async () => {
        const command = { channel_id: 'C123' };
        const mockData = {
            player_map: { 'user1': 'slack_user1', 'user2': 'slack_user2' },
            drafts: {
                'draft123': {
                    slack_channel_id: 'C123',
                    last_known_pick_count: 'invalid'
                }
            }
        };
        const mockDraft = {
            type: 'snake',
            settings: { rounds: 2 },
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

        await handleLastPickCommand({ command, say });

        expect(pickUtils.validatePickData).not.toHaveBeenCalled();
        expect(pickUtils.getNewPicksSinceLastUpdate).not.toHaveBeenCalled();
        expect(say).toHaveBeenCalledTimes(1);
        // Should fall back to single-pick format
        expect(say).toHaveBeenCalledWith(expect.objectContaining({
            text: expect.stringContaining('Pick 1.02: Player Two')
        }));
    });

    it('should fall back to single-pick display when last_known_pick_count is negative', async () => {
        const command = { channel_id: 'C123' };
        const mockData = {
            player_map: { 'user1': 'slack_user1', 'user2': 'slack_user2' },
            drafts: {
                'draft123': {
                    slack_channel_id: 'C123',
                    last_known_pick_count: -1
                }
            }
        };
        const mockDraft = {
            type: 'snake',
            settings: { rounds: 2 },
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

        await handleLastPickCommand({ command, say });

        expect(pickUtils.validatePickData).not.toHaveBeenCalled();
        expect(pickUtils.getNewPicksSinceLastUpdate).not.toHaveBeenCalled();
        expect(say).toHaveBeenCalledTimes(1);
        // Should fall back to single-pick format
        expect(say).toHaveBeenCalledWith(expect.objectContaining({
            text: expect.stringContaining('Pick 1.02: Player Two')
        }));
    });

    it('should fall back to single-pick display when getNewPicksSinceLastUpdate throws error', async () => {
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
            settings: { rounds: 2 },
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
        
        // Mock validation to pass but getNewPicksSinceLastUpdate to throw
        pickUtils.validatePickData.mockReturnValue({ isValid: true, error: null });
        pickUtils.getNewPicksSinceLastUpdate.mockImplementation(() => {
            throw new Error('Calculation error');
        });

        await handleLastPickCommand({ command, say });

        expect(pickUtils.validatePickData).toHaveBeenCalledWith(mockPicks, 1);
        expect(pickUtils.getNewPicksSinceLastUpdate).toHaveBeenCalledWith(mockPicks, 1);
        expect(say).toHaveBeenCalledTimes(1);
        // Should fall back to single-pick format
        expect(say).toHaveBeenCalledWith(expect.objectContaining({
            text: expect.stringContaining('Pick 1.02: Player Two')
        }));
    });

    it('should use single-pick display when only one new pick exists', async () => {
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
            settings: { rounds: 2 },
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
        
        // Mock validation to pass but only one new pick
        pickUtils.validatePickData.mockReturnValue({ isValid: true, error: null });
        pickUtils.getNewPicksSinceLastUpdate.mockReturnValue({
            hasNewPicks: true,
            count: 1, // Only one new pick
            startIndex: 1,
            newPicks: [mockPicks[1]]
        });

        await handleLastPickCommand({ command, say });

        expect(pickUtils.validatePickData).toHaveBeenCalledWith(mockPicks, 1);
        expect(pickUtils.getNewPicksSinceLastUpdate).toHaveBeenCalledWith(mockPicks, 1);
        expect(say).toHaveBeenCalledTimes(1);
        // Should use single-pick format since only one new pick
        expect(say).toHaveBeenCalledWith(expect.objectContaining({
            text: expect.stringContaining('Pick 1.02: Player Two')
        }));
    });

    it('should use single-pick display when no new picks exist', async () => {
        const command = { channel_id: 'C123' };
        const mockData = {
            player_map: { 'user1': 'slack_user1', 'user2': 'slack_user2' },
            drafts: {
                'draft123': {
                    slack_channel_id: 'C123',
                    last_known_pick_count: 2
                }
            }
        };
        const mockDraft = {
            type: 'snake',
            settings: { rounds: 2 },
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
        
        // Mock validation to pass but no new picks
        pickUtils.validatePickData.mockReturnValue({ isValid: true, error: null });
        pickUtils.getNewPicksSinceLastUpdate.mockReturnValue({
            hasNewPicks: false,
            count: 0,
            startIndex: 2,
            newPicks: []
        });

        await handleLastPickCommand({ command, say });

        expect(pickUtils.validatePickData).toHaveBeenCalledWith(mockPicks, 2);
        expect(pickUtils.getNewPicksSinceLastUpdate).toHaveBeenCalledWith(mockPicks, 2);
        expect(say).toHaveBeenCalledTimes(1);
        // Should use single-pick format since no new picks
        expect(say).toHaveBeenCalledWith(expect.objectContaining({
            text: expect.stringContaining('Pick 1.02: Player Two')
        }));
    });
});

describe('Multi-pick Feature Flag Tests', () => {
    let say;
    let originalConfig;

    beforeEach(() => {
        jest.clearAllMocks();
        say = jest.fn();
        
        // Store original config
        const { MULTI_PICK_CONFIG } = require('../../handlers/lastpick.js');
        originalConfig = { ...MULTI_PICK_CONFIG };
        
        // Set up default mock implementations
        datastore.getPlayer.mockResolvedValue(null);
        slackUserService.getDisplayName.mockImplementation((playerData, notify) => {
            return notify ? `<@${playerData}>` : playerData;
        });
        
        // Set up default pickUtils mocks
        pickUtils.validatePickData.mockReturnValue({ isValid: true, error: null });
        pickUtils.getNewPicksSinceLastUpdate.mockReturnValue({
            hasNewPicks: false,
            count: 0,
            startIndex: 0,
            newPicks: []
        });
    });

    afterEach(() => {
        // Restore original config
        const { MULTI_PICK_CONFIG } = require('../../handlers/lastpick.js');
        Object.assign(MULTI_PICK_CONFIG, originalConfig);
    });

    it('should fall back to single-pick display when ENABLE_MULTI_PICK is false', async () => {
        // Arrange: Disable multi-pick feature
        const { MULTI_PICK_CONFIG } = require('../../handlers/lastpick.js');
        MULTI_PICK_CONFIG.ENABLE_MULTI_PICK = false;

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
            settings: { rounds: 2 },
            draft_order: { 'user1': 1, 'user2': 2 },
            status: 'in_progress'
        };
        const mockPicks = [
            { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One' }, picked_by: 'user1' },
            { pick_no: 2, round: 1, metadata: { first_name: 'Player', last_name: 'Two' }, picked_by: 'user2' },
            { pick_no: 3, round: 2, metadata: { first_name: 'Player', last_name: 'Three' }, picked_by: 'user2' }
        ];

        datastore.getData.mockResolvedValue(mockData);
        sleeper.getDraft.mockResolvedValue(mockDraft);
        sleeper.getDraftPicks.mockResolvedValue(mockPicks);
        
        // Mock validation to pass with multiple new picks
        pickUtils.validatePickData.mockReturnValue({ isValid: true, error: null });
        pickUtils.getNewPicksSinceLastUpdate.mockReturnValue({
            hasNewPicks: true,
            count: 2,
            startIndex: 1,
            newPicks: mockPicks.slice(1)
        });

        // Act
        await handleLastPickCommand({ command, say });

        // Assert: Should use single-pick format even with multiple new picks
        expect(say).toHaveBeenCalledTimes(1);
        expect(say).toHaveBeenCalledWith(expect.objectContaining({
            text: expect.stringContaining('Pick 2.01: Player Three')
        }));
        expect(say).toHaveBeenCalledWith(expect.not.objectContaining({
            text: expect.stringContaining('new picks since last update')
        }));
        
        // Should not call validation functions when feature is disabled
        expect(pickUtils.validatePickData).not.toHaveBeenCalled();
        expect(pickUtils.getNewPicksSinceLastUpdate).not.toHaveBeenCalled();
    });

    it('should use multi-pick display when ENABLE_MULTI_PICK is true', async () => {
        // Arrange: Ensure multi-pick feature is enabled
        const { MULTI_PICK_CONFIG } = require('../../handlers/lastpick.js');
        MULTI_PICK_CONFIG.ENABLE_MULTI_PICK = true;

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
            settings: { rounds: 2 },
            draft_order: { 'user1': 1, 'user2': 2 },
            status: 'in_progress'
        };
        const mockPicks = [
            { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One' }, picked_by: 'user1' },
            { pick_no: 2, round: 1, metadata: { first_name: 'Player', last_name: 'Two' }, picked_by: 'user2' },
            { pick_no: 3, round: 2, metadata: { first_name: 'Player', last_name: 'Three' }, picked_by: 'user2' }
        ];

        datastore.getData.mockResolvedValue(mockData);
        sleeper.getDraft.mockResolvedValue(mockDraft);
        sleeper.getDraftPicks.mockResolvedValue(mockPicks);
        
        // Mock validation to pass with multiple new picks
        pickUtils.validatePickData.mockReturnValue({ isValid: true, error: null });
        pickUtils.getNewPicksSinceLastUpdate.mockReturnValue({
            hasNewPicks: true,
            count: 2,
            startIndex: 1,
            newPicks: mockPicks.slice(1)
        });

        // Act
        await handleLastPickCommand({ command, say });

        // Assert: Should use multi-pick format
        expect(pickUtils.validatePickData).toHaveBeenCalledWith(mockPicks, 1);
        expect(pickUtils.getNewPicksSinceLastUpdate).toHaveBeenCalledWith(mockPicks, 1);
        expect(say).toHaveBeenCalledTimes(1);
        expect(say).toHaveBeenCalledWith(expect.objectContaining({
            text: expect.stringContaining('new picks since last update')
        }));
    });
});

describe('generatePickMessagePayload - Backward Compatibility Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Mock the getPlayer function to return null (fallback to player_map)
        datastore.getPlayer.mockResolvedValue(null);
        // Mock getDisplayName to return the mapped name
        slackUserService.getDisplayName.mockImplementation((playerData, notify) => {
            return notify ? `<@${playerData}>` : playerData;
        });
    });

    it('should generate correct single-pick message payload with all required fields', async () => {
        // Arrange
        const mockDraft = {
            type: 'linear',
            settings: { rounds: 2, teams: 2 },
            draft_order: { 'user1': 1, 'user2': 2 },
            status: 'in_progress'
        };
        const mockPicks = [
            { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One', position: 'RB' }, picked_by: 'user1' },
            { pick_no: 2, round: 1, metadata: { first_name: 'Player', last_name: 'Two', position: 'WR' }, picked_by: 'user2' }
        ];
        const mockData = {
            player_map: { 'user1': 'slack_user1', 'user2': 'slack_user2' }
        };

        // Act
        const { generatePickMessagePayload } = require('../../handlers/lastpick.js');
        const result = await generatePickMessagePayload(mockDraft, mockPicks, mockData, false);

        // Assert
        expect(result).toHaveProperty('text');
        expect(result).toHaveProperty('blocks');
        
        // Verify fallback text format
        expect(result.text).toContain('Pick 1.02: Player Two (WR) was selected by slack_user2. Next up: slack_user1');
        
        // Verify blocks structure
        expect(result.blocks).toHaveLength(4);
        expect(result.blocks[0].text.text).toContain('PICK ALERT');
        expect(result.blocks[1].fields).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: '*Pick:* `1.02`' }),
            expect.objectContaining({ text: '*Player:* `Player Two - WR`' }),
            expect.objectContaining({ text: '*Picked By:* slack_user2' })
        ]));
        expect(result.blocks[2].type).toBe('divider');
        expect(result.blocks[3].text.text).toContain('*On The Clock:* slack_user1');
    });

    it('should handle draft completion correctly in single-pick format', async () => {
        // Arrange
        const mockDraft = {
            type: 'linear',
            settings: { rounds: 1, teams: 2 }, // Only 2 picks total
            draft_order: { 'user1': 1, 'user2': 2 },
            status: 'complete'
        };
        const mockPicks = [
            { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One', position: 'RB' }, picked_by: 'user1' },
            { pick_no: 2, round: 1, metadata: { first_name: 'Player', last_name: 'Two', position: 'WR' }, picked_by: 'user2' }
        ];
        const mockData = {
            player_map: { 'user1': 'slack_user1', 'user2': 'slack_user2' }
        };

        // Act
        const { generatePickMessagePayload } = require('../../handlers/lastpick.js');
        const result = await generatePickMessagePayload(mockDraft, mockPicks, mockData, false);

        // Assert
        expect(result.text).toContain('The draft is complete!');
        expect(result.blocks[3].text.text).toContain('*On The Clock:* The draft is complete!');
    });

    it('should handle snake draft pick numbering correctly in single-pick format', async () => {
        // Arrange
        const mockDraft = {
            type: 'snake',
            settings: { rounds: 2, teams: 2 },
            draft_order: { 'user1': 1, 'user2': 2 },
            status: 'in_progress'
        };
        const mockPicks = [
            { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One', position: 'RB' }, picked_by: 'user1' },
            { pick_no: 2, round: 1, metadata: { first_name: 'Player', last_name: 'Two', position: 'WR' }, picked_by: 'user2' },
            { pick_no: 3, round: 2, metadata: { first_name: 'Player', last_name: 'Three', position: 'QB' }, picked_by: 'user2' }
        ];
        const mockData = {
            player_map: { 'user1': 'slack_user1', 'user2': 'slack_user2' }
        };

        // Act
        const { generatePickMessagePayload } = require('../../handlers/lastpick.js');
        const result = await generatePickMessagePayload(mockDraft, mockPicks, mockData, false);

        // Assert
        // In snake draft, round 2 reverses order, so pick 3 should be 2.01 (first pick of round 2)
        expect(result.blocks[1].fields).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: '*Pick:* `2.01`' })
        ]));
        
        // Next picker should be user1 (slot 1, but reversed in round 2)
        expect(result.blocks[3].text.text).toContain('*On The Clock:* slack_user1');
    });

    it('should handle missing player positions gracefully in single-pick format', async () => {
        // Arrange
        const mockDraft = {
            type: 'linear',
            settings: { rounds: 1, teams: 1 },
            draft_order: { 'user1': 1 },
            status: 'in_progress'
        };
        const mockPicks = [
            { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One' }, picked_by: 'user1' } // No position
        ];
        const mockData = {
            player_map: { 'user1': 'slack_user1' }
        };

        // Act
        const { generatePickMessagePayload } = require('../../handlers/lastpick.js');
        const result = await generatePickMessagePayload(mockDraft, mockPicks, mockData, false);

        // Assert
        expect(result.text).toContain('Player One (N/A)');
        expect(result.blocks[1].fields).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: '*Player:* `Player One - N/A`' })
        ]));
    });

    it('should use @ mentions when notifyNextPicker is true in single-pick format', async () => {
        // Arrange
        const mockDraft = {
            type: 'linear',
            settings: { rounds: 2, teams: 2 },
            draft_order: { 'user1': 1, 'user2': 2 },
            status: 'in_progress'
        };
        const mockPicks = [
            { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One', position: 'RB' }, picked_by: 'user1' }
        ];
        const mockData = {
            player_map: { 'user1': 'slack_user1', 'user2': 'slack_user2' }
        };

        // Act
        const { generatePickMessagePayload } = require('../../handlers/lastpick.js');
        const result = await generatePickMessagePayload(mockDraft, mockPicks, mockData, true);

        // Assert
        expect(result.text).toContain('Next up: <@slack_user2>');
        expect(result.blocks[3].text.text).toContain('*On The Clock:* <@slack_user2>');
    });

    it('should handle player service failures gracefully in single-pick format', async () => {
        // Arrange
        const mockDraft = {
            type: 'linear',
            settings: { rounds: 1, teams: 1 },
            draft_order: { 'user1': 1 },
            status: 'in_progress'
        };
        const mockPicks = [
            { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One', position: 'RB' }, picked_by: 'user1' }
        ];
        const mockData = {
            player_map: { 'user1': 'slack_user1' }
        };

        // Mock player service to throw error
        datastore.getPlayer.mockRejectedValue(new Error('Player service unavailable'));

        // Act
        const { generatePickMessagePayload } = require('../../handlers/lastpick.js');
        const result = await generatePickMessagePayload(mockDraft, mockPicks, mockData, false);

        // Assert
        expect(result.text).toContain('slack_user1'); // Should fall back to player_map
        expect(result.blocks[1].fields).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: '*Picked By:* slack_user1' })
        ]));
    });

    it('should maintain consistent message structure for backward compatibility', async () => {
        // Arrange
        const mockDraft = {
            type: 'linear',
            settings: { rounds: 1, teams: 1 },
            draft_order: { 'user1': 1 },
            status: 'in_progress'
        };
        const mockPicks = [
            { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One', position: 'RB' }, picked_by: 'user1' }
        ];
        const mockData = {
            player_map: { 'user1': 'slack_user1' }
        };

        // Act
        const { generatePickMessagePayload } = require('../../handlers/lastpick.js');
        const result = await generatePickMessagePayload(mockDraft, mockPicks, mockData, false);

        // Assert - Verify exact structure expected by existing integrations
        expect(result).toEqual({
            text: expect.stringMatching(/^Pick \d+\.\d+: .+ \(.+\) was selected by .+\. The draft is complete!$/),
            blocks: [
                expect.objectContaining({
                    type: 'section',
                    text: expect.objectContaining({
                        type: 'mrkdwn',
                        text: expect.stringContaining('PICK ALERT')
                    })
                }),
                expect.objectContaining({
                    type: 'section',
                    fields: expect.arrayContaining([
                        expect.objectContaining({ type: 'mrkdwn', text: expect.stringMatching(/^\*Pick:\* `\d+\.\d+`$/) }),
                        expect.objectContaining({ type: 'mrkdwn', text: expect.stringMatching(/^\*Player:\* `.+ - .+`$/) }),
                        expect.objectContaining({ type: 'mrkdwn', text: expect.stringMatching(/^\*Picked By:\* .+$/) })
                    ])
                }),
                expect.objectContaining({ type: 'divider' }),
                expect.objectContaining({
                    type: 'section',
                    text: expect.objectContaining({
                        type: 'mrkdwn',
                        text: expect.stringMatching(/^\*On The Clock:\* .+$/)
                    })
                })
            ]
        });
    });
});

describe('generateMultiPickMessagePayload', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Mock the getPlayer function to return null (fallback to player_map)
        datastore.getPlayer.mockResolvedValue(null);
        // Mock getDisplayName to return the mapped name
        slackUserService.getDisplayName.mockImplementation((playerData, notify) => {
            return notify ? `<@${playerData}>` : playerData;
        });
    });

    it('should generate multi-pick message with multiple new picks', async () => {
        // Arrange
        const mockDraft = {
            type: 'snake',
            settings: { rounds: 2 },
            draft_order: { 'user1': 1, 'user2': 2 },
            status: 'in_progress'
        };
        const mockPicks = [
            { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One', position: 'RB' }, picked_by: 'user1' },
            { pick_no: 2, round: 1, metadata: { first_name: 'Player', last_name: 'Two', position: 'WR' }, picked_by: 'user2' },
            { pick_no: 3, round: 2, metadata: { first_name: 'Player', last_name: 'Three', position: 'QB' }, picked_by: 'user2' }
        ];
        const mockData = {
            player_map: { 'user1': 'slack_user1', 'user2': 'slack_user2' }
        };
        const newPicksStartIndex = 1; // Start from pick 2

        // Act
        const result = await generateMultiPickMessagePayload(mockDraft, mockPicks, newPicksStartIndex, mockData, false);

        // Assert
        expect(result).toHaveProperty('text');
        expect(result).toHaveProperty('blocks');
        expect(result.text).toContain('2 new picks since last update');
        expect(result.text).toContain('Player Two (WR)');
        expect(result.text).toContain('Player Three (QB)');
        
        // Check blocks structure
        expect(result.blocks).toHaveLength(8); // Header + count + divider + 2 picks + divider between + divider + next picker
        expect(result.blocks[0].text.text).toContain('MULTIPLE PICKS ALERT');
        expect(result.blocks[1].text.text).toContain('2 new picks since last update');
        expect(result.blocks[2].type).toBe('divider');
        
        // Check first pick block
        expect(result.blocks[3].fields).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: '*Pick:* `1.02`' }),
            expect.objectContaining({ text: '*Player:* `Player Two - WR`' }),
            expect.objectContaining({ text: '*Picked By:* slack_user2' })
        ]));
        
        // Check second pick block
        expect(result.blocks[5].fields).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: '*Pick:* `2.01`' }),
            expect.objectContaining({ text: '*Player:* `Player Three - QB`' }),
            expect.objectContaining({ text: '*Picked By:* slack_user2' })
        ]));
        
        // Check next picker
        expect(result.blocks[7].text.text).toContain('*On The Clock:* slack_user1');
    });

    it('should generate multi-pick message with single new pick', async () => {
        // Arrange
        const mockDraft = {
            type: 'linear',
            settings: { rounds: 2 },
            draft_order: { 'user1': 1, 'user2': 2 },
            status: 'in_progress'
        };
        const mockPicks = [
            { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One', position: 'RB' }, picked_by: 'user1' },
            { pick_no: 2, round: 1, metadata: { first_name: 'Player', last_name: 'Two', position: 'WR' }, picked_by: 'user2' }
        ];
        const mockData = {
            player_map: { 'user1': 'slack_user1', 'user2': 'slack_user2' }
        };
        const newPicksStartIndex = 1; // Start from pick 2

        // Act
        const result = await generateMultiPickMessagePayload(mockDraft, mockPicks, newPicksStartIndex, mockData, false);

        // Assert
        expect(result.text).toContain('1 new picks since last update');
        expect(result.blocks[1].text.text).toContain('1 new picks since last update');
        expect(result.blocks).toHaveLength(6); // Header + count + divider + 1 pick + divider + next picker
    });

    it('should handle draft completion correctly', async () => {
        // Arrange
        const mockDraft = {
            type: 'snake',
            settings: { rounds: 1 }, // Only 1 round
            draft_order: { 'user1': 1, 'user2': 2 },
            status: 'complete'
        };
        const mockPicks = [
            { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One', position: 'RB' }, picked_by: 'user1' },
            { pick_no: 2, round: 1, metadata: { first_name: 'Player', last_name: 'Two', position: 'WR' }, picked_by: 'user2' }
        ];
        const mockData = {
            player_map: { 'user1': 'slack_user1', 'user2': 'slack_user2' }
        };
        const newPicksStartIndex = 1;

        // Act
        const result = await generateMultiPickMessagePayload(mockDraft, mockPicks, newPicksStartIndex, mockData, false);

        // Assert
        expect(result.text).toContain('The draft is complete!');
        expect(result.blocks[result.blocks.length - 1].text.text).toContain('*On The Clock:* The draft is complete!');
    });

    it('should handle missing player positions gracefully', async () => {
        // Arrange
        const mockDraft = {
            type: 'snake',
            settings: { rounds: 2 },
            draft_order: { 'user1': 1, 'user2': 2 },
            status: 'in_progress'
        };
        const mockPicks = [
            { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One' }, picked_by: 'user1' }, // No position
            { pick_no: 2, round: 1, metadata: { first_name: 'Player', last_name: 'Two', position: 'WR' }, picked_by: 'user2' }
        ];
        const mockData = {
            player_map: { 'user1': 'slack_user1', 'user2': 'slack_user2' }
        };
        const newPicksStartIndex = 0;

        // Act
        const result = await generateMultiPickMessagePayload(mockDraft, mockPicks, newPicksStartIndex, mockData, false);

        // Assert
        expect(result.blocks[3].fields).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: '*Player:* `Player One - N/A`' })
        ]));
    });

    it('should use @ mentions when notifyNextPicker is true', async () => {
        // Arrange
        const mockDraft = {
            type: 'linear',
            settings: { rounds: 2 },
            draft_order: { 'user1': 1, 'user2': 2 },
            status: 'in_progress'
        };
        const mockPicks = [
            { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One', position: 'RB' }, picked_by: 'user1' }
        ];
        const mockData = {
            player_map: { 'user1': 'slack_user1', 'user2': 'slack_user2' }
        };
        const newPicksStartIndex = 0;

        // Act
        const result = await generateMultiPickMessagePayload(mockDraft, mockPicks, newPicksStartIndex, mockData, true);

        // Assert
        expect(result.blocks[result.blocks.length - 1].text.text).toContain('*On The Clock:* <@slack_user2>');
    });

    it('should handle snake draft pick numbering correctly', async () => {
        // Arrange
        const mockDraft = {
            type: 'snake',
            settings: { rounds: 2 },
            draft_order: { 'user1': 1, 'user2': 2 },
            status: 'in_progress'
        };
        const mockPicks = [
            { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One', position: 'RB' }, picked_by: 'user1' },
            { pick_no: 2, round: 1, metadata: { first_name: 'Player', last_name: 'Two', position: 'WR' }, picked_by: 'user2' },
            { pick_no: 3, round: 2, metadata: { first_name: 'Player', last_name: 'Three', position: 'QB' }, picked_by: 'user2' } // Snake reversal
        ];
        const mockData = {
            player_map: { 'user1': 'slack_user1', 'user2': 'slack_user2' }
        };
        const newPicksStartIndex = 1;

        // Act
        const result = await generateMultiPickMessagePayload(mockDraft, mockPicks, newPicksStartIndex, mockData, false);

        // Assert
        // In snake draft, round 2 reverses order, so pick 3 should be 2.01 (first pick of round 2)
        expect(result.blocks[5].fields).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: '*Pick:* `2.01`' })
        ]));
        
        // Next picker should be user1 (slot 1, but reversed in round 2)
        expect(result.blocks[7].text.text).toContain('*On The Clock:* slack_user1');
    });

    // Comprehensive edge case tests for generateMultiPickMessagePayload
    it('should handle zero new picks gracefully', async () => {
        const mockDraft = {
            type: 'linear',
            settings: { rounds: 1 },
            draft_order: { 'user1': 1 },
            status: 'in_progress'
        };
        const mockPicks = [
            { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One', position: 'RB' }, picked_by: 'user1' }
        ];
        const mockData = { player_map: { 'user1': 'slack_user1' } };
        const newPicksStartIndex = 1; // No new picks

        const result = await generateMultiPickMessagePayload(mockDraft, mockPicks, newPicksStartIndex, mockData, false);

        expect(result.text).toContain('0 new picks since last update');
        expect(result.blocks[1].text.text).toContain('0 new picks since last update');
    });

    it('should handle very large number of new picks with truncation', async () => {
        // Create 15 picks (more than MAX_PICKS_TO_SHOW)
        const mockPicks = Array.from({ length: 15 }, (_, i) => ({
            pick_no: i + 1,
            round: Math.floor(i / 2) + 1,
            metadata: { first_name: 'Player', last_name: `${i + 1}`, position: 'RB' },
            picked_by: 'user1'
        }));

        const mockDraft = {
            type: 'linear',
            settings: { rounds: 8 },
            draft_order: { 'user1': 1, 'user2': 2 },
            status: 'in_progress'
        };
        const mockData = { player_map: { 'user1': 'slack_user1', 'user2': 'slack_user2' } };
        const newPicksStartIndex = 0;

        const result = await generateMultiPickMessagePayload(mockDraft, mockPicks, newPicksStartIndex, mockData, false);

        expect(result.text).toContain('15 new picks since last update');
        expect(result.text).toContain('(and 5 more)'); // Should show truncation
        expect(result.blocks.some(block => 
            block.text && block.text.text && block.text.text.includes('...and 5 more picks')
        )).toBe(true);
    });

    it('should handle picks with missing or null position gracefully', async () => {
        const mockDraft = {
            type: 'linear',
            settings: { rounds: 2 },
            draft_order: { 'user1': 1 },
            status: 'in_progress'
        };
        const mockPicks = [
            { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One' }, picked_by: 'user1' }, // No position
            { pick_no: 2, round: 1, metadata: { first_name: 'Player', last_name: 'Two', position: null }, picked_by: 'user1' } // Null position
        ];
        const mockData = { player_map: { 'user1': 'slack_user1' } };
        const newPicksStartIndex = 0;

        const result = await generateMultiPickMessagePayload(mockDraft, mockPicks, newPicksStartIndex, mockData, false);

        expect(result.blocks[3].fields).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: '*Player:* `Player One - N/A`' })
        ]));
        expect(result.blocks[5].fields).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: '*Player:* `Player Two - N/A`' })
        ]));
    });

    it('should handle draft with 3rd round reversal correctly', async () => {
        const mockDraft = {
            type: 'snake',
            settings: { rounds: 4, reversal_round: 3 },
            draft_order: { 'user1': 1, 'user2': 2 },
            status: 'in_progress'
        };
        const mockPicks = [
            { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One', position: 'RB' }, picked_by: 'user1' },
            { pick_no: 2, round: 1, metadata: { first_name: 'Player', last_name: 'Two', position: 'WR' }, picked_by: 'user2' },
            { pick_no: 3, round: 2, metadata: { first_name: 'Player', last_name: 'Three', position: 'QB' }, picked_by: 'user2' },
            { pick_no: 4, round: 2, metadata: { first_name: 'Player', last_name: 'Four', position: 'TE' }, picked_by: 'user1' },
            { pick_no: 5, round: 3, metadata: { first_name: 'Player', last_name: 'Five', position: 'K' }, picked_by: 'user1' } // 3RR starts here
        ];
        const mockData = { player_map: { 'user1': 'slack_user1', 'user2': 'slack_user2' } };
        const newPicksStartIndex = 2;

        const result = await generateMultiPickMessagePayload(mockDraft, mockPicks, newPicksStartIndex, mockData, false);

        // Should show 3 new picks
        expect(result.text).toContain('3 new picks since last update');
        expect(result.blocks[1].text.text).toContain('3 new picks since last update');
        
        // Next picker should be calculated correctly with 3RR - after pick 5, next is pick 6 in round 3
        // With 5 picks made, next pick is #6. Round 3, position 2. With 3RR flipping the snake, it should be user1
        expect(result.blocks[result.blocks.length - 1].text.text).toContain('*On The Clock:* slack_user1');
    });

    it('should handle empty player_map gracefully', async () => {
        const mockDraft = {
            type: 'linear',
            settings: { rounds: 1 },
            draft_order: { 'user1': 1 },
            status: 'in_progress'
        };
        const mockPicks = [
            { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One', position: 'RB' }, picked_by: 'user1' }
        ];
        const mockData = { player_map: {} }; // Empty player map
        const newPicksStartIndex = 0;

        const result = await generateMultiPickMessagePayload(mockDraft, mockPicks, newPicksStartIndex, mockData, false);

        expect(result.blocks[3].fields).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: '*Picked By:* User ID user1' })
        ]));
        expect(result.blocks[result.blocks.length - 1].text.text).toContain('*On The Clock:* The draft is complete!');
    });

    it('should handle malformed pick metadata gracefully', async () => {
        const mockDraft = {
            type: 'linear',
            settings: { rounds: 1 },
            draft_order: { 'user1': 1 },
            status: 'in_progress'
        };
        const mockPicks = [
            { pick_no: 1, round: 1, metadata: { first_name: '', last_name: '', position: '' }, picked_by: 'user1' }
        ];
        const mockData = { player_map: { 'user1': 'slack_user1' } };
        const newPicksStartIndex = 0;

        const result = await generateMultiPickMessagePayload(mockDraft, mockPicks, newPicksStartIndex, mockData, false);

        expect(result.blocks[3].fields).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: '*Player:* `  - N/A`' })
        ]));
    });

    it('should handle draft with single team correctly', async () => {
        const mockDraft = {
            type: 'linear',
            settings: { rounds: 2 },
            draft_order: { 'user1': 1 }, // Only one team
            status: 'in_progress'
        };
        const mockPicks = [
            { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One', position: 'RB' }, picked_by: 'user1' },
            { pick_no: 2, round: 2, metadata: { first_name: 'Player', last_name: 'Two', position: 'WR' }, picked_by: 'user1' }
        ];
        const mockData = { player_map: { 'user1': 'slack_user1' } };
        const newPicksStartIndex = 1;

        const result = await generateMultiPickMessagePayload(mockDraft, mockPicks, newPicksStartIndex, mockData, false);

        expect(result.blocks[3].fields).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: '*Pick:* `2.01`' })
        ]));
        expect(result.blocks[result.blocks.length - 1].text.text).toContain('*On The Clock:* The draft is complete!');
    });

    it('should handle feature disabled fallback', async () => {
        // Temporarily disable multi-pick feature
        const originalConfig = MULTI_PICK_CONFIG.ENABLE_MULTI_PICK;
        MULTI_PICK_CONFIG.ENABLE_MULTI_PICK = false;

        const mockDraft = {
            type: 'linear',
            settings: { rounds: 2 },
            draft_order: { 'user1': 1, 'user2': 2 },
            status: 'in_progress'
        };
        const mockPicks = [
            { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One', position: 'RB' }, picked_by: 'user1' },
            { pick_no: 2, round: 1, metadata: { first_name: 'Player', last_name: 'Two', position: 'WR' }, picked_by: 'user2' }
        ];
        const mockData = { player_map: { 'user1': 'slack_user1', 'user2': 'slack_user2' } };
        const newPicksStartIndex = 0;

        const result = await generateMultiPickMessagePayload(mockDraft, mockPicks, newPicksStartIndex, mockData, false);

        // Should fall back to single-pick format
        expect(result.text).toContain('Pick 1.02: Player Two');
        expect(result.blocks[0].text.text).toContain('PICK ALERT');

        // Restore original config
        MULTI_PICK_CONFIG.ENABLE_MULTI_PICK = originalConfig;
    });
});

describe('MULTI_PICK_CONFIG', () => {
    it('should have correct default configuration values', () => {
        expect(MULTI_PICK_CONFIG).toEqual({
            MAX_PICKS_TO_SHOW: 10,
            ENABLE_MULTI_PICK: true,
            FALLBACK_TO_SINGLE: true,
            MAX_MESSAGE_BLOCKS: 45,
            ESTIMATED_BLOCKS_PER_PICK: 2
        });
    });
});

describe('estimateBlockCount', () => {
    it('should correctly estimate block count for zero picks', () => {
        const result = estimateBlockCount(0);
        // Base blocks (5) + pick blocks (0) + truncation blocks (2) = 7
        expect(result).toBe(7);
    });

    it('should correctly estimate block count for single pick', () => {
        const result = estimateBlockCount(1);
        // Base blocks (5) + pick blocks (1*2-1=1) + truncation blocks (2) = 8
        expect(result).toBe(8);
    });

    it('should correctly estimate block count for multiple picks', () => {
        const result = estimateBlockCount(3);
        // Base blocks (5) + pick blocks (3*2-1=5) + truncation blocks (2) = 12
        expect(result).toBe(12);
    });

    it('should correctly estimate block count for maximum picks', () => {
        const result = estimateBlockCount(10);
        // Base blocks (5) + pick blocks (10*2-1=19) + truncation blocks (2) = 26
        expect(result).toBe(26);
    });
});

describe('calculateSafePickLimit', () => {
    it('should return config limit when total picks is within safe range', () => {
        const result = calculateSafePickLimit(5);
        expect(result).toBe(5); // Should return the total since it's less than config limit
    });

    it('should return config limit when it fits within block limits', () => {
        const result = calculateSafePickLimit(15);
        expect(result).toBe(10); // Should return config limit (10) since it fits
    });

    it('should return reduced limit when config limit exceeds block limits', () => {
        // Mock a scenario where we need to reduce the limit
        const originalMaxBlocks = MULTI_PICK_CONFIG.MAX_MESSAGE_BLOCKS;
        MULTI_PICK_CONFIG.MAX_MESSAGE_BLOCKS = 15; // Set very low limit
        
        const result = calculateSafePickLimit(20);
        expect(result).toBeLessThan(10); // Should be reduced from config limit
        expect(result).toBeGreaterThan(0); // Should still be positive
        
        // Restore original value
        MULTI_PICK_CONFIG.MAX_MESSAGE_BLOCKS = originalMaxBlocks;
    });

    it('should return minimum of 1 when no picks can fit safely', () => {
        // Mock a scenario where even 1 pick is too much
        const originalMaxBlocks = MULTI_PICK_CONFIG.MAX_MESSAGE_BLOCKS;
        MULTI_PICK_CONFIG.MAX_MESSAGE_BLOCKS = 5; // Set extremely low limit
        
        const result = calculateSafePickLimit(20);
        expect(result).toBe(1); // Should return minimum of 1
        
        // Restore original value
        MULTI_PICK_CONFIG.MAX_MESSAGE_BLOCKS = originalMaxBlocks;
    });

    it('should handle zero total picks', () => {
        const result = calculateSafePickLimit(0);
        expect(result).toBe(0);
    });
});

describe('generateMultiPickMessagePayload - Configuration and Limits', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        datastore.getPlayer.mockResolvedValue(null);
        slackUserService.getDisplayName.mockImplementation((playerData, notify) => {
            return notify ? `<@${playerData}>` : playerData;
        });
    });

    it('should truncate picks when exceeding MAX_PICKS_TO_SHOW limit', async () => {
        // Create many picks to exceed the limit
        const mockPicks = [];
        for (let i = 1; i <= 15; i++) {
            mockPicks.push({
                pick_no: i,
                round: Math.ceil(i / 2),
                metadata: { first_name: 'Player', last_name: `${i}`, position: 'RB' },
                picked_by: 'user1'
            });
        }

        const mockDraft = {
            type: 'linear',
            settings: { rounds: 8 },
            draft_order: { 'user1': 1, 'user2': 2 },
            status: 'in_progress'
        };
        const mockData = {
            player_map: { 'user1': 'slack_user1', 'user2': 'slack_user2' }
        };

        const result = await generateMultiPickMessagePayload(mockDraft, mockPicks, 0, mockData, false);

        // Should show total count in header but only display limited picks
        expect(result.text).toContain('15 new picks since last update');
        expect(result.text).toContain('(and 5 more)'); // 15 - 10 = 5 more
        expect(result.blocks[1].text.text).toContain('15 new picks since last update');
        
        // Should have truncation message
        const truncationBlock = result.blocks.find(block => 
            block.text && block.text.text && block.text.text.includes('...and 5 more picks')
        );
        expect(truncationBlock).toBeDefined();
    });

    it('should not show truncation message when picks are within limit', async () => {
        const mockPicks = [];
        for (let i = 1; i <= 5; i++) {
            mockPicks.push({
                pick_no: i,
                round: 1,
                metadata: { first_name: 'Player', last_name: `${i}`, position: 'RB' },
                picked_by: 'user1'
            });
        }

        const mockDraft = {
            type: 'linear',
            settings: { rounds: 8 },
            draft_order: { 'user1': 1, 'user2': 2 },
            status: 'in_progress'
        };
        const mockData = {
            player_map: { 'user1': 'slack_user1', 'user2': 'slack_user2' }
        };

        const result = await generateMultiPickMessagePayload(mockDraft, mockPicks, 0, mockData, false);

        // Should not have truncation message
        const truncationBlock = result.blocks.find(block => 
            block.text && block.text.text && block.text.text.includes('...and')
        );
        expect(truncationBlock).toBeUndefined();
        
        // Should not have "(and X more)" in fallback text
        expect(result.text).not.toContain('(and');
    });

    it('should fall back to single-pick when ENABLE_MULTI_PICK is false', async () => {
        // Temporarily disable multi-pick feature
        const originalEnabled = MULTI_PICK_CONFIG.ENABLE_MULTI_PICK;
        MULTI_PICK_CONFIG.ENABLE_MULTI_PICK = false;

        const mockPicks = [
            { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One', position: 'RB' }, picked_by: 'user1' },
            { pick_no: 2, round: 1, metadata: { first_name: 'Player', last_name: 'Two', position: 'WR' }, picked_by: 'user2' }
        ];
        const mockDraft = {
            type: 'linear',
            settings: { rounds: 2 },
            draft_order: { 'user1': 1, 'user2': 2 },
            status: 'in_progress'
        };
        const mockData = {
            player_map: { 'user1': 'slack_user1', 'user2': 'slack_user2' }
        };

        const result = await generateMultiPickMessagePayload(mockDraft, mockPicks, 0, mockData, false);

        // Should use single-pick format instead of multi-pick
        expect(result.text).not.toContain('new picks since last update');
        expect(result.text).toContain('Pick 1.02: Player Two'); // Single pick format
        expect(result.blocks[0].text.text).toContain('PICK ALERT'); // Single pick alert

        // Restore original value
        MULTI_PICK_CONFIG.ENABLE_MULTI_PICK = originalEnabled;
    });

    it('should respect message block limits and adjust pick count accordingly', async () => {
        // Temporarily set very low block limit
        const originalMaxBlocks = MULTI_PICK_CONFIG.MAX_MESSAGE_BLOCKS;
        MULTI_PICK_CONFIG.MAX_MESSAGE_BLOCKS = 15;

        const mockPicks = [];
        for (let i = 1; i <= 10; i++) {
            mockPicks.push({
                pick_no: i,
                round: 1,
                metadata: { first_name: 'Player', last_name: `${i}`, position: 'RB' },
                picked_by: 'user1'
            });
        }

        const mockDraft = {
            type: 'linear',
            settings: { rounds: 8 },
            draft_order: { 'user1': 1, 'user2': 2 },
            status: 'in_progress'
        };
        const mockData = {
            player_map: { 'user1': 'slack_user1', 'user2': 'slack_user2' }
        };

        const result = await generateMultiPickMessagePayload(mockDraft, mockPicks, 0, mockData, false);

        // Should have reduced the number of picks shown to fit within block limit
        expect(result.blocks.length).toBeLessThanOrEqual(15);
        
        // Should show truncation message since not all picks could be displayed
        const truncationBlock = result.blocks.find(block => 
            block.text && block.text.text && block.text.text.includes('...and')
        );
        expect(truncationBlock).toBeDefined();

        // Restore original value
        MULTI_PICK_CONFIG.MAX_MESSAGE_BLOCKS = originalMaxBlocks;
    });

    it('should handle edge case with exactly MAX_PICKS_TO_SHOW picks', async () => {
        const mockPicks = [];
        for (let i = 1; i <= 10; i++) { // Exactly the limit
            mockPicks.push({
                pick_no: i,
                round: 1,
                metadata: { first_name: 'Player', last_name: `${i}`, position: 'RB' },
                picked_by: 'user1'
            });
        }

        const mockDraft = {
            type: 'linear',
            settings: { rounds: 8 },
            draft_order: { 'user1': 1, 'user2': 2 },
            status: 'in_progress'
        };
        const mockData = {
            player_map: { 'user1': 'slack_user1', 'user2': 'slack_user2' }
        };

        const result = await generateMultiPickMessagePayload(mockDraft, mockPicks, 0, mockData, false);

        // Should not have truncation message since we're exactly at the limit
        const truncationBlock = result.blocks.find(block => 
            block.text && block.text.text && block.text.text.includes('...and')
        );
        expect(truncationBlock).toBeUndefined();
        
        // Should not have "(and X more)" in fallback text
        expect(result.text).not.toContain('(and');
        expect(result.text).toContain('10 new picks since last update');
    });
});

// Comprehensive integration tests for multi-pick functionality
describe('Multi-pick Integration Tests', () => {
    let say;

    beforeEach(() => {
        jest.clearAllMocks();
        say = jest.fn();
        datastore.getPlayer.mockResolvedValue(null);
        slackUserService.getDisplayName.mockImplementation((playerData, notify) => {
            return notify ? `<@${playerData}>` : playerData;
        });
    });

    it('should integrate pick calculation with message generation for multiple new picks', async () => {
        const command = { channel_id: 'C123' };
        const mockData = {
            player_map: { 'user1': 'slack_user1', 'user2': 'slack_user2', 'user3': 'slack_user3' },
            drafts: {
                'draft123': {
                    slack_channel_id: 'C123',
                    last_known_pick_count: 2
                }
            }
        };
        const mockDraft = {
            type: 'linear',
            settings: { rounds: 3 },
            draft_order: { 'user1': 1, 'user2': 2, 'user3': 3 },
            status: 'in_progress'
        };
        const mockPicks = [
            { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One', position: 'RB' }, picked_by: 'user1' },
            { pick_no: 2, round: 1, metadata: { first_name: 'Player', last_name: 'Two', position: 'WR' }, picked_by: 'user2' },
            { pick_no: 3, round: 1, metadata: { first_name: 'Player', last_name: 'Three', position: 'QB' }, picked_by: 'user3' },
            { pick_no: 4, round: 2, metadata: { first_name: 'Player', last_name: 'Four', position: 'TE' }, picked_by: 'user1' },
            { pick_no: 5, round: 2, metadata: { first_name: 'Player', last_name: 'Five', position: 'K' }, picked_by: 'user2' }
        ];

        datastore.getData.mockResolvedValue(mockData);
        sleeper.getDraft.mockResolvedValue(mockDraft);
        sleeper.getDraftPicks.mockResolvedValue(mockPicks);
        
        // Mock validation and calculation to work correctly
        pickUtils.validatePickData.mockReturnValue({ isValid: true, error: null });
        pickUtils.getNewPicksSinceLastUpdate.mockReturnValue({
            hasNewPicks: true,
            count: 3, // 3 new picks since last_known_pick_count = 2
            startIndex: 2,
            newPicks: mockPicks.slice(2) // picks 3, 4, 5
        });

        await handleLastPickCommand({ command, say });

        // Verify integration: validation called with correct parameters
        expect(pickUtils.validatePickData).toHaveBeenCalledWith(mockPicks, 2);
        expect(pickUtils.getNewPicksSinceLastUpdate).toHaveBeenCalledWith(mockPicks, 2);
        
        // Verify multi-pick message was generated
        expect(say).toHaveBeenCalledWith(expect.objectContaining({
            text: expect.stringContaining('3 new picks since last update'),
            blocks: expect.arrayContaining([
                expect.objectContaining({
                    text: expect.objectContaining({
                        text: expect.stringContaining('MULTIPLE PICKS ALERT')
                    })
                })
            ])
        }));
    });

    it('should handle error in pick calculation and fall back gracefully', async () => {
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
            type: 'linear',
            settings: { rounds: 2 },
            draft_order: { 'user1': 1, 'user2': 2 },
            status: 'in_progress'
        };
        const mockPicks = [
            { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One', position: 'RB' }, picked_by: 'user1' },
            { pick_no: 2, round: 1, metadata: { first_name: 'Player', last_name: 'Two', position: 'WR' }, picked_by: 'user2' }
        ];

        datastore.getData.mockResolvedValue(mockData);
        sleeper.getDraft.mockResolvedValue(mockDraft);
        sleeper.getDraftPicks.mockResolvedValue(mockPicks);
        
        // Mock validation to pass but calculation to throw error
        pickUtils.validatePickData.mockReturnValue({ isValid: true, error: null });
        pickUtils.getNewPicksSinceLastUpdate.mockImplementation(() => {
            throw new Error('Unexpected calculation error');
        });

        await handleLastPickCommand({ command, say });

        // Should fall back to single-pick display
        expect(say).toHaveBeenCalledWith(expect.objectContaining({
            text: expect.stringContaining('Pick 1.02: Player Two'),
            blocks: expect.arrayContaining([
                expect.objectContaining({
                    text: expect.objectContaining({
                        text: expect.stringContaining('PICK ALERT')
                    })
                })
            ])
        }));
    });

    it('should handle validation failure and fall back to single-pick display', async () => {
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
            type: 'linear',
            settings: { rounds: 2 },
            draft_order: { 'user1': 1, 'user2': 2 },
            status: 'in_progress'
        };
        const mockPicks = [
            { pick_no: 2, round: 1, metadata: { first_name: 'Player', last_name: 'Two', position: 'WR' }, picked_by: 'user2' },
            { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One', position: 'RB' }, picked_by: 'user1' } // Out of order
        ];

        datastore.getData.mockResolvedValue(mockData);
        sleeper.getDraft.mockResolvedValue(mockDraft);
        sleeper.getDraftPicks.mockResolvedValue(mockPicks);
        
        // Mock validation to fail due to chronological order
        pickUtils.validatePickData.mockReturnValue({ 
            isValid: false, 
            error: 'Picks are not in chronological order' 
        });

        await handleLastPickCommand({ command, say });

        // Should not call getNewPicksSinceLastUpdate
        expect(pickUtils.getNewPicksSinceLastUpdate).not.toHaveBeenCalled();
        
        // Should fall back to single-pick display
        expect(say).toHaveBeenCalledWith(expect.objectContaining({
            text: expect.stringContaining('Pick 1.01: Player One'),
            blocks: expect.arrayContaining([
                expect.objectContaining({
                    text: expect.objectContaining({
                        text: expect.stringContaining('PICK ALERT')
                    })
                })
            ])
        }));
    });

    it('should handle edge case where picks array is empty after API call', async () => {
        const command = { channel_id: 'C123' };
        const mockData = {
            player_map: { 'user1': 'slack_user1' },
            drafts: {
                'draft123': {
                    slack_channel_id: 'C123',
                    last_known_pick_count: 0
                }
            }
        };
        const mockDraft = {
            type: 'linear',
            settings: { rounds: 1 },
            draft_order: { 'user1': 1 },
            status: 'pre_draft'
        };
        const mockPicks = []; // Empty picks array

        datastore.getData.mockResolvedValue(mockData);
        sleeper.getDraft.mockResolvedValue(mockDraft);
        sleeper.getDraftPicks.mockResolvedValue(mockPicks);

        await handleLastPickCommand({ command, say });

        // Should handle pre-draft status
        expect(say).toHaveBeenCalledWith('The draft for ID `draft123` has not started yet.');
        expect(pickUtils.validatePickData).not.toHaveBeenCalled();
        expect(pickUtils.getNewPicksSinceLastUpdate).not.toHaveBeenCalled();
    });

    it('should handle corrupted draft data gracefully', async () => {
        const command = { channel_id: 'C123' };
        const mockData = {
            player_map: { 'user1': 'slack_user1' },
            drafts: {
                'draft123': {
                    slack_channel_id: 'C123',
                    last_known_pick_count: 1
                }
            }
        };
        const mockDraft = null; // Corrupted/missing draft data
        const mockPicks = [
            { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One', position: 'RB' }, picked_by: 'user1' }
        ];

        datastore.getData.mockResolvedValue(mockData);
        sleeper.getDraft.mockResolvedValue(mockDraft);
        sleeper.getDraftPicks.mockResolvedValue(mockPicks);

        await handleLastPickCommand({ command, say });

        expect(say).toHaveBeenCalledWith('Could not find a draft or picks for ID `draft123`. Please check the ID and try again.');
        expect(pickUtils.validatePickData).not.toHaveBeenCalled();
        expect(pickUtils.getNewPicksSinceLastUpdate).not.toHaveBeenCalled();
    });

    it('should handle API timeout/failure during pick retrieval', async () => {
        const command = { channel_id: 'C123' };
        const mockData = {
            player_map: { 'user1': 'slack_user1' },
            drafts: {
                'draft123': {
                    slack_channel_id: 'C123',
                    last_known_pick_count: 1
                }
            }
        };

        datastore.getData.mockResolvedValue(mockData);
        sleeper.getDraft.mockRejectedValue(new Error('Network timeout'));
        sleeper.getDraftPicks.mockRejectedValue(new Error('Network timeout'));

        await handleLastPickCommand({ command, say });

        expect(say).toHaveBeenCalledWith(expect.stringContaining("Sorry, I couldn't fetch the draft details."));
        expect(pickUtils.validatePickData).not.toHaveBeenCalled();
        expect(pickUtils.getNewPicksSinceLastUpdate).not.toHaveBeenCalled();
    });

    it('should handle mixed valid and invalid pick data', async () => {
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
            type: 'linear',
            settings: { rounds: 2 },
            draft_order: { 'user1': 1, 'user2': 2 },
            status: 'in_progress'
        };
        const mockPicks = [
            { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One', position: 'RB' }, picked_by: 'user1' },
            { pick_no: 2, round: 1, metadata: null, picked_by: 'user2' } // Invalid metadata
        ];

        datastore.getData.mockResolvedValue(mockData);
        sleeper.getDraft.mockResolvedValue(mockDraft);
        sleeper.getDraftPicks.mockResolvedValue(mockPicks);
        
        // Mock validation to fail due to invalid metadata
        pickUtils.validatePickData.mockReturnValue({ 
            isValid: false, 
            error: 'Pick at index 1 is missing required fields (metadata, picked_by, or round)' 
        });

        await handleLastPickCommand({ command, say });

        expect(pickUtils.validatePickData).toHaveBeenCalledWith(mockPicks, 1);
        expect(pickUtils.getNewPicksSinceLastUpdate).not.toHaveBeenCalled();
        
        // Should show error message due to corrupted pick data causing crash
        expect(say).toHaveBeenCalledWith(expect.stringContaining("Sorry, I couldn't fetch the draft details."));
    });
});

// Tests for utility functions
describe('Utility Functions', () => {
    describe('estimateBlockCount', () => {
        it('should correctly estimate block count for zero picks', () => {
            const result = estimateBlockCount(0);
            // Base blocks (5) + pick blocks (0) + truncation blocks (2) = 7
            expect(result).toBe(7);
        });

        it('should correctly estimate block count for single pick', () => {
            const result = estimateBlockCount(1);
            // Base blocks (5) + pick blocks (1*2-1=1) + truncation blocks (2) = 8
            expect(result).toBe(8);
        });

        it('should correctly estimate block count for multiple picks', () => {
            const result = estimateBlockCount(3);
            // Base blocks (5) + pick blocks (3*2-1=5) + truncation blocks (2) = 12
            expect(result).toBe(12);
        });

        it('should correctly estimate block count for maximum picks', () => {
            const result = estimateBlockCount(10);
            // Base blocks (5) + pick blocks (10*2-1=19) + truncation blocks (2) = 26
            expect(result).toBe(26);
        });

        it('should handle edge case of negative picks', () => {
            const result = estimateBlockCount(-1);
            // Should treat as 0 picks
            expect(result).toBe(7);
        });
    });

    describe('calculateSafePickLimit', () => {
        it('should return 0 for zero total picks', () => {
            const result = calculateSafePickLimit(0);
            expect(result).toBe(0);
        });

        it('should return config limit when all picks fit safely', () => {
            const result = calculateSafePickLimit(5);
            expect(result).toBe(5); // Should be within safe limits
        });

        it('should limit picks when they would exceed block limit', () => {
            const result = calculateSafePickLimit(50); // Very large number
            expect(result).toBeLessThanOrEqual(MULTI_PICK_CONFIG.MAX_PICKS_TO_SHOW);
            expect(result).toBeGreaterThan(0);
        });

        it('should return at least 1 when total picks is positive', () => {
            const result = calculateSafePickLimit(1);
            expect(result).toBe(1);
        });

        it('should handle edge case where even 1 pick might be too much', () => {
            // This is a theoretical edge case - in practice, 1 pick should always fit
            const result = calculateSafePickLimit(1);
            expect(result).toBeGreaterThanOrEqual(1);
        });
    });
});

// Error handling and fallback behavior tests
describe('Error Handling and Fallback Behavior', () => {
    let say;

    beforeEach(() => {
        jest.clearAllMocks();
        say = jest.fn();
        datastore.getPlayer.mockResolvedValue(null);
        slackUserService.getDisplayName.mockImplementation((playerData, notify) => {
            return notify ? `<@${playerData}>` : playerData;
        });
    });

    it('should handle datastore read failure gracefully', async () => {
        const command = { channel_id: 'C123' };
        
        datastore.getData.mockRejectedValue(new Error('Database connection failed'));

        await handleLastPickCommand({ command, say });

        expect(say).toHaveBeenCalledWith("I couldn't read my configuration file (`data.json`). Please make sure I am set up correctly.");
        expect(sleeper.getDraft).not.toHaveBeenCalled();
        expect(sleeper.getDraftPicks).not.toHaveBeenCalled();
    });

    it('should handle missing drafts object in data', async () => {
        const command = { channel_id: 'C123' };
        const mockData = {
            player_map: { 'user1': 'slack_user1' }
            // Missing drafts object
        };

        datastore.getData.mockResolvedValue(mockData);

        await handleLastPickCommand({ command, say });

        expect(say).toHaveBeenCalledWith('There is no draft registered for this channel. Please use `@YourBotName registerdraft [draft_id]` to get started.');
    });

    it('should handle malformed draft info gracefully', async () => {
        const command = { channel_id: 'C123' };
        const mockData = {
            player_map: { 'user1': 'slack_user1' },
            drafts: {
                'draft123': {
                    slack_channel_id: 'C123',
                    last_known_pick_count: 'not_a_number' // Invalid type
                }
            }
        };
        const mockDraft = {
            type: 'linear',
            settings: { rounds: 1 },
            draft_order: { 'user1': 1 },
            status: 'in_progress'
        };
        const mockPicks = [
            { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One', position: 'RB' }, picked_by: 'user1' }
        ];

        datastore.getData.mockResolvedValue(mockData);
        sleeper.getDraft.mockResolvedValue(mockDraft);
        sleeper.getDraftPicks.mockResolvedValue(mockPicks);

        await handleLastPickCommand({ command, say });

        // Should fall back to single-pick display due to invalid last_known_pick_count
        expect(pickUtils.validatePickData).not.toHaveBeenCalled();
        expect(pickUtils.getNewPicksSinceLastUpdate).not.toHaveBeenCalled();
        expect(say).toHaveBeenCalledWith(expect.objectContaining({
            text: expect.stringContaining('Pick 1.01: Player One')
        }));
    });

    it('should handle player service failures gracefully', async () => {
        const mockDraft = {
            type: 'linear',
            settings: { rounds: 1 },
            draft_order: { 'user1': 1 },
            status: 'in_progress'
        };
        const mockPicks = [
            { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One', position: 'RB' }, picked_by: 'user1' }
        ];
        const mockData = { player_map: {} }; // Empty player map
        const newPicksStartIndex = 0;

        // Mock getPlayer to throw error
        datastore.getPlayer.mockRejectedValue(new Error('Player service unavailable'));

        const result = await generateMultiPickMessagePayload(mockDraft, mockPicks, newPicksStartIndex, mockData, false);

        // Should fall back to User ID format
        expect(result.blocks[3].fields).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: '*Picked By:* User ID user1' })
        ]));
    });

    it('should handle missing draft_order gracefully', async () => {
        const mockDraft = {
            type: 'linear',
            settings: { rounds: 1 },
            draft_order: {}, // Empty draft order
            status: 'in_progress'
        };
        const mockPicks = [
            { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One', position: 'RB' }, picked_by: 'user1' }
        ];
        const mockData = { player_map: { 'user1': 'slack_user1' } };
        const newPicksStartIndex = 0;

        const result = await generateMultiPickMessagePayload(mockDraft, mockPicks, newPicksStartIndex, mockData, false);

        // Should handle gracefully and show draft complete
        expect(result.blocks[result.blocks.length - 1].text.text).toContain('*On The Clock:* The draft is complete!');
    });

    it('should handle concurrent API failures', async () => {
        const command = { channel_id: 'C123' };
        const mockData = {
            player_map: { 'user1': 'slack_user1' },
            drafts: {
                'draft123': {
                    slack_channel_id: 'C123',
                    last_known_pick_count: 1
                }
            }
        };

        datastore.getData.mockResolvedValue(mockData);
        // Both API calls fail
        sleeper.getDraft.mockRejectedValue(new Error('Draft API failed'));
        sleeper.getDraftPicks.mockRejectedValue(new Error('Picks API failed'));

        await handleLastPickCommand({ command, say });

        expect(say).toHaveBeenCalledWith(expect.stringContaining("Sorry, I couldn't fetch the draft details."));
    });
});