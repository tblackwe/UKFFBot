# GitHub Actions Workflows

This directory contains the GitHub Actions workflows for the UKFF Slack Bot project. These workflows provide automated CI/CD, testing, and operational capabilities.

## Workflows Overview

### 1. Deploy (`deploy.yml`)
**Purpose**: Automated deployment to AWS Lambda using SAM CLI

**Triggers**:
- Push to `main` branch → Deploy to `prod`
- Push to `develop` branch → Deploy to `staging`
- Manual dispatch with environment selection
- Pull requests → Test only (no deployment)

**Features**:
- Multi-environment support (dev, staging, prod)
- Automated testing before deployment
- SAM template validation
- Smoke tests after deployment
- Rollback capability on failure
- Deployment status reporting

### 2. Test and Validate (`test.yml`)
**Purpose**: Comprehensive testing and validation for all code changes

**Triggers**:
- Pull requests to `main` or `develop`
- Pushes to `main` or `develop`

**Features**:
- Multi-Node.js version testing (18, 20)
- ESLint code quality checks
- SAM template validation
- Security scanning with npm audit and Snyk
- Dependency vulnerability checks
- Integration tests with local SAM API

### 3. Operations and Maintenance (`operations.yml`)
**Purpose**: Manual operational tasks and maintenance

**Triggers**:
- Manual dispatch only

**Available Operations**:
- **backup-database**: Create DynamoDB backup to S3
- **restore-database**: Restore DynamoDB from S3 backup
- **cleanup-logs**: Remove old CloudWatch log streams
- **update-dependencies**: Check and update npm dependencies
- **run-diagnostics**: Health check of all AWS resources
- **rollback-deployment**: Rollback to a previous version

## Setup Requirements

### Required Secrets

Configure these secrets in your GitHub repository:

#### AWS Credentials
```
AWS_ACCESS_KEY_ID=<your-aws-access-key>
AWS_SECRET_ACCESS_KEY=<your-aws-secret-key>
```

#### Slack Configuration
```
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
```

#### Optional Secrets
```
SNYK_TOKEN=<your-snyk-token>  # For security scanning
```

### Environment Protection Rules

It's recommended to set up environment protection rules in GitHub:

1. **Production Environment**:
   - Require review from team leads
   - Restrict to `main` branch only
   - Add delay timer for safety

2. **Staging Environment**:
   - Require review for manual deployments
   - Allow `develop` branch

3. **Development Environment**:
   - No restrictions for testing

## Usage Examples

### Deploying to Production
```bash
# Automatic: Push to main branch
git push origin main

# Manual: Use GitHub UI
# 1. Go to Actions tab
# 2. Select "Deploy UKFF Slack Bot"
# 3. Click "Run workflow"
# 4. Select "prod" environment
```

### Running Tests
```bash
# Automatic: Create pull request
git checkout -b feature/my-feature
git push origin feature/my-feature
# Create PR - tests run automatically

# Manual: Use GitHub UI to run test workflow
```

### Database Backup
```bash
# Use GitHub UI:
# 1. Go to Actions tab
# 2. Select "Operations and Maintenance"
# 3. Click "Run workflow"
# 4. Select "backup-database" operation
# 5. Choose environment
```

### Rolling Back Deployment
```bash
# Use GitHub UI:
# 1. Go to Actions tab
# 2. Select "Operations and Maintenance"
# 3. Click "Run workflow"
# 4. Select "rollback-deployment" operation
# 5. Enter git commit hash or tag to rollback to
```

## Workflow Outputs

### Deployment Workflow
- API Gateway URL for Slack configuration
- DynamoDB table name
- Lambda function ARNs
- Deployment status and health checks

### Test Workflow
- Test coverage reports
- Lint results
- Security scan reports
- SAM validation results

### Operations Workflow
- Backup file locations
- Diagnostic reports
- Operation status and logs

## Monitoring and Alerts

The workflows include:
- Slack notifications on deployment success/failure (configurable)
- CloudWatch integration for monitoring
- Artifact uploads for debugging
- Comprehensive logging for troubleshooting

## Best Practices

1. **Always test in dev/staging** before production
2. **Review deployment logs** for any warnings
3. **Run diagnostics** if issues are detected
4. **Keep backups** before major changes
5. **Use rollback** if critical issues arise
6. **Monitor CloudWatch** for application health

## Troubleshooting

### Common Issues

1. **AWS Permissions**: Ensure IAM user has necessary permissions
2. **Secrets Missing**: Verify all required secrets are configured
3. **SAM Build Failures**: Check template.yaml syntax
4. **Test Failures**: Review test logs and fix code issues

### Getting Help

- Check workflow run logs in GitHub Actions tab
- Review CloudWatch logs for runtime issues
- Use diagnostic operation for health checks
- Check AWS CloudFormation for stack status

## Security Considerations

- Secrets are encrypted and not exposed in logs
- Production deployments require manual approval
- Backup data is encrypted in S3
- IAM permissions follow least privilege principle
- Dependencies are scanned for vulnerabilities

## Contributing

When modifying workflows:
1. Test changes in a fork first
2. Use semantic commit messages
3. Update this documentation
4. Consider impact on all environments
5. Get review from team leads for production changes
