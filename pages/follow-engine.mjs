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
 * Pure, DOM-free logic for the mod. No dependency on Common/Sauce so it is unit-testable headless
 * with a mock rpc and a fake clock. control.mjs wires this to the UI and the host RPCs.
 */

export const ZWIFT_FOLLOW_LIMIT = 5000;

/* Normalize a list entry to a numeric id. Accepts {id}, {athleteId}, or a bare number. */
function entryId(x) {
    if (x == null) {
        return null;
    }
    if (typeof x === 'number') {
        return x;
    }
    const id = x.id != null ? x.id : x.athleteId;
    return id == null ? null : Number(id);
}

/*
 * Compute the actionable sets from the two enumerated lists.
 *   following: [{id, athlete}]  — people YOU follow
 *   followers: [{id, athlete}]  — people who follow YOU
 * Returns:
 *   followBack  — followers you do NOT follow back (candidates to follow)
 *   oneWay      — people you follow who do NOT follow you back (default prune pool)
 *   mutualCount — count of reciprocated follows
 *   followingCount / followersCount — enumerated list lengths
 * Order of the input lists is preserved in the outputs.
 */
export function computeSets(following = [], followers = []) {
    const followingIds = new Set();
    for (const x of following) {
        const id = entryId(x);
        if (id != null) {
            followingIds.add(id);
        }
    }
    const followerIds = new Set();
    for (const x of followers) {
        const id = entryId(x);
        if (id != null) {
            followerIds.add(id);
        }
    }
    const followBack = followers.filter(x => {
        const id = entryId(x);
        return id != null && !followingIds.has(id);
    });
    const oneWay = following.filter(x => {
        const id = entryId(x);
        return id != null && !followerIds.has(id);
    });
    let mutualCount = 0;
    for (const id of followingIds) {
        if (followerIds.has(id)) {
            mutualCount++;
        }
    }
    return {
        followingIds,
        followerIds,
        followBack,
        oneWay,
        mutualCount,
        followingCount: followingIds.size,
        followersCount: followerIds.size,
    };
}

/*
 * Verify enumerated list lengths against the user-supplied "expected" counts (read from the Zwift
 * app/website, since Sauce does not expose the true counts to mods). A positive `missing*` value
 * means Zwift reports more than the mod can see — the likely phantom/pending slots that still
 * consume the 5000 limit. Returns nulls where an expected value was not provided.
 *
 *   expectedFollowing / expectedFollowers — numbers or null/'' (not provided)
 *   followingLen / followersLen           — actual enumerated list lengths
 *   limit                                 — follow cap (default 5000)
 */
export function verify({expectedFollowing, expectedFollowers, followingLen, followersLen,
                        limit = ZWIFT_FOLLOW_LIMIT} = {}) {
    const expFollowing = numOrNull(expectedFollowing);
    const expFollowers = numOrNull(expectedFollowers);
    const missingFollowing = expFollowing == null ? null : expFollowing - followingLen;
    const missingFollowers = expFollowers == null ? null : expFollowers - followersLen;
    // Quota is best expressed against the authoritative (expected) following count when we have it,
    // else against what we can see.
    const effectiveFollowing = expFollowing != null ? expFollowing : followingLen;
    const slotsLeft = limit - effectiveFollowing;
    return {
        expectedFollowing: expFollowing,
        expectedFollowers: expFollowers,
        missingFollowing,
        missingFollowers,
        hasFollowingDiscrepancy: missingFollowing != null && missingFollowing !== 0,
        hasFollowersDiscrepancy: missingFollowers != null && missingFollowers !== 0,
        effectiveFollowing,
        slotsLeft,
        overLimit: effectiveFollowing > limit,
    };
}

function numOrNull(v) {
    if (v == null || v === '') {
        return null;
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

/*
 * Choose which entries of `pool` to act on.
 *   all  — true selects the whole pool
 *   count — otherwise, take the first N (clamped to [0, pool.length])
 */
export function selectForRemoval(pool = [], {count = 0, all = false} = {}) {
    if (all) {
        return pool.slice();
    }
    const n = Math.max(0, Math.min(pool.length, Math.floor(Number(count) || 0)));
    return pool.slice(0, n);
}

const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/*
 * Run an async action over a list of ids, SEQUENTIALLY, with a throttle delay between calls (never
 * parallel — respects Zwift rate limits). Errors on individual items are captured and do not abort
 * the run; an AbortSignal or a shouldStop() callback stops it cleanly between items.
 *
 *   ids      — array of athlete ids
 *   action   — async (id) => result   (e.g. id => rpc.setFollowing(id))
 *   delayMs  — throttle between items (default 600; no delay after the last item)
 *   signal   — optional AbortSignal
 *   shouldStop — optional () => boolean, checked before each item
 *   onProgress — optional ({done,total,ok,failed,id}) => void, called after each item
 *   sleep    — injectable delay fn (for tests)
 *
 * Returns {ok, failed, done, total, aborted, errors:[{id,message}], requested:[ids]} where
 * `requested` collects ids whose action returned {followRequest:true} (pending, still cancellable).
 */
export async function runBatch(ids = [], action, {delayMs = 600, signal, shouldStop,
                                                  onProgress, sleep = defaultSleep} = {}) {
    const total = ids.length;
    const result = {ok: 0, failed: 0, done: 0, total, aborted: false, errors: [], requested: []};
    for (let i = 0; i < ids.length; i++) {
        if ((signal && signal.aborted) || (shouldStop && shouldStop())) {
            result.aborted = true;
            break;
        }
        const id = ids[i];
        try {
            const r = await action(id);
            result.ok++;
            if (r && r.followRequest) {
                result.requested.push(id);
            }
        } catch (e) {
            result.failed++;
            result.errors.push({id, message: (e && e.message) ? e.message : String(e)});
        }
        result.done++;
        if (onProgress) {
            onProgress({done: result.done, total, ok: result.ok, failed: result.failed, id});
        }
        if (i < ids.length - 1 && delayMs > 0) {
            await sleep(delayMs);
        }
    }
    return result;
}
