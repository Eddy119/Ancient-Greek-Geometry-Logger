// Geometry Logger with direct hooks and changes inspection
// This version:
// - Logs directly from makeline/makearc/newlayer
// - Tracks layerCount and moveCount
// - Prints *new entries* from changes (arc, realline, newlayer) whenever makeline/makearc/newlayer fire
// - Prints labels so you know where the log came from
// - Also appends changes entries to coordbar as coord-entries (concat string per move)
// - Tracks groups of log entries per action, so undo removes all entries from the last action

'use strict';

// Cache DOM elements
const coordBar = document.getElementById('coordscroll');
const nukerBtn = document.getElementById('coordnuker');
let layerCount = 0;
let moveCount = 0;
let realmoveCount = 0; // for real moves later
let logEntries = [];
let lastChangesLength = 0; // track processed changes
let actionGroups = []; // array of arrays of indices in logEntries

function renderLog() {
	if (!coordBar) return;
	coordBar.innerHTML = '';
	logEntries.forEach(entry => {
		const div = document.createElement('div');
		div.textContent = entry;
		div.className = "coord-entry";
		coordBar.appendChild(div);
	});
}

function addLog(label, details, actionTag) {
	const formatted = `${label}: ${details} [action ${actionTag}]`;
	logEntries.push(formatted);
	renderLog();
	return logEntries.length - 1; // return index
}

function addChangesLog(label, entries, actionTag) {
	if (entries.length === 0) return [];
	const combined = entries.map(e => JSON.stringify(e)).join(" | ");
	const formatted = `[changes ${label}] ${combined} [action ${actionTag}]`;
	logEntries.push(formatted);
	renderLog();
	return [logEntries.length - 1];
}

function clearLog() {
	logEntries = [];
	actionGroups = [];
	layerCount = 0;
	moveCount = 0;
	renderLog();
	console.log('Coordinate log cleared');
	lastChangesLength = 0;
}

if (nukerBtn) {
	nukerBtn.addEventListener('click', clearLog);
}

// Save originals
const original_makeline = window.makeline;
const original_makearc = window.makearc;
const original_newlayer = geo.newlayer;
const original_reset = geo.resetall;
const original_undo = geo.undo;
const original_loadhash = geo.loadhash;

function logNewChanges(label, actionTag) {
	if (typeof changes === 'undefined') return [];
	let newEntries = [];
	for (let i = lastChangesLength; i < changes.length; i++) {
		const ch = changes[i];
		if (!ch) continue;
		let filtered = null;
		if (ch.type === 'arc') {
			filtered = {
				type: ch.type,
				name: ch.name,
				centre: ch.obj?.centre,
				edge: ch.obj?.edge,
				radius: ch.obj?.radius,
				a: ch.a,
				b: ch.b
			};
		} else if (ch.type === 'realline') {
			filtered = {
				type: ch.type,
				name: ch.name,
				point1: ch.obj?.point1,
				point2: ch.obj?.point2,
				angle: ch.obj?.angle,
				length: ch.obj?.length,
				a: ch.a,
				b: ch.b
			};
		} else if (ch.type === 'newlayer') {
			filtered = {
				type: ch.type,
				layer: layerCount,
			};
		}

		if (filtered) {
			newEntries.push(filtered);
		}
	}
	lastChangesLength = changes.length;
	return addChangesLog(`after ${label}`, newEntries, actionTag);
}

window.makeline = function(p1, p2) {
	moveCount += 1;
	const actionTag = actionGroups.length + 1;
	let indices = [];
	indices.push(addLog(`[makeline hook] Move ${moveCount}`, `(${p1.x}, ${p1.y}) → (${p2.x}, ${p2.y})`, actionTag));
	const result = original_makeline.apply(this, arguments);
	indices = indices.concat(logNewChanges('makeline', actionTag));
	actionGroups.push(indices);
	return result;
};

window.makearc = function(center, point) {
	moveCount += 1;
	const actionTag = actionGroups.length + 1;
	let indices = [];
	indices.push(addLog(`[makearc hook] Move ${moveCount}`, `Center (${center.x}, ${center.y}), Point (${point.x}, ${point.y})`, actionTag));
	const result = original_makearc.apply(this, arguments);
	indices = indices.concat(logNewChanges('makearc', actionTag));
	actionGroups.push(indices);
	return result;
};

geo.newlayer = function() {
	layerCount += 1;
	const actionTag = actionGroups.length + 1;
	let indices = [];
	indices.push(addLog('[newlayer hook]', `Layer ${layerCount}`, actionTag));
	const result = original_newlayer.apply(this, arguments);
	indices = indices.concat(logNewChanges('newlayer', actionTag));
	actionGroups.push(indices);
	return result;
};

geo.resetall = function() {
	clearLog();
	return original_reset.apply(this, arguments);
};

geo.undo = function() {
	console.log('[undo hook]');
	if (actionGroups.length === 0) return original_undo.apply(this, arguments);

	// Start from the end and find the last real action (not loadhash)
	let undoIndex = actionGroups.length - 1;
	while (undoIndex >= 0) {
		const indices = actionGroups[undoIndex];
		const firstEntry = logEntries[indices[0]] || "";
		if (!firstEntry.includes('loadhash')) break;
		undoIndex--;
	}

	if (undoIndex >= 0) {
		// Remove the last real action
		const indicesToRemove = actionGroups.splice(undoIndex, 1)[0];

		// Also remove any loadhash action groups that immediately followed
		while (undoIndex < actionGroups.length) {
			const indicesNext = actionGroups[undoIndex];
			const firstEntryNext = logEntries[indicesNext[0]] || "";
			if (!firstEntryNext.includes('loadhash')) break;
			// remove this loadhash group
			actionGroups.splice(undoIndex, 1);
			indicesToRemove.push(...indicesNext);
		}

		// remove all log entries for these groups
		for (let i = 0; i < indicesToRemove.length; i++) logEntries.pop();

		// decrement moveCount if it wasn't a layer action
		const lastEntry = logEntries[indicesToRemove[0]];
		if (lastEntry && !lastEntry.startsWith('[newlayer')) {
			moveCount = Math.max(moveCount - 1, 0);
		}

		renderLog();
	}

	// call the original undo
	const result = original_undo.apply(this, arguments);

	// log any new changes produced by the undo (without adding to actionGroups)
	const newEntries = logNewChanges('undo', 'undo');
	// don't push undo changes into actionGroups
	addChangesLog('after undo', newEntries, 'undo');

	return result;
};

geo.loadhash = function() {
	clearLog();
	const result = original_loadhash.apply(this, arguments);
	const newEntries = logNewChanges('loadhash', 'loadhash');
	// push loadhash into actionGroups so it can be undone too
	actionGroups.push(addChangesLog('after loadhash', newEntries, 'loadhash'));
	return result;
};
