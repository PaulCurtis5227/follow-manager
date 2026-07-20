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
 * Control window: reads the follow lists via host RPCs, renders verification + the two action
 * lists, and drives the throttled batch runner from follow-engine.mjs. All set math / batching
 * logic lives in follow-engine.mjs (unit-tested); this file is DOM wiring only.
 */
import * as Common from '/pages/src/common.mjs';
import {computeSets, verify, selectForRemoval, runBatch, ZWIFT_FOLLOW_LIMIT} from './follow-engine.mjs';

Common.enableSentry && Common.enableSentry();

const MAX_RENDER = 800;          // cap DOM rows; batches still act on the full set
const BLANK_AVATAR = '/pages/images/blankavatar.png';

const settings = Common.settingsStore.get(null, {
    throttleMs: 600,
    confirmBeforeRun: true,
    expectedFollowing: '',
    expectedFollowers: '',
    pruneTarget: 0,
    pruneAll: false,
    prunePoolAll: false,
});

// ---- module state -------------------------------------------------------------------------------
let following = [];       // [{id, athlete}] — people you follow
let followers = [];       // [{id, athlete}] — people who follow you
let sets = computeSets([], []);
let followBackList = [];   // working copy (user can exclude rows)
let prunePool = [];        // working copy of the prune candidate pool
let pruneSelected = [];    // subset of prunePool chosen for removal
let running = false;
let abortController = null;

const $ = sel => document.querySelector(sel);
const el = {};

// ---- helpers ------------------------------------------------------------------------------------
function idOf(x) {
    return x == null ? null : Number(x.id != null ? x.id : x.athleteId);
}

function nameOf(entry) {
    const a = entry.athlete || {};
    return a.sanitizedFullname || a.fullname || (a.name && a.name.join(' ')) || `ID ${idOf(entry)}`;
}

function rowHtml(entry) {
    const id = idOf(entry);
    const a = entry.athlete || {};
    const avatar = a.avatar || BLANK_AVATAR;
    return `<li class="fm-row" data-id="${id}">` +
        `<img class="av" src="${avatar}" onerror="this.src='${BLANK_AVATAR}'"/>` +
        `<span class="nm">${Common.sanitize(nameOf(entry))}</span>` +
        `<span class="id">${id}</span>` +
        `<a class="rm" title="Remove from this list" data-id="${id}"><ms>close</ms></a>` +
        `</li>`;
}

function renderList(container, overflowEl, entries) {
    const shown = entries.slice(0, MAX_RENDER);
    container.innerHTML = shown.map(rowHtml).join('');
    overflowEl.textContent = entries.length > MAX_RENDER ?
        `Showing ${MAX_RENDER} of ${entries.length}. Actions still apply to all ${entries.length}.` : '';
}

function log(msg, cls) {
    const li = document.createElement('li');
    if (cls) {
        li.className = cls;
    }
    const now = new Date();
    const t = now.toTimeString().slice(0, 8);
    li.innerHTML = `<span class="t">${t}</span>${Common.sanitize(msg)}`;
    el.log.prepend(li);
}

// ---- rendering ----------------------------------------------------------------------------------
function renderSummary() {
    el.summary.innerHTML = [
        ['Following', sets.followingCount],
        ['Followers', sets.followersCount],
        ['Mutual', sets.mutualCount],
        ['One-way follows', sets.oneWay.length],
        ['Not followed back', sets.followBack.length],
    ].map(([k, v]) => `<span class="stat">${k}: <b>${v}</b></span>`).join('');
}

function renderVerify() {
    const v = verify({
        expectedFollowing: settings.expectedFollowing,
        expectedFollowers: settings.expectedFollowers,
        followingLen: following.length,
        followersLen: followers.length,
    });
    // Quota gauge
    el.quotaNow.textContent = v.effectiveFollowing.toLocaleString();
    const pct = Math.min(100, (v.effectiveFollowing / ZWIFT_FOLLOW_LIMIT) * 100);
    el.quotaFill.style.width = pct + '%';
    const nearLimit = v.slotsLeft <= 50 || v.overLimit;
    el.quotaFill.classList.toggle('warn', nearLimit);
    el.quotaSlots.textContent = v.overLimit ?
        `${(-v.slotsLeft).toLocaleString()} OVER the ${ZWIFT_FOLLOW_LIMIT} limit` :
        `${v.slotsLeft.toLocaleString()} slots left`;

    // Banner
    const parts = [];
    if (following.length === 0 || followers.length === 0) {
        parts.push(`<div class="note-box">Sauce may still be syncing your follow lists — if these ` +
            `look empty or too small, reopen this window in a minute.</div>`);
    }
    const warns = [];
    if (v.missingFollowing != null && v.missingFollowing > 0) {
        warns.push(`<span class="big">${v.missingFollowing}</span> of your ${v.expectedFollowing} ` +
            `followings are <b>hidden</b> here — most likely un-accepted follow requests that still ` +
            `count toward your ${ZWIFT_FOLLOW_LIMIT} limit. They can't be listed or cancelled from ` +
            `this mod, but they explain "missing" slots.`);
    } else if (v.missingFollowing != null && v.missingFollowing < 0) {
        warns.push(`This mod sees <b>${-v.missingFollowing} more</b> followings than the count you ` +
            `entered — your entered number may be stale, or a sync just completed.`);
    }
    if (v.missingFollowers != null && v.missingFollowers > 0) {
        warns.push(`<span class="big">${v.missingFollowers}</span> of your followers aren't visible ` +
            `here (Sauce sync may be incomplete).`);
    } else if (v.missingFollowers != null && v.missingFollowers < 0) {
        warns.push(`This mod sees ${-v.missingFollowers} more followers than the count you entered.`);
    }
    if (warns.length) {
        parts.push(`<div class="warn-box">⚠ ${warns.join('<br>⚠ ')}<br>` +
            `<span style="font-weight:400">Bulk actions still work — they operate on the ` +
            `${following.length} visible followings / ${followers.length} visible followers.</span></div>`);
    } else if (v.missingFollowing === 0 && v.missingFollowers === 0) {
        parts.push(`<div class="ok-box">✓ Lists match the counts you entered — nothing hidden.</div>`);
    } else if (v.expectedFollowing == null && v.expectedFollowers == null && parts.length === 0) {
        parts.push(`<div class="note-box">Enter the counts Zwift shows you (above) to check for ` +
            `hidden/phantom follow slots.</div>`);
    }
    el.verifyBanner.innerHTML = parts.join('');
}

function rebuildDerived() {
    sets = computeSets(following, followers);
    followBackList = sets.followBack.slice();
    prunePool = (settings.prunePoolAll ? following.slice() : sets.oneWay.slice());
    recomputePruneSelection();
}

function recomputePruneSelection() {
    pruneSelected = selectForRemoval(prunePool, {
        count: Number(settings.pruneTarget) || 0,
        all: !!settings.pruneAll,
    });
}

function renderFollowBack() {
    el.fbNote.textContent = `${followBackList.length} to follow`;
    el.btnFollowAll.textContent = `Follow all (${followBackList.length})`;
    el.btnFollowAll.disabled = running || followBackList.length === 0;
    renderList(el.followBackList, el.fbOverflow, followBackList);
}

function renderPrune() {
    const poolLabel = settings.prunePoolAll ? 'all following' : 'one-way follows';
    el.prNote.textContent = `${pruneSelected.length} selected of ${prunePool.length} (${poolLabel})`;
    el.btnUnfollow.textContent = `Unfollow selected (${pruneSelected.length})`;
    el.btnUnfollow.disabled = running || pruneSelected.length === 0;
    renderList(el.pruneList, el.prOverflow, pruneSelected);
}

function renderAll() {
    renderSummary();
    renderVerify();
    renderFollowBack();
    renderPrune();
}

// ---- data loading -------------------------------------------------------------------------------
async function loadAndRender() {
    el.btnRefresh.disabled = true;
    try {
        const [fg, fr] = await Promise.all([
            Common.rpc.getFollowingAthletes(),
            Common.rpc.getFollowerAthletes(),
        ]);
        following = Array.isArray(fg) ? fg.filter(x => idOf(x) != null) : [];
        followers = Array.isArray(fr) ? fr.filter(x => idOf(x) != null) : [];
        rebuildDerived();
        renderAll();
        log(`Loaded ${following.length} following, ${followers.length} followers.`);
    } catch (e) {
        log(`Failed to load follow lists: ${e.message || e}`, 'err');
    } finally {
        el.btnRefresh.disabled = running;
    }
}

// ---- batch actions ------------------------------------------------------------------------------
function setRunning(on, label) {
    running = on;
    el.progressBox.classList.toggle('hidden', !on);
    el.progressLabel.textContent = label || 'Working…';
    el.btnRefresh.disabled = on;
    // action buttons re-enabled by their renderers
    renderFollowBack();
    renderPrune();
}

function updateProgress(p) {
    const pct = p.total ? (p.done / p.total) * 100 : 0;
    el.progressFill.style.width = pct + '%';
    el.progressText.textContent =
        `${p.done} / ${p.total}  ·  ${p.ok} ok  ·  ${p.failed} failed`;
}

async function runFollowBack() {
    if (running || !followBackList.length) {
        return;
    }
    const ids = followBackList.map(idOf);
    if (settings.confirmBeforeRun &&
        !window.confirm(`Follow ${ids.length} athlete(s)? This changes your real Zwift account.`)) {
        return;
    }
    abortController = new AbortController();
    setRunning(true, `Following ${ids.length}…`);
    updateProgress({done: 0, total: ids.length, ok: 0, failed: 0});
    const result = await runBatch(ids, id => Common.rpc.setFollowing(id), {
        delayMs: Number(settings.throttleMs) || 0,
        signal: abortController.signal,
        onProgress: updateProgress,
    });
    // Optimistic local update: move successfully-followed people into `following`.
    const errored = new Set(result.errors.map(e => e.id));
    const followerById = new Map(followers.map(x => [idOf(x), x]));
    for (const id of ids) {
        if (!errored.has(id) && !result.aborted) {
            const src = followerById.get(id);
            following.push(src ? {id, athlete: src.athlete} : {id});
        }
    }
    finishRun('Followed', result);
}

async function runUnfollow() {
    if (running || !pruneSelected.length) {
        return;
    }
    const ids = pruneSelected.map(idOf);
    if (settings.confirmBeforeRun &&
        !window.confirm(`Unfollow ${ids.length} athlete(s)? This changes your real Zwift account.`)) {
        return;
    }
    abortController = new AbortController();
    setRunning(true, `Unfollowing ${ids.length}…`);
    updateProgress({done: 0, total: ids.length, ok: 0, failed: 0});
    const result = await runBatch(ids, id => Common.rpc.setNotFollowing(id), {
        delayMs: Number(settings.throttleMs) || 0,
        signal: abortController.signal,
        onProgress: updateProgress,
    });
    const errored = new Set(result.errors.map(e => e.id));
    const removed = new Set(ids.filter(id => !errored.has(id)));
    following = following.filter(x => !removed.has(idOf(x)));
    finishRun('Unfollowed', result);
}

function finishRun(verb, result) {
    setRunning(false);
    abortController = null;
    rebuildDerived();
    renderAll();
    const cls = result.failed ? 'err' : 'ok';
    let msg = `${verb} ${result.ok}` + (result.failed ? `, ${result.failed} failed` : '') +
        (result.aborted ? ' (stopped early)' : '') + '.';
    if (result.requested.length) {
        msg += ` ${result.requested.length} became pending follow-request(s).`;
    }
    log(msg, cls);
    for (const e of result.errors.slice(0, 10)) {
        log(`  failed ${e.id}: ${e.message}`, 'err');
    }
    if (result.errors.length > 10) {
        log(`  …and ${result.errors.length - 10} more errors.`, 'err');
    }
}

// ---- input binding ------------------------------------------------------------------------------
function bindNumber(input, key, after) {
    input.value = settings[key] ?? '';
    input.addEventListener('input', () => {
        const val = input.value === '' ? '' : Number(input.value);
        settings[key] = val;                 // keep local copy authoritative for the callbacks below
        Common.settingsStore.set(key, val);
        if (after) {
            after();
        }
    });
}

function bindCheckbox(input, key, after) {
    input.checked = !!settings[key];
    input.addEventListener('change', () => {
        settings[key] = input.checked;
        Common.settingsStore.set(key, input.checked);
        if (after) {
            after();
        }
    });
}

// ---- list row removal (event delegation) --------------------------------------------------------
function wireRemoval(container, onRemove) {
    container.addEventListener('click', ev => {
        const rm = ev.target.closest('.rm');
        if (!rm) {
            return;
        }
        onRemove(Number(rm.dataset.id));
    });
}

// ---- main ---------------------------------------------------------------------------------------
export async function main() {
    Common.initInteractionListeners && Common.initInteractionListeners();
    for (const id of ['appVersion', 'btnRefresh', 'quotaNow', 'quotaFill', 'quotaSlots', 'quotaLimit',
        'expFollowing', 'expFollowers', 'verifyBanner', 'summary', 'progressBox', 'progressLabel',
        'progressFill', 'progressText', 'btnStop', 'fbNote', 'btnFollowAll', 'followBackList',
        'fbOverflow', 'prNote', 'pruneTarget', 'pruneAll', 'prunePoolAll', 'btnUnfollow', 'pruneList',
        'prOverflow', 'throttleMs', 'confirmBeforeRun', 'log']) {
        el[id] = document.getElementById(id);
    }
    el.quotaLimit.textContent = ZWIFT_FOLLOW_LIMIT;

    Common.rpc.getVersion().then(v => { el.appVersion.textContent = v ? `v${v}` : ''; }).catch(() => {});

    // Bindings
    bindNumber(el.expFollowing, 'expectedFollowing', renderVerify);
    bindNumber(el.expFollowers, 'expectedFollowers', renderVerify);
    bindNumber(el.throttleMs, 'throttleMs');
    bindNumber(el.pruneTarget, 'pruneTarget', () => { recomputePruneSelection(); renderPrune(); });
    bindCheckbox(el.pruneAll, 'pruneAll', () => { recomputePruneSelection(); renderPrune(); });
    bindCheckbox(el.prunePoolAll, 'prunePoolAll', () => { rebuildDerived(); renderPrune(); });
    bindCheckbox(el.confirmBeforeRun, 'confirmBeforeRun');

    // Buttons
    el.btnRefresh.addEventListener('click', loadAndRender);
    el.btnFollowAll.addEventListener('click', runFollowBack);
    el.btnUnfollow.addEventListener('click', runUnfollow);
    el.btnStop.addEventListener('click', () => {
        if (abortController) {
            abortController.abort();
            el.progressLabel.textContent = 'Stopping…';
        }
    });

    // Row removal
    wireRemoval(el.followBackList, id => {
        followBackList = followBackList.filter(x => idOf(x) !== id);
        renderFollowBack();
    });
    wireRemoval(el.pruneList, id => {
        // Remove from the pool entirely so recompute won't re-add it.
        prunePool = prunePool.filter(x => idOf(x) !== id);
        recomputePruneSelection();
        renderPrune();
    });

    await loadAndRender();
}
