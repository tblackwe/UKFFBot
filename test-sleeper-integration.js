#!/usr/bin/env node

/**
 * Test script to verify the new Sleeper username functionality
 */

const { getUserByUsername } = require('./services/sleeper.js');
const { handleRegisterPlayerCommand } = require('./handlers/registerPlayer.js');

async function testSleeperApi() {
    console.log('Testing Sleeper API getUserByUsername...');
    
    try {
        // Test with a known Sleeper username (you may need to use a real one for testing)
        const testUsername = 'testuser123'; // This will likely return null, but tests the API call
        const user = await getUserByUsername(testUsername);
        
        if (user) {
            console.log('✅ Found user:', {
                username: user.username,
                user_id: user.user_id,
                display_name: user.display_name
            });
        } else {
            console.log('❌ User not found (expected for test username)');
        }
        
        console.log('✅ API call completed successfully');
    } catch (error) {
        console.error('❌ API call failed:', error.message);
    }
}

async function testRegisterPlayerCommand() {
    console.log('\nTesting register player command...');
    
    const mockSay = (message) => {
        console.log('Bot would say:', typeof message === 'string' ? message : JSON.stringify(message, null, 2));
    };
    
    const command = {
        text: 'nonexistent_user test_slack_user'
    };
    
    try {
        await handleRegisterPlayerCommand({ command, say: mockSay });
        console.log('✅ Command executed successfully');
    } catch (error) {
        console.error('❌ Command failed:', error.message);
    }
}

async function main() {
    console.log('🧪 Testing updated register player functionality\n');
    
    await testSleeperApi();
    await testRegisterPlayerCommand();
    
    console.log('\n🎉 Tests completed!');
}

main().catch(console.error);
