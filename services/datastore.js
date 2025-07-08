const fs = require('fs').promises;
const path = require('path');

const dataFilePath = path.join(__dirname, '..', 'data.json');

/**
 * Reads and parses the data from data.json.
 * @returns {Promise<object>} The parsed data object.
 * @throws {Error} if the file cannot be read or parsed.
 */
async function getData() {
    try {
        const rawData = await fs.readFile(dataFilePath, 'utf8');
        return JSON.parse(rawData);
    } catch (error) {
        console.error("Error reading or parsing data.json:", error);
        // Re-throw the error to be handled by the caller
        throw error;
    }
}

/**
 * Writes the given data object to data.json.
 * @param {object} data The data object to save.
 * @returns {Promise<void>}
 * @throws {Error} if the file cannot be written.
 */
async function saveData(data) {
    try {
        await fs.writeFile(dataFilePath, JSON.stringify(data, null, 4));
    } catch (error) {
        console.error("Error writing to data.json:", error);
        // Re-throw the error to be handled by the caller
        throw error;
    }
}

module.exports = {
    getData,
    saveData,
};