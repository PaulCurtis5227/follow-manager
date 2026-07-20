/*
 * Follow Manager — a Sauce for Zwift mod.
 * Copyright (C) 2026 Paul Curtis
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * This program is free software: you can redistribute it and/or modify it under the terms of the
 * GNU General Public License as published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version. This program is distributed WITHOUT ANY WARRANTY;
 * see the GNU General Public License <https://www.gnu.org/licenses/> for details.
 *
 * Build the release artifact: a zip of exactly the COMMITTED files (HEAD), named with the version.
 *
 * Uses `git archive`, so:
 *   - only git-tracked files are included (uncommitted/working-tree edits are ignored),
 *   - CLAUDE.md is excluded (it is untracked/gitignored, and .gitattributes marks it export-ignore).
 * The archive is prefixed with `follow-manager/` so unzipping yields a ready-to-drop mod folder.
 */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {repoRoot, modId, manifest} from './_common.mjs';

const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

// Guard: manifest and package.json must agree, or the release would ship a mislabeled version.
if (manifest.version !== pkg.version) {
    console.error(
        `package: version mismatch — manifest.json v${manifest.version} vs package.json v${pkg.version}.\n` +
        `  Run \`node scripts/sync-version.mjs\` (or use \`npm version\`) to reconcile.`);
    process.exit(1);
}

const version = pkg.version;
const distDir = path.join(repoRoot, 'dist');
fs.mkdirSync(distDir, {recursive: true});
const zipPath = path.join(distDir, `${modId}-v${version}.zip`);
fs.rmSync(zipPath, {force: true});

execFileSync('git', [
    'archive',
    '--format=zip',
    `--prefix=${modId}/`,
    '-o', zipPath,
    'HEAD',
], {cwd: repoRoot, stdio: 'inherit'});

const {size} = fs.statSync(zipPath);
console.log(`package: ${modId} v${version}\n  -> ${zipPath} (${(size / 1024).toFixed(1)} KiB)`);
