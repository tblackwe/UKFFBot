# Roster Scheduler

Automated roster checking for every NFL game day.

## When it runs

EventBridge invokes `ukff-roster-scheduler-{env}` **every 30 minutes**. Most polls
no-op. A Slack roster check is posted only when:

1. ESPN shows at least one regular-season (or postseason) game on **today’s America/New_York date**
2. Wall-clock time is at or after **3 hours before that day’s first kickoff**, and still before kickoff
3. DynamoDB has no `SCHEDULER` / `ROSTER_CHECK#YYYY-MM-DD` lock for that Eastern date

So Thursday night, Friday internationals, Saturday, Sunday, and Monday night all
work without hardcoded weekdays. If the NFL flexes a game to another day, the next
poll reads ESPN and uses the new `start_time`.

A poll is at most 30 minutes late (about 2.5 hours before kickoff). After a
successful post, that Eastern date will not run again. If the Lambda throws before
it finishes, the lock is released so a later poll can retry until kickoff.

## Components

### 1. Lambda: `lambda-roster-scheduler.js`
- Gate: `services/rosterScheduler.js` (ESPN kickoffs + ET calendar + lock)
- Analysis: existing `analyzeLeagueRosters` / `formatAnalysisMessage`
- Posts results directly to Slack channels (not in threads)

### 2. Datastore
- `getAllChannelsWithLeagues()` — channels that have registered leagues
- `tryClaimRosterCheck(etDate)` / `releaseRosterCheck(etDate)` — once-per-day lock

### 3. CloudFormation: `template.yaml`
- `RosterSchedulerFunction` with `rate(30 minutes)`
- Log group and error alarm

## Deployment

```bash
./deploy.sh
```

Confirm the old Thu/Sun/Mon cron rules are gone and `RosterCheckPoll` is enabled.

## Testing

```bash
npm test
```

Gate tests live in `__tests__/services/rosterScheduler.gate.test.js`.

To invoke the Lambda locally (will hit ESPN + DynamoDB):

```bash
sam local invoke RosterSchedulerFunction -e event.json
```

## Monitoring

CloudWatch dashboard includes invocations, errors, and duration.

Log group: `/aws/lambda/ukff-roster-scheduler-{Environment}`

Skip reasons in logs: `off_season`, `no_games`, `too_early`, `too_late`, `already_ran`, `nfl_state_error`, `schedule_error`.

## Disabling / changing cadence

Set `Enabled: false` on `RosterCheckPoll` in `template.yaml`, or change `rate(30 minutes)`, then redeploy.
