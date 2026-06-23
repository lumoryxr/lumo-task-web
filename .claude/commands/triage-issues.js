#!/usr/bin/env node

/**
 * Claude Code Custom Command: /triage-issues
 *
 * Batch process issues awaiting triage:
 * - List all issues with 'needs-triage' label
 * - Display their details
 * - Suggest labels and priority
 * - Update issues with classifications
 *
 * Usage: /triage-issues
 *
 * Note: Requires GitHub API access (gh CLI tool)
 */

const { execSync } = require('child_process');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  bold: '\x1b[1m',
};

/**
 * Get issues with 'needs-triage' label using gh CLI
 */
function getIssuesNeedingTriage() {
  try {
    const output = execSync(
      'gh issue list --label needs-triage --state open --json number,title,body,author,createdAt',
      {
        encoding: 'utf-8',
      }
    );

    return JSON.parse(output);
  } catch (err) {
    console.error(`${colors.red}Error fetching issues:${colors.reset}`, err.message);
    console.log(`${colors.yellow}Make sure gh CLI is installed and authenticated:${colors.reset}`);
    console.log(`  https://cli.github.com/\n`);
    process.exit(1);
  }
}

/**
 * Display issue details
 */
function displayIssue(issue) {
  console.log(`${colors.bold}#${issue.number} ${issue.title}${colors.reset}`);
  console.log(`${colors.blue}Author:${colors.reset} @${issue.author.login}`);
  console.log(`${colors.blue}Created:${colors.reset} ${new Date(issue.createdAt).toLocaleDateString()}`);

  if (issue.body) {
    const preview = issue.body.substring(0, 200).replace(/\n/g, ' ');
    console.log(`${colors.blue}Description:${colors.reset} ${preview}...`);
  }

  console.log('');
}

/**
 * Suggest labels based on issue content
 */
function suggestLabels(issue) {
  const content = `${issue.title} ${issue.body || ''}`.toLowerCase();
  const suggestions = [];

  if (content.includes('bug') || content.includes('error') || content.includes('broken')) {
    suggestions.push('bug');
  } else if (
    content.includes('feature') ||
    content.includes('request') ||
    content.includes('new')
  ) {
    suggestions.push('feature');
  }

  if (content.includes('ui') || content.includes('frontend') || content.includes('component')) {
    suggestions.push('frontend');
  } else if (content.includes('api') || content.includes('backend') || content.includes('server')) {
    suggestions.push('backend');
  }

  if (content.includes('docs') || content.includes('documentation')) {
    suggestions.push('documentation');
  }

  if (content.includes('security') || content.includes('secure')) {
    suggestions.push('security');
  }

  return suggestions;
}

async function main() {
  console.log(
    `${colors.bold}${colors.blue}📋 Issue Triage Assistant${colors.reset}\n`
  );
  console.log(`${colors.yellow}Fetching issues awaiting triage...${colors.reset}\n`);

  const issues = getIssuesNeedingTriage();

  if (issues.length === 0) {
    console.log(`${colors.green}✓ All issues are triaged!${colors.reset}\n`);
    process.exit(0);
  }

  console.log(`${colors.bold}Found ${issues.length} issues awaiting triage:${colors.reset}\n`);
  console.log('-'.repeat(60));

  issues.forEach((issue) => {
    displayIssue(issue);

    const suggestions = suggestLabels(issue);
    if (suggestions.length > 0) {
      console.log(
        `${colors.blue}Suggested labels:${colors.reset} ${suggestions.map((l) => colors.yellow + l + colors.reset).join(', ')}`
      );
    }

    console.log(`${colors.blue}Priority:${colors.reset} Review and assign P0-P4 label`);
    console.log('-'.repeat(60));
  });

  console.log(`\n${colors.bold}Manual Actions:${colors.reset}`);
  console.log(`1. Review each issue on GitHub`);
  console.log(`2. Add appropriate labels (type, priority, component)`);
  console.log(`3. Remove 'needs-triage' label when done`);
  console.log(`\n${colors.yellow}URL:${colors.reset}`);
  console.log(
    `https://github.com/lumoryxr/lumo-task-web/issues?q=is%3Aissue+is%3Aopen+label%3Aneeds-triage\n`
  );
}

main().catch((err) => {
  console.error(`${colors.red}Error:${colors.reset}`, err.message);
  process.exit(1);
});
