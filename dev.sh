#!/bin/bash

# Local development script for UKFF Slack Bot
set -e

echo "🔧 Starting UKFF Slack Bot in local development mode..."

# Check if required environment variables are set
if [ -z "$SLACK_BOT_TOKEN" ]; then
    echo "❌ SLACK_BOT_TOKEN environment variable is required"
    echo "Set it with: export SLACK_BOT_TOKEN=xoxb-your-token"
    exit 1
fi

if [ -z "$SLACK_SIGNING_SECRET" ]; then
    echo "❌ SLACK_SIGNING_SECRET environment variable is required"
    echo "Set it with: export SLACK_SIGNING_SECRET=your-signing-secret"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Start SAM local API
echo "🚀 Starting SAM local API..."
echo "The API will be available at: http://localhost:3000"
echo ""
echo "To test with ngrok:"
echo "1. Install ngrok: npm install -g ngrok"
echo "2. Run: ngrok http 3000"
echo "3. Use the ngrok URL in your Slack app configuration"
echo ""

# Set environment variables for local development
export NODE_ENV=development
export DYNAMODB_TABLE_NAME=UKFFBot-dev

sam local start-api --port 3000 --env-vars local-env.json
