const { handleLastPickCommand } = require('../../handlers/lastpick.js');
const datastore = require('../../services/datastore.js');
const sleeper = require('../../services/sleeper.js');
const slackUserService = require('../../services/slackUserService.js');
const pickUtils = require('../../shared/pickUtils.js');

// Mock the services that the handler depends on
jest.mock('../../services/datastore.js');
jest.mock('../../services/sleeper.js');
jest.mock('../../services/slackUserService.js');
jest.mock('../../shared/pickUtils.js');

describe('lastpick integration tests - end-to-end command flow', () => {
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
    });

    describe('Multiple new picks scenario', () => {
        it('should display multiple picks when 3 new picks exist since last update', async () => {
            // Arrange: Set up scenario with 3 new picks since last known count of 2
            const command = { channel_id: 'C123' };
            const mockData = {
                player_map: { 
                    'user1': 'slack_user1', 
                    'user2': 'slack_user2',
                    'user3': 'slack_user3',
                    'user4': 'slack_user4'
                },
                drafts: {
                    'draft123': {
                        slack_channel_id: 'C123',
                        last_known_pick_count: 2 // 3 new picks since this baseline
                    }
                }
            };
            const mockDraft = {
                type: 'snake',
                settings: { rounds: 3, teams: 4 },
                draft_order: { 'user1': 1, 'user2': 2, 'user3': 3, 'user4': 4 },
                status: 'in_progress'
            };
            const mockPicks = [
                { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One', position: 'RB' }, picked_by: 'user1' },
                { pick_no: 2, round: 1, metadata: { first_name: 'Player', last_name: 'Two', position: 'WR' }, picked_by: 'user2' },
                { pick_no: 3, round: 1, metadata: { first_name: 'Player', last_name: 'Three', position: 'QB' }, picked_by: 'user3' },
                { pick_no: 4, round: 1, metadata: { first_name: 'Player', last_name: 'Four', position: 'TE' }, picked_by: 'user4' },
                { pick_no: 5, round: 2, metadata: { first_name: 'Player', last_name: 'Five', position: 'K' }, picked_by: 'user4' }
            ];

            datastore.getData.mockResolvedValue(mockData);
            sleeper.getDraft.mockResolvedValue(mockDraft);
            sleeper.getDraftPicks.mockResolvedValue(mockPicks);
            
            // Mock validation to pass and return 3 new picks
            pickUtils.validatePickData.mockReturnValue({ isValid: true, error: null });
            pickUtils.getNewPicksSinceLastUpdate.mockReturnValue({
                hasNewPicks: true,
                count: 3,
                startIndex: 2,
                newPicks: mockPicks.slice(2) // picks 3, 4, 5
            });

            // Act
            await handleLastPickCommand({ command, say });

            // Assert
            expect(datastore.getData).toHaveBeenCalledTimes(1);
            expect(sleeper.getDraft).toHaveBeenCalledWith('draft123');
            expect(sleeper.getDraftPicks).toHaveBeenCalledWith('draft123');
            expect(pickUtils.validatePickData).toHaveBeenCalledWith(mockPicks, 2);
            expect(pickUtils.getNewPicksSinceLastUpdate).toHaveBeenCalledWith(mockPicks, 2);
            
            expect(say).toHaveBeenCalledTimes(1);
            const messagePayload = say.mock.calls[0][0];
            
            // Verify multi-pick format is used
            expect(messagePayload.text).toContain('3 new picks since last update');
            expect(messagePayload.text).toContain('Player Three (QB)');
            expect(messagePayload.text).toContain('Player Four (TE)');
            expect(messagePayload.text).toContain('Player Five (K)');
            
            // Verify blocks structure for multi-pick display
            expect(messagePayload.blocks).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    text: expect.objectContaining({
                        text: expect.stringContaining('MULTIPLE PICKS ALERT')
                    })
                }),
                expect.objectContaining({
                    text: expect.objectContaining({
                        text: expect.stringContaining('3 new picks since last update')
                    })
                })
            ]));
            
            // Verify individual pick blocks are present
            expect(messagePayload.blocks).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    fields: expect.arrayContaining([
                        expect.objectContaining({ text: '*Pick:* `1.03`' }),
                        expect.objectContaining({ text: '*Player:* `Player Three - QB`' })
                    ])
                })
            ]));
        });

        it('should handle API failures during multi-pick retrieval gracefully', async () => {
            // Arrange: Set up scenario where Sleeper API fails
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
            sleeper.getDraft.mockRejectedValue(new Error('Sleeper API timeout'));

            // Act
            await handleLastPickCommand({ command, say });

            // Assert
            expect(say).toHaveBeenCalledTimes(1);
            expect(say).toHaveBeenCalledWith(expect.stringContaining("Sorry, I couldn't fetch the draft details."));
        });

        it('should handle data corruption during multi-pick processing', async () => {
            // Arrange: Set up scenario with corrupted pick data
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
            const corruptedPicks = [
                { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One' }, picked_by: 'user1' },
                { pick_no: 3, round: 1, metadata: { first_name: 'Player', last_name: 'Three' }, picked_by: 'user2' } // Missing pick 2
            ];

            datastore.getData.mockResolvedValue(mockData);
            sleeper.getDraft.mockResolvedValue(mockDraft);
            sleeper.getDraftPicks.mockResolvedValue(corruptedPicks);
            
            // Mock validation to fail due to corruption
            pickUtils.validatePickData.mockReturnValue({ 
                isValid: false, 
                error: 'Picks are not in chronological order' 
            });

            // Act
            await handleLastPickCommand({ command, say });

            // Assert
            expect(pickUtils.validatePickData).toHaveBeenCalledWith(corruptedPicks, 1);
            expect(pickUtils.getNewPicksSinceLastUpdate).not.toHaveBeenCalled();
            
            expect(say).toHaveBeenCalledTimes(1);
            const messagePayload = say.mock.calls[0][0];
            
            // Should fall back to single-pick display
            expect(messagePayload.text).toContain('Pick 1.01: Player Three');
            expect(messagePayload.text).not.toContain('new picks since last update');
        });
    });

    describe('Single new pick scenario', () => {
        it('should use existing single-pick format when only 1 new pick exists', async () => {
            // Arrange: Set up scenario with only 1 new pick
            const command = { channel_id: 'C123' };
            const mockData = {
                player_map: { 'user1': 'slack_user1', 'user2': 'slack_user2' },
                drafts: {
                    'draft123': {
                        slack_channel_id: 'C123',
                        last_known_pick_count: 1 // Only 1 new pick since this baseline
                    }
                }
            };
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

            datastore.getData.mockResolvedValue(mockData);
            sleeper.getDraft.mockResolvedValue(mockDraft);
            sleeper.getDraftPicks.mockResolvedValue(mockPicks);
            
            // Mock validation to pass but only 1 new pick
            pickUtils.validatePickData.mockReturnValue({ isValid: true, error: null });
            pickUtils.getNewPicksSinceLastUpdate.mockReturnValue({
                hasNewPicks: true,
                count: 1, // Only one new pick
                startIndex: 1,
                newPicks: [mockPicks[1]]
            });

            // Act
            await handleLastPickCommand({ command, say });

            // Assert
            expect(pickUtils.validatePickData).toHaveBeenCalledWith(mockPicks, 1);
            expect(pickUtils.getNewPicksSinceLastUpdate).toHaveBeenCalledWith(mockPicks, 1);
            
            expect(say).toHaveBeenCalledTimes(1);
            const messagePayload = say.mock.calls[0][0];
            
            // Should use single-pick format (not multi-pick)
            expect(messagePayload.text).toContain('Pick 1.02: Player Two (WR)');
            expect(messagePayload.text).not.toContain('new picks since last update');
            expect(messagePayload.text).toContain('Next up: slack_user1');
            
            // Verify single-pick blocks structure
            expect(messagePayload.blocks).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    text: expect.objectContaining({
                        text: expect.stringContaining('PICK ALERT')
                    })
                })
            ]));
            expect(messagePayload.blocks).not.toEqual(expect.arrayContaining([
                expect.objectContaining({
                    text: expect.objectContaining({
                        text: expect.stringContaining('MULTIPLE PICKS ALERT')
                    })
                })
            ]));
        });
    });

    describe('No new picks scenario', () => {
        it('should display most recent pick when no new picks since last update', async () => {
            // Arrange: Set up scenario with no new picks
            const command = { channel_id: 'C123' };
            const mockData = {
                player_map: { 'user1': 'slack_user1', 'user2': 'slack_user2' },
                drafts: {
                    'draft123': {
                        slack_channel_id: 'C123',
                        last_known_pick_count: 2 // No new picks since this baseline
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
                { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One', position: 'RB' }, picked_by: 'user1' },
                { pick_no: 2, round: 1, metadata: { first_name: 'Player', last_name: 'Two', position: 'WR' }, picked_by: 'user2' }
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

            // Act
            await handleLastPickCommand({ command, say });

            // Assert
            expect(pickUtils.validatePickData).toHaveBeenCalledWith(mockPicks, 2);
            expect(pickUtils.getNewPicksSinceLastUpdate).toHaveBeenCalledWith(mockPicks, 2);
            
            expect(say).toHaveBeenCalledTimes(1);
            const messagePayload = say.mock.calls[0][0];
            
            // Should use single-pick format showing most recent pick
            expect(messagePayload.text).toContain('Pick 1.02: Player Two (WR)');
            expect(messagePayload.text).not.toContain('new picks since last update');
            expect(messagePayload.text).toContain('Next up: slack_user2');
            
            // Verify single-pick blocks structure
            expect(messagePayload.blocks).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    text: expect.objectContaining({
                        text: expect.stringContaining('PICK ALERT')
                    })
                })
            ]));
        });
    });

    describe('Error scenarios with API failures and data corruption', () => {
        it('should handle datastore getData failure gracefully', async () => {
            // Arrange: Set up scenario where datastore fails
            const command = { channel_id: 'C123' };
            
            datastore.getData.mockRejectedValue(new Error('DynamoDB connection failed'));

            // Act
            await handleLastPickCommand({ command, say });

            // Assert
            expect(say).toHaveBeenCalledTimes(1);
            expect(say).toHaveBeenCalledWith("I couldn't read my configuration file (`data.json`). Please make sure I am set up correctly.");
            
            // Should not call other services
            expect(sleeper.getDraft).not.toHaveBeenCalled();
            expect(sleeper.getDraftPicks).not.toHaveBeenCalled();
        });

        it('should handle getDraftPicks API failure gracefully', async () => {
            // Arrange: Set up scenario where getDraftPicks fails
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
            const mockDraft = {
                type: 'linear',
                settings: { rounds: 2, teams: 2 },
                draft_order: { 'user1': 1, 'user2': 2 },
                status: 'in_progress'
            };

            datastore.getData.mockResolvedValue(mockData);
            sleeper.getDraft.mockResolvedValue(mockDraft);
            sleeper.getDraftPicks.mockRejectedValue(new Error('Sleeper API rate limit exceeded'));

            // Act
            await handleLastPickCommand({ command, say });

            // Assert
            expect(say).toHaveBeenCalledTimes(1);
            expect(say).toHaveBeenCalledWith(expect.stringContaining("Sorry, I couldn't fetch the draft details."));
        });

        it('should handle missing draft data gracefully', async () => {
            // Arrange: Set up scenario where draft is not found
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
            sleeper.getDraft.mockResolvedValue(null); // Draft not found
            sleeper.getDraftPicks.mockResolvedValue([]);

            // Act
            await handleLastPickCommand({ command, say });

            // Assert
            expect(say).toHaveBeenCalledTimes(1);
            expect(say).toHaveBeenCalledWith("Could not find a draft or picks for ID `draft123`. Please check the ID and try again.");
        });

        it('should handle missing picks data gracefully', async () => {
            // Arrange: Set up scenario where picks are not found
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
            const mockDraft = {
                type: 'linear',
                settings: { rounds: 2, teams: 2 },
                draft_order: { 'user1': 1, 'user2': 2 },
                status: 'in_progress'
            };

            datastore.getData.mockResolvedValue(mockData);
            sleeper.getDraft.mockResolvedValue(mockDraft);
            sleeper.getDraftPicks.mockResolvedValue(null); // Picks not found

            // Act
            await handleLastPickCommand({ command, say });

            // Assert
            expect(say).toHaveBeenCalledTimes(1);
            expect(say).toHaveBeenCalledWith("Could not find a draft or picks for ID `draft123`. Please check the ID and try again.");
        });

        it('should handle draft not started scenario', async () => {
            // Arrange: Set up scenario where draft hasn't started
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
                settings: { rounds: 2, teams: 2 },
                draft_order: { 'user1': 1, 'user2': 2 },
                status: 'pre_draft'
            };

            datastore.getData.mockResolvedValue(mockData);
            sleeper.getDraft.mockResolvedValue(mockDraft);
            sleeper.getDraftPicks.mockResolvedValue([]);

            // Act
            await handleLastPickCommand({ command, say });

            // Assert
            expect(say).toHaveBeenCalledTimes(1);
            expect(say).toHaveBeenCalledWith('The draft for ID `draft123` has not started yet.');
            
            // Should not call validation functions
            expect(pickUtils.validatePickData).not.toHaveBeenCalled();
            expect(pickUtils.getNewPicksSinceLastUpdate).not.toHaveBeenCalled();
        });

        it('should handle no draft registered for channel', async () => {
            // Arrange: Set up scenario where no draft is registered for the channel
            const command = { channel_id: 'C_UNREGISTERED' };
            const mockData = {
                player_map: { 'user1': 'slack_user1' },
                drafts: {
                    'draft123': {
                        slack_channel_id: 'C123', // Different channel
                        last_known_pick_count: 1
                    }
                }
            };

            datastore.getData.mockResolvedValue(mockData);

            // Act
            await handleLastPickCommand({ command, say });

            // Assert
            expect(say).toHaveBeenCalledTimes(1);
            expect(say).toHaveBeenCalledWith('There is no draft registered for this channel. Please use `@YourBotName registerdraft [draft_id]` to get started.');
            
            // Should not call Sleeper API
            expect(sleeper.getDraft).not.toHaveBeenCalled();
            expect(sleeper.getDraftPicks).not.toHaveBeenCalled();
        });

        it('should handle corrupted last_known_pick_count data', async () => {
            // Arrange: Set up scenario with invalid last_known_pick_count
            const command = { channel_id: 'C123' };
            const mockData = {
                player_map: { 'user1': 'slack_user1', 'user2': 'slack_user2' },
                drafts: {
                    'draft123': {
                        slack_channel_id: 'C123',
                        last_known_pick_count: 'invalid_string' // Corrupted data
                    }
                }
            };
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

            datastore.getData.mockResolvedValue(mockData);
            sleeper.getDraft.mockResolvedValue(mockDraft);
            sleeper.getDraftPicks.mockResolvedValue(mockPicks);

            // Act
            await handleLastPickCommand({ command, say });

            // Assert
            expect(say).toHaveBeenCalledTimes(1);
            const messagePayload = say.mock.calls[0][0];
            
            // Should fall back to single-pick display
            expect(messagePayload.text).toContain('Pick 1.02: Player Two (WR)');
            expect(messagePayload.text).not.toContain('new picks since last update');
            
            // Should not call validation functions due to invalid baseline
            expect(pickUtils.validatePickData).not.toHaveBeenCalled();
            expect(pickUtils.getNewPicksSinceLastUpdate).not.toHaveBeenCalled();
        });

        it('should handle getNewPicksSinceLastUpdate throwing an error', async () => {
            // Arrange: Set up scenario where pick calculation fails
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
                settings: { rounds: 2, teams: 2 },
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
            
            // Mock validation to pass but calculation to throw
            pickUtils.validatePickData.mockReturnValue({ isValid: true, error: null });
            pickUtils.getNewPicksSinceLastUpdate.mockImplementation(() => {
                throw new Error('Calculation error in pick range');
            });

            // Act
            await handleLastPickCommand({ command, say });

            // Assert
            expect(pickUtils.validatePickData).toHaveBeenCalledWith(mockPicks, 1);
            expect(pickUtils.getNewPicksSinceLastUpdate).toHaveBeenCalledWith(mockPicks, 1);
            
            expect(say).toHaveBeenCalledTimes(1);
            const messagePayload = say.mock.calls[0][0];
            
            // Should fall back to single-pick display
            expect(messagePayload.text).toContain('Pick 1.02: Player Two (WR)');
            expect(messagePayload.text).not.toContain('new picks since last update');
        });
    });

    describe('Edge cases and boundary conditions', () => {
        it('should handle draft completion with multiple new picks', async () => {
            // Arrange: Set up scenario where draft is complete with multiple final picks
            const command = { channel_id: 'C123' };
            const mockData = {
                player_map: { 'user1': 'slack_user1', 'user2': 'slack_user2' },
                drafts: {
                    'draft123': {
                        slack_channel_id: 'C123',
                        last_known_pick_count: 2 // 2 new picks to complete the draft
                    }
                }
            };
            const mockDraft = {
                type: 'linear',
                settings: { rounds: 2, teams: 2 }, // Total 4 picks
                draft_order: { 'user1': 1, 'user2': 2 },
                status: 'complete'
            };
            const mockPicks = [
                { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One', position: 'RB' }, picked_by: 'user1' },
                { pick_no: 2, round: 1, metadata: { first_name: 'Player', last_name: 'Two', position: 'WR' }, picked_by: 'user2' },
                { pick_no: 3, round: 2, metadata: { first_name: 'Player', last_name: 'Three', position: 'QB' }, picked_by: 'user2' },
                { pick_no: 4, round: 2, metadata: { first_name: 'Player', last_name: 'Four', position: 'TE' }, picked_by: 'user1' }
            ];

            datastore.getData.mockResolvedValue(mockData);
            sleeper.getDraft.mockResolvedValue(mockDraft);
            sleeper.getDraftPicks.mockResolvedValue(mockPicks);
            
            // Mock validation to pass with 2 new picks
            pickUtils.validatePickData.mockReturnValue({ isValid: true, error: null });
            pickUtils.getNewPicksSinceLastUpdate.mockReturnValue({
                hasNewPicks: true,
                count: 2,
                startIndex: 2,
                newPicks: mockPicks.slice(2) // Last 2 picks
            });

            // Act
            await handleLastPickCommand({ command, say });

            // Assert
            expect(say).toHaveBeenCalledTimes(1);
            const messagePayload = say.mock.calls[0][0];
            
            // Should use multi-pick format and indicate draft completion
            expect(messagePayload.text).toContain('2 new picks since last update');
            expect(messagePayload.text).toContain('The draft is complete!');
            expect(messagePayload.blocks).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    text: expect.objectContaining({
                        text: expect.stringContaining('*On The Clock:* The draft is complete!')
                    })
                })
            ]));
        });

        it('should handle empty drafts object in data', async () => {
            // Arrange: Set up scenario with empty drafts object
            const command = { channel_id: 'C123' };
            const mockData = {
                player_map: { 'user1': 'slack_user1' },
                drafts: {} // Empty drafts object
            };

            datastore.getData.mockResolvedValue(mockData);

            // Act
            await handleLastPickCommand({ command, say });

            // Assert
            expect(say).toHaveBeenCalledTimes(1);
            expect(say).toHaveBeenCalledWith('There is no draft registered for this channel. Please use `@YourBotName registerdraft [draft_id]` to get started.');
        });

        it('should handle missing drafts property in data', async () => {
            // Arrange: Set up scenario with missing drafts property
            const command = { channel_id: 'C123' };
            const mockData = {
                player_map: { 'user1': 'slack_user1' }
                // Missing drafts property
            };

            datastore.getData.mockResolvedValue(mockData);

            // Act
            await handleLastPickCommand({ command, say });

            // Assert
            expect(say).toHaveBeenCalledTimes(1);
            expect(say).toHaveBeenCalledWith('There is no draft registered for this channel. Please use `@YourBotName registerdraft [draft_id]` to get started.');
        });

        it('should handle zero last_known_pick_count with multiple picks', async () => {
            // Arrange: Set up scenario with zero baseline (first run)
            const command = { channel_id: 'C123' };
            const mockData = {
                player_map: { 'user1': 'slack_user1', 'user2': 'slack_user2' },
                drafts: {
                    'draft123': {
                        slack_channel_id: 'C123',
                        last_known_pick_count: 0 // First run, all picks are "new"
                    }
                }
            };
            const mockDraft = {
                type: 'linear',
                settings: { rounds: 2, teams: 2 },
                draft_order: { 'user1': 1, 'user2': 2 },
                status: 'in_progress'
            };
            const mockPicks = [
                { pick_no: 1, round: 1, metadata: { first_name: 'Player', last_name: 'One', position: 'RB' }, picked_by: 'user1' },
                { pick_no: 2, round: 1, metadata: { first_name: 'Player', last_name: 'Two', position: 'WR' }, picked_by: 'user2' },
                { pick_no: 3, round: 2, metadata: { first_name: 'Player', last_name: 'Three', position: 'QB' }, picked_by: 'user2' }
            ];

            datastore.getData.mockResolvedValue(mockData);
            sleeper.getDraft.mockResolvedValue(mockDraft);
            sleeper.getDraftPicks.mockResolvedValue(mockPicks);
            
            // Mock validation to pass with all picks being "new"
            pickUtils.validatePickData.mockReturnValue({ isValid: true, error: null });
            pickUtils.getNewPicksSinceLastUpdate.mockReturnValue({
                hasNewPicks: true,
                count: 3,
                startIndex: 0,
                newPicks: mockPicks // All picks are new
            });

            // Act
            await handleLastPickCommand({ command, say });

            // Assert
            expect(say).toHaveBeenCalledTimes(1);
            const messagePayload = say.mock.calls[0][0];
            
            // Should use multi-pick format for all picks
            expect(messagePayload.text).toContain('3 new picks since last update');
            expect(messagePayload.text).toContain('Player One (RB)');
            expect(messagePayload.text).toContain('Player Two (WR)');
            expect(messagePayload.text).toContain('Player Three (QB)');
        });
    });
});