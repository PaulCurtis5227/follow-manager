/*
 * Follow Manager — a Sauce for Zwift mod.
 * Copyright (C) 2026 Paul Curtis
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Headless unit tests for the pure follow engine. No Sauce/Common; mock rpc + fake clock.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
    computeSets, verify, selectForRemoval, runBatch, ZWIFT_FOLLOW_LIMIT,
} from '../pages/follow-engine.mjs';

const A = id => ({id, athlete: {sanitizedFullname: `A${id}`}});

test('computeSets: followBack, oneWay, mutual', () => {
    const following = [A(1), A(2), A(3)];       // you follow 1,2,3
    const followers = [A(2), A(3), A(4), A(5)]; // 2,3,4,5 follow you
    const s = computeSets(following, followers);
    assert.deepEqual(s.followBack.map(x => x.id), [4, 5]); // follow you, not followed back
    assert.deepEqual(s.oneWay.map(x => x.id), [1]);        // you follow, no follow back
    assert.equal(s.mutualCount, 2);                        // 2 and 3
    assert.equal(s.followingCount, 3);
    assert.equal(s.followersCount, 4);
});

test('computeSets: empty and de-dupes ids into counts', () => {
    const s = computeSets([], []);
    assert.deepEqual(s.followBack, []);
    assert.deepEqual(s.oneWay, []);
    assert.equal(s.mutualCount, 0);
    // accepts bare-number and {athleteId} shapes
    const s2 = computeSets([1, {athleteId: 2}], [{athleteId: 2}, 3]);
    assert.deepEqual(s2.followBack.map(x => x.athleteId ?? x), [3]);
    assert.deepEqual(s2.oneWay.map(x => x), [1]);
});

test('verify: missing counts = phantom detection + quota', () => {
    const v = verify({expectedFollowing: 4987, expectedFollowers: 5000,
                      followingLen: 4950, followersLen: 5000});
    assert.equal(v.missingFollowing, 37);
    assert.equal(v.hasFollowingDiscrepancy, true);
    assert.equal(v.missingFollowers, 0);
    assert.equal(v.hasFollowersDiscrepancy, false);
    assert.equal(v.effectiveFollowing, 4987);
    assert.equal(v.slotsLeft, ZWIFT_FOLLOW_LIMIT - 4987);
    assert.equal(v.overLimit, false);
});

test('verify: no expected value provided -> nulls, quota from actual', () => {
    const v = verify({expectedFollowing: '', expectedFollowers: null,
                      followingLen: 100, followersLen: 200});
    assert.equal(v.missingFollowing, null);
    assert.equal(v.hasFollowingDiscrepancy, false);
    assert.equal(v.effectiveFollowing, 100);
    assert.equal(v.slotsLeft, ZWIFT_FOLLOW_LIMIT - 100);
});

test('selectForRemoval: N and select-all with clamping', () => {
    const pool = [A(1), A(2), A(3), A(4)];
    assert.deepEqual(selectForRemoval(pool, {count: 2}).map(x => x.id), [1, 2]);
    assert.deepEqual(selectForRemoval(pool, {count: 99}).map(x => x.id), [1, 2, 3, 4]);
    assert.deepEqual(selectForRemoval(pool, {count: -5}).map(x => x.id), []);
    assert.deepEqual(selectForRemoval(pool, {all: true}).map(x => x.id), [1, 2, 3, 4]);
});

test('runBatch: sequential, throttled, captures follow-requests', async () => {
    const calls = [];
    const sleeps = [];
    const fakeSleep = ms => { sleeps.push(ms); return Promise.resolve(); };
    const action = id => {
        calls.push(id);
        return Promise.resolve({following: true, followRequest: id === 2});
    };
    const progress = [];
    const r = await runBatch([1, 2, 3], action, {
        delayMs: 600, sleep: fakeSleep, onProgress: p => progress.push(p.done),
    });
    assert.deepEqual(calls, [1, 2, 3]);          // sequential, in order
    assert.equal(r.ok, 3);
    assert.equal(r.failed, 0);
    assert.deepEqual(r.requested, [2]);          // pending request captured
    assert.deepEqual(sleeps, [600, 600]);        // throttle between items, none after last
    assert.deepEqual(progress, [1, 2, 3]);
});

test('runBatch: per-item errors are captured, run continues', async () => {
    const action = id => id === 2 ?
        Promise.reject(new Error('429 rate limited')) :
        Promise.resolve({following: true});
    const r = await runBatch([1, 2, 3], action, {delayMs: 0});
    assert.equal(r.ok, 2);
    assert.equal(r.failed, 1);
    assert.equal(r.done, 3);
    assert.equal(r.errors.length, 1);
    assert.equal(r.errors[0].id, 2);
    assert.match(r.errors[0].message, /429/);
});

test('runBatch: shouldStop aborts cleanly between items', async () => {
    let n = 0;
    const action = () => { n++; return Promise.resolve({}); };
    const r = await runBatch([1, 2, 3, 4], action, {
        delayMs: 0, shouldStop: () => n >= 2,
    });
    assert.equal(r.aborted, true);
    assert.equal(r.ok, 2);
    assert.equal(n, 2);
});

test('runBatch: pre-aborted signal does nothing', async () => {
    const ac = new AbortController();
    ac.abort();
    let n = 0;
    const r = await runBatch([1, 2], () => { n++; return Promise.resolve({}); },
        {delayMs: 0, signal: ac.signal});
    assert.equal(n, 0);
    assert.equal(r.aborted, true);
    assert.equal(r.done, 0);
});
