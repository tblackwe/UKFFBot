# UKFFBOT - Sleeper Draft Assistant for Slack

This bot integrates with the Sleeper fantasy football platform to provide real-time draft updates directly within your Slack workspace. It helps keep league members informed about the latest pick and who is on the clock next.

## 🚀 Deployment Modes

**AWS Lambda (Production):** Serverless deployment with automatic scaling and monitoring  
**Local Development:** Socket Mode for easy testing and development

## ✨ Features

- **`last pick` or `latest` Command:** Fetches and displays the most recent pick for the currently registered Sleeper draft
- **`register draft [draft_id]` Command:** Associates a Sleeper draft ID with a specific Slack channel
- **`register player [sleeper_id] [slack_name]` Command:** Maps a Sleeper User ID to a Slack username for @-mentions
- **`unregister draft` Command:** Removes the draft registration from the current channel
- **`usage` or `help` Command:** Displays a list of all available commands and their descriptions
- **Automatic Pick Announcements:** Scheduled monitoring checks for new picks and posts updates automatically
- **On-the-Clock Notifications:** Announces who the next picker is with @-mentions for Slack users
- **Advanced Draft Logic:** Supports standard snake drafts and drafts with 3rd Round Reversal (3RR)

## 🏗️ Architecture

### Production (AWS Lambda)
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Slack Events  │───▶│ Lambda Handler   │───▶│    DynamoDB     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌──────────────────┐
                       │ Draft Monitor    │
                       │ (Scheduled)      │
                       └──────────────────┘
```

### Development (Socket Mode)
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Slack Events  │◀──▶│    app.js        │───▶│   data.json     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 📁 Project Structure

```
├── 📄 lambda-handler.js          # AWS Lambda main handler
├── 📄 lambda-draft-monitor.js    # Scheduled draft monitoring
├── 📄 app.js                     # Local development server
├── 📁 handlers/                  # Command business logic
│   ├── 📄 lastpick.js
│   ├── 📄 registerDraft.js
│   ├── 📄 registerPlayer.js
│   ├── 📄 unregisterDraft.js
│   ├── 📄 listDrafts.js
│   └── 📄 handleUsageCommand.js
├── 📁 services/                  # External API integrations
│   ├── 📄 sleeper.js             # Sleeper API client
│   ├── 📄 datastore.js           # Data persistence layer
│   └── 📄 draftMonitor.js        # Draft monitoring logic
├── 📁 shared/                    # Shared utilities
│   ├── 📄 commandPatterns.js     # Command routing logic
│   └── 📄 messages.js            # Standardized messaging
├── 📁 __tests__/                 # Test suites
├── 📄 template.yaml              # AWS SAM template
└── 📄 data.json                  # Local development data
```

---

## 🛠️ Setup and Installation

### Prerequisites

- **Node.js 22+** (Latest LTS)
- **AWS CLI** (for Lambda deployment)
- **AWS SAM CLI** (for local Lambda testing)

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd UKFFBot
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the root directory:

```env
# Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret

# For local development only (not needed for Lambda)
SLACK_APP_TOKEN=xapp-your-app-token

# Environment
NODE_ENV=development
```

### 4. Data Storage Configuration

#### For Local Development
The bot uses `data.json` for local development:

```json
{
    "player_map": {
        "sleeper_user_id_1": "slack_username_1",
        "sleeper_user_id_2": "slack_username_2"
    },
    "drafts": {
        "draft_id_123": {
            "slack_channel_id": "C123456789",
            "last_known_pick_count": 0
        }
    }
}
```

#### For Production (AWS)
Data is stored in DynamoDB. See [`LAMBDA_DEPLOYMENT.md`](./LAMBDA_DEPLOYMENT.md) for setup instructions.

## 🚀 Running the Bot

### Local Development

For quick development with Socket Mode:
```bash
npm run start:local
```

For testing Lambda handlers locally:
```bash
npm run start:sam
```

### Production Deployment

See [`LAMBDA_DEPLOYMENT.md`](./LAMBDA_DEPLOYMENT.md) for complete AWS deployment instructions.

## 🧪 Testing

Run the test suite:
```bash
npm test
```

## 📖 Usage

Once deployed, interact with the bot in Slack:

```
@UKFFBot last pick                    # Show latest draft pick
@UKFFBot register draft 123456789     # Register a Sleeper draft
@UKFFBot register player 456 john_doe # Map Sleeper ID to Slack user
@UKFFBot unregister draft             # Remove draft registration
@UKFFBot help                         # Show all commands
```

## 🔧 Development

### Code Quality
- **ESNext/ES2024** features with Node.js 22 LTS
- **Jest** for testing with full coverage
- **Shared modules** for DRY code organization
- **Standardized error handling** across all handlers

### Architecture Decisions
- **Serverless-first** design optimized for AWS Lambda
- **Dual deployment** support (local + Lambda) for development
- **Shared command patterns** eliminate code duplication
- **Modular handlers** for easy maintenance and testing

## 📚 Documentation

- [`LAMBDA_DEPLOYMENT.md`](./LAMBDA_DEPLOYMENT.md) - AWS deployment guide
- [`/handlers/`](./handlers/) - Individual command documentation
- [`/services/`](./services/) - Service layer documentation

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details.