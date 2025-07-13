console.log('Node.js version:', process.version);
console.log('fetch available:', typeof fetch !== 'undefined');

// Test a simple fetch call
async function testFetch() {
    try {
        const response = await fetch('https://api.sleeper.app/v1/user/nonexistent_user_12345');
        console.log('Response status:', response.status);
        const data = await response.json();
        console.log('Response data:', data);
    } catch (error) {
        console.error('Fetch error:', error.message);
    }
}

testFetch();
