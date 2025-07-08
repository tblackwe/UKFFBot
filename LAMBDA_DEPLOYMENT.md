# UKFF Slack Bot - AWS Lambda Deployment

This is a modernized version of the UKFF Slack Bot, designed to run on AWS Lambda with serverless architecture.

## Architecture

- **Main Bot Function**: Handles Slack events and commands via API Gateway
- **Draft Monitor Function**: Runs on a schedule to check for new draft picks
- **DynamoDB**: Stores bot data and configuration
- **API Gateway**: Receives webhooks from Slack
- **CloudWatch**: Logging and monitoring

## Prerequisites

1. **AWS CLI** - Configure with your AWS credentials
2. **SAM CLI** - For building and deploying serverless applications
3. **Node.js 18+** - Runtime for the Lambda functions
4. **Slack App** - Created in your Slack workspace

## Installation

1. Install SAM CLI:
```bash
pip install aws-sam-cli
```

2. Install dependencies:
```bash
npm install
```

## Configuration

1. Set up your environment variables:
```bash
export SLACK_BOT_TOKEN=xoxb-your-bot-token
export SLACK_SIGNING_SECRET=your-signing-secret
export AWS_REGION=us-east-1
```

2. Update `local-env.json` with your actual values for local development.

## Local Development

1. Start the local development server:
```bash
./dev.sh
```

2. Use ngrok to expose your local endpoint:
```bash
ngrok http 3000
```

3. Update your Slack app configuration with the ngrok URL:
   - Event Subscriptions: `https://your-ngrok-url.ngrok.io/slack/events`
   - Interactivity: `https://your-ngrok-url.ngrok.io/slack/events`

## Deployment

1. Deploy to AWS:
```bash
./deploy.sh prod
```

2. Update your Slack app configuration with the API Gateway URL (provided in deployment output).

3. Test your bot by mentioning it in a Slack channel.

## Environment Variables

The following environment variables are required:

- `SLACK_BOT_TOKEN`: Your Slack bot user OAuth token
- `SLACK_SIGNING_SECRET`: Your Slack app signing secret
- `DYNAMODB_TABLE_NAME`: DynamoDB table name (auto-configured)
- `AWS_REGION`: AWS region for deployment

## Commands

Your bot supports the following commands when mentioned:

- `@bot register draft <draft_id>` - Register a draft for monitoring
- `@bot register player <player_name> <sleeper_user_id>` - Register a player
- `@bot last pick` - Show the last draft pick
- `@bot list drafts` - List all registered drafts
- `@bot unregister draft <draft_id>` - Unregister a draft
- `@bot usage` or `@bot help` - Show usage information

## Monitoring

- **CloudWatch Logs**: View function logs in the AWS Console
- **CloudWatch Dashboard**: Monitor function metrics
- **API Gateway Logs**: Track API requests and responses

## Troubleshooting

1. **Bot not responding**: Check CloudWatch logs for errors
2. **Events not received**: Verify API Gateway URL in Slack app configuration
3. **Permission errors**: Ensure Lambda has proper IAM roles
4. **Draft monitoring not working**: Check EventBridge schedule and Lambda logs

## Cost Optimization

The serverless architecture provides several cost benefits:

- **Pay per request**: Only charged when functions execute
- **Auto-scaling**: Handles traffic spikes automatically
- **No idle costs**: No charges when bot is not being used
- **DynamoDB on-demand**: Pay only for actual data operations

## Security

- Environment variables are encrypted at rest
- DynamoDB encryption enabled
- API Gateway with proper CORS configuration
- CloudWatch logs retention set to 14 days
