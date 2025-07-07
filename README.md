# UKFFBOT - Sleeper Draft Assistant for Slack

This bot integrates with the Sleeper fantasy football platform to provide real-time draft updates directly within your Slack workspace. It helps keep league members informed about the latest pick and who is on the clock next.

## Features

- **/lastpick Command:** Fetches and displays the most recent pick for a given Sleeper draft.
- **On-the-Clock Notifications:** Automatically announces who the next picker is, including an @-mention for their Slack user.
- **Advanced Draft Logic:** Correctly handles standard snake drafts and drafts with a 3rd Round Reversal (3RR).

## Project Structure

- `app.js`: The main entry point for the Slack bot. Initializes the app and registers command listeners.
- `/handlers`: Contains the business logic for individual slash commands.
- `/services`: Modules for interacting with external APIs, like the Sleeper API.
- `data.json`: A simple mapping of Sleeper user IDs to Slack usernames.

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

Edit the `data.json` file to map the Sleeper User IDs of your league members to their corresponding Slack display names. This is crucial for the `@mention` functionality to work correctly.

```json
{
    "SLEEPER_USER_ID_1": "slack_username_1",
    "SLEEPER_USER_ID_2": "slack_username_2"
}
```

## Running the Bot

Once everything is configured, you can start the bot with the following command:

```bash
node app.js
```

The bot will connect to Slack and be ready to respond to commands.