const fsPromises = require('fs').promises;
const { getData, saveData } = require('../../services/datastore.js');

// Mock the 'fs' module to control its 'promises' property.
jest.mock('fs', () => ({
    // We need to keep other fs properties, so we require the actual module
    ...jest.requireActual('fs'),
    // and overwrite promises with our mock
    promises: {
        readFile: jest.fn(),
        writeFile: jest.fn(),
    },
}));

describe('Datastore Service', () => {

    // Clear all mocks before each test to ensure a clean state
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getData', () => {
        it('should read and parse data from the file', async () => {
            const mockData = { player_map: {}, drafts: {} };
            const mockJson = JSON.stringify(mockData);

            // Configure the mock to return our sample JSON
            fsPromises.readFile.mockResolvedValue(mockJson);

            const data = await getData();

            // Expect that readFile was called correctly
            expect(fsPromises.readFile).toHaveBeenCalledWith(expect.any(String), 'utf8');
            // Expect the returned data to match our mock data
            expect(data).toEqual(mockData);
        });
    });

    describe('saveData', () => {
        it('should stringify and write data to the file', async () => {
            const mockData = { player_map: { '123': 'testuser' }, drafts: {} };
            const expectedJson = JSON.stringify(mockData, null, 4);

            // The mock for writeFile doesn't need to return anything
            fsPromises.writeFile.mockResolvedValue();

            await saveData(mockData);

            // Expect that writeFile was called with the correct path and formatted JSON
            expect(fsPromises.writeFile).toHaveBeenCalledWith(expect.any(String), expectedJson);
        });
    });

});