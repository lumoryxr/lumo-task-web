#!/usr/bin/env node

/**
 * Claude Code Custom Command: /commit-push-pr
 *
 * Automated workflow: commit → push → create PR
 *
 * Flow:
 * 1. Ask for commit message (enforce Conventional Commits)
 * 2. Run checks (typecheck, lint, test)
 * 3. Commit with message
 * 4. Push to origin
 * 5. Create PR (guided)
 *
 * Usage: /commit-push-pr
 */

const { spawn, execSync } = require('child_process');
const readline = require('readline');
const path = require('path');

const projectRoot = process.cwd();

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  bold: '\x1b[1m',
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

function runCommand(cwd, command, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: true,
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

function runSilent(command) {
  try {
    return execSync(command, { encoding: 'utf-8', cwd: projectRoot }).trim();
  } catch {
    return null;
  }
}

/**
 * Validate commit message format (Conventional Commits)
 */
function validateCommitMessage(msg) {
  const pattern = /^(feat|fix|docs|style|refactor|test|ci|chore)(\(.+\))?:\s.+/;
  return pattern.test(msg);
}

/**
 * Get current branch name
 */
function getCurrentBranch() {
  return runSilent('git rev-parse --abbrev-ref HEAD');
}

/**
 * Check if there are changes to commit
 */
function hasChanges() {
  const status = runSilent('git status --short');
  return status && status.length > 0;
}

async function main() {
  console.log(`${colors.bold}${colors.blue}🚀 Automated Commit → Push → PR Workflow${colors.reset}\n`);

  try {
    // Step 1: Verify we're on a feature branch
    const branch = getCurrentBranch();
    if (branch === 'main') {
      console.log(
        `${colors.red}❌ Cannot commit directly to main. Create a feature branch first.${colors.reset}\n`
      );
      console.log(`${colors.yellow}Suggested:${colors.reset}`);
      console.log(`  git checkout -b feature/<your-feature>`);
      process.exit(1);
    }

    console.log(`${colors.blue}✓${colors.reset} On branch: ${colors.bold}${branch}${colors.reset}\n`);

    // Step 2: Check for changes
    if (!hasChanges()) {
      console.log(`${colors.yellow}⚠ No changes to commit.${colors.reset}\n`);
      process.exit(0);
    }

    console.log(`${colors.green}✓${colors.reset} Changes detected\n`);

    // Step 3: Get commit message
    console.log(`${colors.bold}Commit Message (Conventional Commits format):${colors.reset}`);
    console.log(`${colors.yellow}Format: <type>(<scope>): <subject>${colors.reset}`);
    console.log(`${colors.yellow}Types: feat, fix, docs, style, refactor, test, ci, chore${colors.reset}\n`);

    let commitMsg;
    let validMsg = false;

    while (!validMsg) {
      commitMsg = await question(`${colors.blue}→${colors.reset} Commit message: `);
      if (!validateCommitMessage(commitMsg)) {
        console.log(`${colors.red}✗ Invalid format. Please use: type(scope): message${colors.reset}`);
      } else {
        validMsg = true;
      }
    }

    // Step 4: Run checks
    console.log(`\n${colors.bold}${colors.blue}🧪 Running checks before commit...${colors.reset}\n`);

    try {
      await runCommand(path.join(projectRoot, 'web-app'), 'npm', ['run', 'typecheck']);
      console.log(`${colors.green}✓${colors.reset} Frontend typecheck passed\n`);
    } catch (err) {
      console.log(`${colors.red}✗${colors.reset} Frontend typecheck failed\n`);
      throw err;
    }

    try {
      await runCommand(path.join(projectRoot, 'backend'), 'npm', ['run', 'typecheck']);
      console.log(`${colors.green}✓${colors.reset} Backend typecheck passed\n`);
    } catch (err) {
      console.log(`${colors.red}✗${colors.reset} Backend typecheck failed\n`);
      throw err;
    }

    try {
      await runCommand(path.join(projectRoot, 'web-app'), 'npm', ['test', '--', '--run']);
      console.log(`${colors.green}✓${colors.reset} Frontend tests passed\n`);
    } catch (err) {
      console.log(`${colors.yellow}⚠${colors.reset} Frontend tests failed (review before proceeding)\n`);
      const proceed = await question(`${colors.yellow}Continue anyway?${colors.reset} (y/n): `);
      if (proceed.toLowerCase() !== 'y') {
        process.exit(1);
      }
    }

    // Step 5: Commit
    console.log(`${colors.bold}${colors.blue}💾 Committing changes...${colors.reset}\n`);

    try {
      await runCommand(projectRoot, 'git', ['add', '.']);
      await runCommand(projectRoot, 'git', ['commit', '-m', commitMsg]);
      console.log(`${colors.green}✓${colors.reset} Committed: ${colors.bold}${commitMsg}${colors.reset}\n`);
    } catch (err) {
      console.log(`${colors.red}✗${colors.reset} Commit failed\n`);
      throw err;
    }

    // Step 6: Push
    console.log(`${colors.bold}${colors.blue}📤 Pushing to origin...${colors.reset}\n`);

    try {
      await runCommand(projectRoot, 'git', ['push', '-u', 'origin', branch]);
      console.log(`${colors.green}✓${colors.reset} Pushed to origin/${colors.bold}${branch}${colors.reset}\n`);
    } catch (err) {
      console.log(`${colors.red}✗${colors.reset} Push failed\n`);
      throw err;
    }

    // Step 7: Create PR (manual guidance)
    console.log(`${colors.bold}${colors.blue}🔗 Creating Pull Request...${colors.reset}\n`);
    console.log(`${colors.yellow}Next steps:${colors.reset}`);
    console.log(
      `1. Open: ${colors.bold}https://github.com/lumoryxr/lumo-task-web/compare/${branch}?expand=1${colors.reset}`
    );
    console.log(`2. Fill in the PR template with:`);
    console.log(`   - Clear change summary`);
    console.log(`   - Related ECC skills`);
    console.log(`   - Screenshots (if UI changes)`);
    console.log(`   - Link to associated Issue`);
    console.log(`3. Create PR and wait for CI checks\n`);

    const createPRNow = await question(
      `${colors.blue}→${colors.reset} Open PR page in browser? (y/n): `
    );
    if (createPRNow.toLowerCase() === 'y') {
      const url = `https://github.com/lumoryxr/lumo-task-web/compare/${branch}?expand=1`;
      const openCmd =
        process.platform === 'darwin'
          ? `open "${url}"`
          : process.platform === 'win32'
            ? `start "${url}"`
            : `xdg-open "${url}"`;
      try {
        execSync(openCmd);
      } catch {
        console.log(`${colors.yellow}Could not open browser automatically.${colors.reset}`);
      }
    }

    console.log(`\n${colors.green}${colors.bold}✨ Workflow complete!${colors.reset}\n`);
    rl.close();
    process.exit(0);
  } catch (err) {
    console.error(`${colors.red}Error:${colors.reset}`, err.message);
    rl.close();
    process.exit(1);
  }
}

main();
