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
 * Shared helpers for the mod's dev/release scripts. Node built-ins only.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8'));
export const modId = manifest.id;

// Files/dirs that are dev tooling or VCS — never shipped in a release copy.
const EXCLUDE = new Set([
    '.git', '.gitignore', 'node_modules', 'dist', 'scripts', 'package.json', 'package-lock.json',
]);

/* Locate the SauceMods root Sauce actually scans (Documents is often OneDrive-redirected). */
export function sauceModsRoot() {
    if (process.env.SAUCEMODS) {
        return process.env.SAUCEMODS;
    }
    const home = process.env.USERPROFILE || process.env.HOME || '';
    const candidates = [
        path.join(home, 'OneDrive', 'Documents', 'SauceMods'),
        path.join(home, 'Documents', 'SauceMods'),
    ];
    return candidates.find(p => fs.existsSync(p)) || candidates[0];
}

export function copyTree(src, dst) {
    fs.mkdirSync(dst, {recursive: true});
    for (const entry of fs.readdirSync(src, {withFileTypes: true})) {
        if (EXCLUDE.has(entry.name)) {
            continue;
        }
        const s = path.join(src, entry.name);
        const d = path.join(dst, entry.name);
        if (entry.isDirectory()) {
            copyTree(s, d);
        } else {
            fs.copyFileSync(s, d);
        }
    }
}

/*
 * Clear an installed mod slot safely:
 *  - a junction/symlink is UNLINKED (we must never recurse through it and delete the source),
 *  - a real directory (a release copy) is removed outright.
 */
export function removeInstalled(p) {
    let st;
    try {
        st = fs.lstatSync(p);
    } catch (e) {
        return;  // nothing there
    }
    if (st.isSymbolicLink()) {
        try {
            fs.unlinkSync(p);
        } catch (e) {
            fs.rmdirSync(p);  // Windows directory junctions
        }
    } else {
        fs.rmSync(p, {recursive: true, force: true});
    }
}
