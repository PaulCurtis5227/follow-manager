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
 * Mirror package.json's version into manifest.json so the two never drift.
 * Run automatically by npm's `version` lifecycle (see package.json) so the manifest bump lands in
 * the SAME tagged commit as the package.json bump. Also runnable standalone.
 *
 * Preserves manifest.json's on-disk formatting (4-space indent + trailing newline) and stages the
 * file with `git add` so `npm version` includes it in the commit it is about to create.
 */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {repoRoot} from './_common.mjs';

const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const manifestPath = path.join(repoRoot, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

if (manifest.version === pkg.version) {
    console.log(`sync-version: manifest already at v${pkg.version} (no change)`);
} else {
    const from = manifest.version;
    manifest.version = pkg.version;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 4) + '\n');
    console.log(`sync-version: manifest.json ${from} -> ${pkg.version}`);
}

// Stage the manifest so `npm version` folds it into its commit. Harmless if unchanged.
try {
    execFileSync('git', ['add', manifestPath], {cwd: repoRoot, stdio: 'inherit'});
} catch (e) {
    console.warn('sync-version: could not `git add` manifest.json (not a git checkout?):', e.message);
}
