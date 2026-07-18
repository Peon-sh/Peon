#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import readline from 'readline';
import OpenAI from 'openai';
import 'dotenv/config';

const OPENAI_MODEL = 'gpt-4.1-mini';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function run(cmd) {
  return execSync(cmd, { stdio: ['pipe', 'pipe', 'ignore'] })
    .toString()
    .trim();
}

function getLastTag() {
  try {
    return run('git describe --tags --abbrev=0');
  } catch {
    return null;
  }
}

function getCommitMessages(sinceTag) {
  const range = sinceTag ? `${sinceTag}..HEAD` : 'HEAD';
  const log = run(`git log ${range} --pretty=format:%s`);
  return log.split('\n').filter(Boolean);
}

function getCommitDetails(sinceTag) {
  const range = sinceTag ? `${sinceTag}..HEAD` : 'HEAD';
  const log = run(`git log ${range} --pretty=format:"%h|%s"`);
  return log
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, ...msg] = line.split('|');
      return { hash, message: msg.join('|') };
    });
}

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    }),
  );
}

function bumpVersion(lastTag, type) {
  if (!lastTag) return 'v1.0.0';
  const parts = lastTag.replace(/^v/, '').split('.').map(Number);
  switch (type) {
    case 'major':
      parts[0] += 1;
      parts[1] = 0;
      parts[2] = 0;
      break;
    case 'minor':
      parts[1] += 1;
      parts[2] = 0;
      break;
    case 'patch':
    default:
      parts[2] += 1;
      break;
  }
  return 'v' + parts.join('.');
}

async function generateDetailedReleaseNotes(commits, version) {
  const commitList = commits
    .map((c, i) => `${i + 1}. [${c.hash}] ${c.message}`)
    .join('\n');

  const prompt = `
    Here are the commit messages for the new release ${version}:
    ${commitList}

    Please write short, clear, and natural-sounding release notes for this release.
    - Group changes into Features, Fixes, Improvements, and Other if needed.
    - Keep it concise and easy to read.
    - Start with a brief summary.
    - Use Markdown formatting.
    - No emojis.
  `;

  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.choices[0].message.content.trim();
}

function createAndPushTag(version) {
  run(`git tag ${version}`);
  run(`git push origin ${version}`);
  console.log(`\nGit tag ${version} created and pushed.\n`);
}

function createGitHubRelease(version, notes) {
  const tmpFile = `.release_notes_tmp.md`;
  fs.writeFileSync(tmpFile, notes, 'utf8');

  execSync(`gh release create ${version} --title "${version}" -F ${tmpFile}`, {
    stdio: 'inherit',
  });

  fs.unlinkSync(tmpFile);
}

async function main() {
  console.log('\nAutomated Release Script\n');

  const lastTag = getLastTag();
  const commits = getCommitMessages(lastTag);
  const commitDetails = getCommitDetails(lastTag);

  if (!commits.length) {
    console.log('No new commits since last release.');
    process.exit(0);
  }

  console.log(
    `Found ${commits.length} commit(s) since ${lastTag || 'the beginning'}.\n`,
  );

  let bumpType = (
    (await askQuestion(
      'Choose version bump (major / minor / patch) [patch]: ',
    )) || 'patch'
  ).toLowerCase();

  if (!['major', 'minor', 'patch'].includes(bumpType)) {
    console.log('Invalid bump type, defaulting to patch.');
    bumpType = 'patch';
  }

  const newVersion = bumpVersion(lastTag, bumpType);
  console.log(`\nCreating release ${newVersion} (${bumpType} bump)\n`);

  let notes;
  try {
    notes = await generateDetailedReleaseNotes(commitDetails, newVersion);
  } catch (err) {
    console.error('Failed to generate release notes:', err);
    process.exit(1);
  }

  try {
    createAndPushTag(newVersion);
  } catch (err) {
    console.error('Failed to create or push git tag:', err);
    process.exit(1);
  }

  try {
    createGitHubRelease(newVersion, notes);
  } catch (err) {
    console.error('Failed to create GitHub release:', err);
    process.exit(1);
  }

  console.log('\nRelease process completed successfully.\n');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
