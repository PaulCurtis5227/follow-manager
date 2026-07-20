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
 * Build a clean, self-contained release copy under dist/<id>/ (folder only, no dev tooling).
 * Drop that folder into any SauceMods directory to run the release.
 */
import fs from 'node:fs';
import path from 'node:path';
import {repoRoot, modId, manifest, copyTree} from './_common.mjs';

const out = path.join(repoRoot, 'dist', modId);
fs.rmSync(out, {recursive: true, force: true});
copyTree(repoRoot, out);
console.log(`build: ${modId} v${manifest.version}\n  -> ${out}`);
