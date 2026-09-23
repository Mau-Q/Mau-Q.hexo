#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const readline = require('node:readline/promises');
const yaml = require('js-yaml');

const projectRoot = path.resolve(__dirname, '..');
const siteConfig = yaml.load(fs.readFileSync(path.join(projectRoot, '_config.yml'), 'utf8')) || {};
const deployConfig = siteConfig.deploy || {};
const configuredTarget = process.env.BLOG_PUBLISH_DIR || deployConfig.repo;
const publicDir = path.resolve(projectRoot, String(siteConfig.public_dir || 'public'));
const expectedBranch = String(deployConfig.branch || '').trim();
const excludedPaths = [
  '.git/',
  '.gitignore',
  '.DS_Store',
  '.nojekyll'
];

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

async function main() {
  if (!configuredTarget) {
    throw new Error('Set deploy.repo in _config.yml or BLOG_PUBLISH_DIR before local publishing.');
  }
  if (/^(?:https?|git|ssh):\/\//i.test(configuredTarget) || configuredTarget.startsWith('git@')) {
    throw new Error('Local publishing requires a filesystem path in deploy.repo or BLOG_PUBLISH_DIR.');
  }

  const targetDir = path.resolve(projectRoot, configuredTarget);
  const initialTarget = inspectTarget(targetDir);
  assertTargetClean(initialTarget);
  assertExpectedBranch(initialTarget);
  assertPathsDoNotOverlap(publicDir, targetDir);

  run('npm', ['run', 'blog:slug:fix']);
  run('npm', ['run', 'blog:sync']);
  run('npm', ['run', 'clean']);
  run('npm', ['run', 'check:syntax']);
  run('npm', ['test']);
  run('npm', ['run', 'build']);
  run('npm', ['run', 'blog:doctor']);

  const beforePreview = inspectTarget(targetDir);
  assertTargetUnchanged(initialTarget, beforePreview);

  const rsyncArgs = buildRsyncArgs(publicDir, targetDir);
  console.log('\nProposed local publishing changes (dry run):');
  run('rsync', ['--dry-run', ...rsyncArgs]);

  const beforeSync = inspectTarget(targetDir);
  assertTargetUnchanged(initialTarget, beforeSync);
  await confirmLocalSync();

  const immediatelyBeforeSync = inspectTarget(targetDir);
  assertTargetUnchanged(initialTarget, immediatelyBeforeSync);
  run('rsync', rsyncArgs);
  console.log('\nLocal publishing directory updated. Commit and push it separately when ready.');
}

function inspectTarget(targetDir) {
  if (!fs.existsSync(targetDir)) {
    throw new Error('Publishing directory does not exist: ' + targetDir);
  }

  const realTarget = fs.realpathSync(targetDir);
  const root = gitOutput(targetDir, ['rev-parse', '--show-toplevel']);
  const realRoot = fs.realpathSync(root);
  if (realRoot !== realTarget) {
    throw new Error('Publishing directory must be the root of its Git checkout: ' + targetDir);
  }

  const branch = gitOutput(targetDir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const head = gitOutput(targetDir, ['rev-parse', 'HEAD']);
  const status = gitOutput(targetDir, ['status', '--porcelain=v1', '--untracked-files=all']);
  return { targetDir: realTarget, branch, head, status };
}

function assertTargetClean(target) {
  if (target.status) {
    throw new Error([
      'Refusing to sync into a publishing checkout with modified or untracked files:',
      target.status,
      'Review or preserve those files, then retry.'
    ].join('\n'));
  }
}

function assertExpectedBranch(target) {
  if (expectedBranch && target.branch !== expectedBranch) {
    throw new Error('Expected publishing branch ' + expectedBranch + ', found ' + target.branch + '.');
  }
}

function assertTargetUnchanged(before, after) {
  assertTargetClean(after);
  assertExpectedBranch(after);
  if (before.targetDir !== after.targetDir || before.branch !== after.branch || before.head !== after.head) {
    throw new Error('Publishing checkout changed during the build. No files were synced; review it and retry.');
  }
}

function assertPathsDoNotOverlap(sourceDir, targetDir) {
  if (isInside(sourceDir, targetDir) || isInside(targetDir, sourceDir)) {
    throw new Error('The public directory and publishing checkout must be separate directories.');
  }
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function buildRsyncArgs(sourceDir, targetDir) {
  const args = ['--archive', '--verbose', '--delete', '--itemize-changes'];
  for (const excludedPath of excludedPaths) {
    args.push('--exclude=' + excludedPath);
  }
  args.push(sourceDir + path.sep, targetDir + path.sep);
  return args;
}

async function confirmLocalSync() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Refusing a non-interactive local sync. Review the dry-run in a terminal and run again.');
  }

  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await prompt.question(
      '\nThis updates only the local publishing checkout. Type SYNC-LOCAL to apply the preview: '
    );
    if (answer.trim() !== 'SYNC-LOCAL') {
      throw new Error('Local sync cancelled.');
    }
  } finally {
    prompt.close();
  }
}

function gitOutput(targetDir, args) {
  return capture('git', ['-C', targetDir, ...args]).trim();
}

function capture(command, args) {
  const result = spawnSync(command, args, { cwd: projectRoot, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const details = String(result.stderr || result.stdout || '').trim();
    throw new Error(command + ' failed' + (details ? ':\n' + details : '.'));
  }
  return result.stdout || '';
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: projectRoot, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(command + ' exited with status ' + String(result.status) + '.');
  }
}
