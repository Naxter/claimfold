import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * `npm run devlog -- --title "The approve button is disabled" --phase 5`
 *
 * Creates a dated devlog entry with the frontmatter the build log expects, so
 * every entry is machine-readable later — the plan is to turn these into
 * carousels about the build itself, and that only works if the metadata is
 * consistent rather than remembered.
 *
 * The template's prompts are deliberately about *decisions and failures*, not
 * features. "Here is why I chose X over Y" is the entry worth reading; "here
 * is what I built" is a changelog, and git already has one.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const devlogDir = resolve(repoRoot, 'docs', 'devlog')

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

const title = arg('title')
if (!title) {
  console.error('Usage: npm run devlog -- --title "What happened" [--phase 5] [--tags a,b]')
  console.error('\nExisting entries:')
  for (const file of readdirSync(devlogDir).sort()) console.error(`  ${file}`)
  process.exit(1)
}

// Local date, not UTC: an entry written at 23:30 CET belongs to that day, and
// toISOString() would file it under tomorrow.
const now = new Date()
const date = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, '0'),
  String(now.getDate()).padStart(2, '0'),
].join('-')

const slug = slugify(title)
const file = resolve(devlogDir, `${date}-${slug}.md`)

if (existsSync(file)) {
  console.error(`${file} already exists. Edit it, or pick a different title.`)
  process.exit(1)
}

const phase = arg('phase') ?? ''
const tags = (arg('tags') ?? '')
  .split(',')
  .map((t) => t.trim())
  .filter(Boolean)

const template = `---
title: ${title}
date: ${date}
phase: ${phase}
milestone: ''
tags: [${tags.map((t) => `'${t}'`).join(', ')}]
screenshots: []
post_candidate: false
---

# ${title}

<!--
Write for someone who was not there. That is what makes an entry usable months
later, and it is the difference between a build log and a diary.

Three prompts, in order of how well they read:
  1. What did you decide, and what did you decide against?
  2. What broke, and what did the failure actually turn out to be?
  3. What is still wrong that you are choosing to live with?
-->

## What changed

## What broke

## What I decided, and why

## Still open
`

writeFileSync(file, template, 'utf8')
console.log(`Created docs/devlog/${date}-${slug}.md`)
