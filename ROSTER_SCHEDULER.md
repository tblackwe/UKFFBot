# Roster Scheduler Deployment

This document describes the automated roster checking feature that runs on scheduled intervals.

## Overview

The roster scheduler automatically runs the "check rosters" command for all registered leagues on:
- **Thursdays at 12:00 PM UTC**
- **Sundays at 6:00 AM UTC** 
- **Mondays at 12:00 PM UTC**

## Components Added

### 1. Lambda Function: `lambda-roster-scheduler.js`
- New Lambda function that handles scheduled roster checking
- Uses the existing roster analysis logic from `handlers/checkRosters.js`
- Posts results to all Slack channels that have registered leagues

### 2. Database Function: `getAllChannelsWithLeagues()`
- Added to `services/datastore.js`
- Retrieves all channels that have registered leagues
- Groups leagues by channel for efficient processing

### 3. CloudFormation Updates: `template.yaml`
- Added `RosterSchedulerFunction` Lambda function
- Configured three CloudWatch Events rules for scheduling
- Added corresponding log group and monitoring

## Deployment Steps

1. **Deploy the updated stack:**
   ```bash
   ./deploy.sh
   ```

2. **Verify deployment:**
   - Check AWS Console for the new Lambda function
   - Verify CloudWatch Events rules are created and enabled
   - Monitor CloudWatch Logs for any errors

## Schedule Details

The cron expressions used:
- Thursday noon: `cron(0 12 ? * THU *)`
- Sunday 6 AM: `cron(0 6 ? * SUN *)`
- Monday noon: `cron(0 12 ? * MON *)`

All times are in UTC. Adjust if you need different timezones.

## Testing

To test the scheduler locally:
```bash
node test-roster-scheduler.js
```

## Monitoring

The function is included in the CloudWatch dashboard with metrics for:
- Invocations
- Errors
- Duration

Log groups:
- `/aws/lambda/ukff-roster-scheduler-{Environment}`

## Troubleshooting

Common issues:
1. **No channels found**: Ensure leagues are properly registered
2. **Slack API errors**: Check bot token permissions
3. **Timeout issues**: Function has 5-minute timeout for processing multiple leagues

## Disabling/Enabling

To disable the scheduler:
1. Set `Enabled: false` in the CloudWatch Events in `template.yaml`
2. Redeploy

To change schedule:
1. Update the cron expressions in `template.yaml`
2. Redeploy
