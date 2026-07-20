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
 * Install this repo into SauceMods as a junction (live testing — edits are picked up on
 * the next Sauce restart, no copy step). Replaces any existing dev link or release copy.
 */
import fs from 'node:fs';
import path from 'node:path';
import {repoRoot, modId, sauceModsRoot, removeInstalled} from './_common.mjs';

const dst = path.join(sauceModsRoot(), modId);
removeInstalled(dst);
fs.symlinkSync(repoRoot, dst, 'junction');
console.log(`dev-link (junction):\n  ${dst}\n  -> ${repoRoot}`);
console.log('Restart Sauce and enable the mod in Settings → Mods.');
