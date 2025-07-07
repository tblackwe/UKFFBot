# UKFFBOT - Sleeper Draft Assistant for Slack

This bot integrates with the Sleeper fantasy football platform to provide real-time draft updates directly within your Slack workspace. It helps keep league members informed about the latest pick and who is on the clock next.

## Features

- **`lastpick` Command:** Fetches and displays the most recent pick for the currently registered Sleeper draft. Usage: `@YourBotName lastpick`.
- **`registerdraft` Command:** Associates a Sleeper draft ID with a specific Slack channel. Usage: `@YourBotName registerdraft <draft_id>`.
- **`registerplayer` Command:** Maps a Sleeper User ID to a Slack username for @-mentions. Usage: `@YourBotName registerplayer <sleeper_user_id> <slack_username>`.
- **`usage` or `help` Command:** Displays a list of all available commands and their descriptions. Usage: `@YourBotName usage`.
- **Automatic Pick Announcements:** A background job runs continuously to check for new picks in all registered drafts and automatically posts an update to the appropriate channel.
- **On-the-Clock Notifications:** Automatically announces who the next picker is, including an @-mention for their Slack user.
- **Advanced Draft Logic:** Correctly handles standard snake drafts and drafts with a 3rd Round Reversal (3RR).

## Project Structure

- `app.js`: The main entry point for the Slack bot. Initializes the app and registers command listeners.
- `/handlers`: Contains the business logic for individual slash commands.
- `/services`: Modules for interacting with external APIs, like the Sleeper API.
- `data.json`: A simple JSON file for storing user mappings and registered draft information.

---

## Setup and Installation

Follow these steps to get the bot running for your own Slack workspace and fantasy league.

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd ukffbot
```

### 2. Install Dependencies

This project uses Node.js. Make sure you have it installed, then run:

```bash
npm install
```

### 3. Configure Environment Variables

Create a file named `.env` in the root of the project. This file will hold your secret tokens. You can get these values from your Slack App's configuration page under "OAuth & Permissions" (Bot Token) and "Basic Information" (App-Level Token).

```
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
```

### 4. Configure User Mappings

Edit the `data.json` file. This file has two main sections:

- `player_map`: Map the Sleeper User IDs of your league members to their corresponding Slack display names. This is crucial for the `@mention` functionality to work correctly.
- `drafts`: This section is managed by the `/registerdraft` command and stores the active draft ID and the channel it's linked to.
- `drafts`: This section is managed by the bot. It stores the active draft ID, the channel it's linked to, and the last known pick count for monitoring.

```json
{
    "player_map": {
        "SLEEPER_USER_ID_1": "slack_username_1",
        "SLEEPER_USER_ID_2": "slack_username_2"
    },
    "drafts": {
        "draftid": "DRAFT_ID_HERE",
        "slack_channel_id": "SLACK_CHANNEL_ID_HERE",
        "last_known_pick_count": 0
    }
}
```

## Running the Bot

Once everything is configured, you can start the bot with the following command:

```bash
node app.js
```

The bot will connect to Slack and be ready to respond to commands.