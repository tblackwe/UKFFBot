const { handleListChannelPlayersCommand } = require('../../handlers/listChannelPlayers.js');

// Mock the datastore
jest.mock('../../services/datastore.js', () => ({
  getDatastore: jest.fn()
}));

const { getDatastore } = require('../../services/datastore.js');

describe('handleListChannelPlayersCommand', () => {
  let mockSay;
  let mockDatastore;

  beforeEach(() => {
    mockSay = jest.fn();
    mockDatastore = {
      getAllData: jest.fn()
    };
    getDatastore.mockReturnValue(mockDatastore);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should show message when no draft is registered for channel', async () => {
    const event = { channel: 'C1234567890' };
    mockDatastore.getAllData.mockResolvedValue({
      drafts: {},
      draftRegistrations: {}
    });
    
    await handleListChannelPlayersCommand({ event, say: mockSay });
    
    expect(mockSay).toHaveBeenCalledWith({
      text: "📋 No draft registered for this channel",
      blocks: expect.arrayContaining([
        expect.objectContaining({
          type: "section",
          text: expect.objectContaining({
            text: expect.stringContaining("This channel doesn't have a draft registered yet")
          })
        })
      ])
    });
  });

  test('should show message when no players are registered (new format)', async () => {
    const event = { channel: 'C1234567890' };
    mockDatastore.getAllData.mockResolvedValue({
      drafts: {},
      draftRegistrations: {
        'TestDraft': {
          channelId: 'C1234567890',
          draftId: '123456789',
          registeredPlayers: {}
        }
      }
    });
    
    await handleListChannelPlayersCommand({ event, say: mockSay });
    
    expect(mockSay).toHaveBeenCalledWith({
      text: "📋 No players registered for this draft yet",
      blocks: expect.arrayContaining([
        expect.objectContaining({
          type: "section",
          text: expect.objectContaining({
            text: expect.stringContaining("No players have registered")
          })
        })
      ])
    });
  });

  test('should show message when no players are registered (old format)', async () => {
    const event = { channel: 'C1234567890' };
    mockDatastore.getAllData.mockResolvedValue({
      drafts: {
        '123456789': {
          slack_channel_id: 'C1234567890',
          last_known_pick_count: 0
        }
      },
      draftRegistrations: {}
    });
    
    await handleListChannelPlayersCommand({ event, say: mockSay });
    
    expect(mockSay).toHaveBeenCalledWith({
      text: "📋 No players registered for this draft yet",
      blocks: expect.arrayContaining([
        expect.objectContaining({
          type: "section",
          text: expect.objectContaining({
            text: expect.stringContaining("No players have registered")
          })
        })
      ])
    });
  });

  test('should list registered players for channel draft (new format)', async () => {
    const event = { channel: 'C1234567890' };
    mockDatastore.getAllData.mockResolvedValue({
      drafts: {},
      draftRegistrations: {
        'TestDraft': {
          channelId: 'C1234567890',
          draftId: '123456789',
          registeredPlayers: {
            'U1234': 'John Doe',
            'U5678': 'Jane Smith'
          }
        }
      }
    });
    
    await handleListChannelPlayersCommand({ event, say: mockSay });
    
    expect(mockSay).toHaveBeenCalledWith({
      text: "📋 2 players registered for this draft",
      blocks: expect.arrayContaining([
        expect.objectContaining({
          type: "section",
          text: expect.objectContaining({
            text: expect.stringContaining("John Doe (<@U1234>)")
          })
        }),
        expect.objectContaining({
          type: "context",
          elements: expect.arrayContaining([
            expect.objectContaining({
              text: expect.stringContaining("Draft ID: `123456789`")
            })
          ])
        })
      ])
    });
  });

  test('should list registered players for channel draft (old format)', async () => {
    const event = { channel: 'C1234567890' };
    mockDatastore.getAllData.mockResolvedValue({
      drafts: {
        '123456789': {
          slack_channel_id: 'C1234567890',
          last_known_pick_count: 5
        }
      },
      draftRegistrations: {}
    });
    
    await handleListChannelPlayersCommand({ event, say: mockSay });
    
    expect(mockSay).toHaveBeenCalledWith({
      text: "📋 No players registered for this draft yet",
      blocks: expect.arrayContaining([
        expect.objectContaining({
          type: "section",
          text: expect.objectContaining({
            text: expect.stringContaining("123456789")
          })
        })
      ])
    });
  });

  test('should handle single player correctly', async () => {
    const event = { channel: 'C1234567890' };
    mockDatastore.getAllData.mockResolvedValue({
      drafts: {},
      draftRegistrations: {
        'TestDraft': {
          channelId: 'C1234567890',
          draftId: '123456789',
          registeredPlayers: {
            'U1234': 'John Doe'
          }
        }
      }
    });
    
    await handleListChannelPlayersCommand({ event, say: mockSay });
    
    expect(mockSay).toHaveBeenCalledWith({
      text: "📋 1 player registered for this draft",
      blocks: expect.arrayContaining([
        expect.objectContaining({
          type: "section",
          text: expect.objectContaining({
            text: expect.stringContaining("*Total:* 1 player")
          })
        })
      ])
    });
  });

  test('should handle datastore errors gracefully', async () => {
    const event = { channel: 'C1234567890' };
    mockDatastore.getAllData.mockRejectedValue(new Error('Database error'));
    
    await handleListChannelPlayersCommand({ event, say: mockSay });
    
    expect(mockSay).toHaveBeenCalledWith("An error occurred while processing your request.");
  });
});
