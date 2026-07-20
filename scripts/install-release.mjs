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
 * Install the built release copy (dist/<id>/) into SauceMods as a REAL directory (no link),
 * so you can run the actual standalone release. Replaces any dev link or prior release copy.
 */
import fs from 'node:fs';
import path from 'node:path';
import {repoRoot, modId, sauceModsRoot, removeInstalled, copyTree} from './_common.mjs';

const distDir = path.join(repoRoot, 'dist', modId);
if (!fs.existsSync(distDir)) {
    console.error('No release build found. Run `npm run build` first.');
    process.exit(1);
}
const dst = path.join(sauceModsRoot(), modId);
removeInstalled(dst);
copyTree(distDir, dst);
console.log(`install-release (copy):\n  ${dst}\n  (standalone copy of ${distDir})`);
console.log('Restart Sauce. This is the real release build, not a link.');
