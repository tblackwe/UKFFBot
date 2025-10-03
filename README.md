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

#### Option 1: GitHub Actions (Recommended)

This project includes comprehensive GitHub Actions workflows for automated deployment:

1. **Setup GitHub Secrets** in your repository settings:
   ```
   AWS_ACCESS_KEY_ID=<your-aws-access-key>
   AWS_SECRET_ACCESS_KEY=<your-aws-secret-key>
   SLACK_BOT_TOKEN=xoxb-your-bot-token
   SLACK_SIGNING_SECRET=your-signing-secret
   ```

2. **Deploy to Production**:
   - Push to `main` branch for automatic production deployment
   - Or use manual dispatch in GitHub Actions for any environment

3. **Deploy to Staging**:
   - Push to `develop` branch for automatic staging deployment

4. **Features**:
   - Automated testing before deployment
   - Multi-environment support (dev/staging/prod)
   - Smoke tests after deployment
   - Rollback capabilities
   - Database backup/restore operations

See [`.github/workflows/README.md`](./.github/workflows/README.md) for detailed workflow documentation.

#### Option 2: Manual Deployment

For manual deployment using the included script:
```bash
./deploy.sh [environment]
```

See [`LAMBDA_DEPLOYMENT.md`](./LAMBDA_DEPLOYMENT.md) for complete manual deployment instructions.

## 🧪 Testing

Run the test suite:
```bash
npm test
```

## � Utilities

### Update NFL Bye Weeks

Fetch and update NFL bye weeks for any season using the ESPN API:

```bash
node update-bye-weeks.js [season]
```

**Examples:**
```bash
node update-bye-weeks.js 2025    # Fetch 2025 season bye weeks
node update-bye-weeks.js 2026    # Fetch 2026 season bye weeks
node update-bye-weeks.js         # Defaults to 2025
```

**Features:**
- Fetches official bye week data from ESPN API
- Automatically maps team abbreviations to Sleeper format (WSH → WAS)
- Validates all 32 NFL teams are included
- Outputs JavaScript object ready to copy into `services/nflDataCache.js`
- Provides step-by-step update instructions

**Output:** The script generates the correct `NFL_BYE_WEEKS_XXXX` object that you can copy directly into the code and clear the cache to use the updated data.

## �📖 Usage

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
