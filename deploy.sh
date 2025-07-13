#!/bin/bash

# UKFF Slack Bot Deployment Script
set -e

if [ -f .env ]; then
    echo "📄 Loading environment variables from .env file"
    export $(grep -v '^#' .env | xargs)
fi

# Configuration
ENVIRONMENT=${1:-prod}
STACK_NAME="ukff-slack-bot-${ENVIRONMENT}"
S3_BUCKET="ukff-slack-bot-deployments-$(aws sts get-caller-identity --query Account --output text)"
REGION=${AWS_REGION:-us-east-1}

echo "🚀 Deploying UKFF Slack Bot to AWS Lambda..."
echo "Environment: $ENVIRONMENT"
echo "Stack Name: $STACK_NAME"
echo "Region: $REGION"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check if SAM CLI is installed
if ! command -v sam &> /dev/null; then
    echo "❌ SAM CLI is not installed. Please install it first."
    echo "Install with: pip install aws-sam-cli"
    exit 1
fi

# Check for required environment variables
if [ -z "$SLACK_BOT_TOKEN" ]; then
    echo "❌ SLACK_BOT_TOKEN environment variable is required"
    exit 1
fi

if [ -z "$SLACK_SIGNING_SECRET" ]; then
    echo "❌ SLACK_SIGNING_SECRET environment variable is required"
    exit 1
fi

# Create S3 bucket for deployments if it doesn't exist
echo "📦 Checking S3 bucket for deployments..."
if ! aws s3 ls "s3://$S3_BUCKET" 2>/dev/null; then
    echo "Creating S3 bucket: $S3_BUCKET"
    aws s3 mb "s3://$S3_BUCKET" --region $REGION
    aws s3api put-bucket-versioning --bucket $S3_BUCKET --versioning-configuration Status=Enabled
fi

# Install dependencies
echo "📋 Installing dependencies..."
npm ci --production

# Build and deploy with SAM
echo "🏗️  Building SAM application..."
sam build --use-container

echo "🚀 Deploying to AWS..."
sam deploy \
    --stack-name $STACK_NAME \
    --s3-bucket $S3_BUCKET \
    --capabilities CAPABILITY_IAM \
    --region $REGION \
    --parameter-overrides \
        SlackBotToken=$SLACK_BOT_TOKEN \
        SlackSigningSecret=$SLACK_SIGNING_SECRET \
        Environment=$ENVIRONMENT \
    --no-fail-on-empty-changeset \
    --no-confirm-changeset

# Get the API Gateway URL
API_URL=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`SlackBotApiUrl`].OutputValue' \
    --output text)

echo ""
echo "✅ Deployment completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Update your Slack app configuration:"
echo "   - Event Subscriptions Request URL: $API_URL"
echo "   - Interactivity Request URL: $API_URL"
echo ""
echo "2. Test your bot by mentioning it in a Slack channel"
echo ""
echo "🔍 Monitor your functions:"
echo "   - CloudWatch Logs: https://console.aws.amazon.com/cloudwatch/home?region=$REGION#logsV2:log-groups"
echo "   - Lambda Functions: https://console.aws.amazon.com/lambda/home?region=$REGION#/functions"
echo ""
