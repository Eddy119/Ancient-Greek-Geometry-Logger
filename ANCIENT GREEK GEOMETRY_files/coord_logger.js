'use strict';

// Cache DOM elements
const coordBar = document.getElementById('coordscroll');
const nukerBtn = document.getElementById('coordnuker');
let layerCount = 0;
let moveCount = 0;
let realmoveCount = 0; // updated after each action
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
	const formatted = `${label}: ${details} [action ${actionTag}] [real moves ${realmoveCount}]`;
	logEntries.push(formatted);
	renderLog();
	return logEntries.length - 1;
}

function addChangesLog(label, entries, actionTag) {
	if (entries.length === 0) return [];
	const combined = entries.map(e => JSON.stringify(e)).join(" | ");
	const formatted = `[changes ${label}] ${combined} [action ${actionTag}] [real moves ${realmoveCount}]`;
	logEntries.push(formatted);
	renderLog();
	return [logEntries.length - 1];
}

function clearLog() {
	logEntries = [];
	actionGroups = [];
	layerCount = 0;
	moveCount = 0;
	realmoveCount = 0;
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

// Hooks
window.makeline = function(p1, p2) {
	moveCount += 1;
	const actionTag = actionGroups.length + 1;
	let indices = [];

	// Call original first
	const result = original_makeline.apply(this, arguments);

	// Fetch real moves after execution
	realmoveCount = (typeof modules !== 'undefined' && modules.test && typeof modules.test.score === 'function') 
		? modules.test.score() 
		: realmoveCount;

	// Log entries
	indices.push(addLog(`[makeline hook] Move ${moveCount}`, `(${p1.x}, ${p1.y}) → (${p2.x}, ${p2.y})`, actionTag));
	indices = indices.concat(logNewChanges('makeline', actionTag));
	actionGroups.push(indices);

	return result;
};

window.makearc = function(center, point) {
	moveCount += 1;
	const actionTag = actionGroups.length + 1;
	let indices = [];

	const result = original_makearc.apply(this, arguments);

	realmoveCount = (typeof modules !== 'undefined' && modules.test && typeof modules.test.score === 'function') 
		? modules.test.score() 
		: realmoveCount;

	indices.push(addLog(`[makearc hook] Move ${moveCount}`, `Center (${center.x}, ${center.y}), Point (${point.x}, ${point.y})`, actionTag));
	indices = indices.concat(logNewChanges('makearc', actionTag));
	actionGroups.push(indices);

	return result;
};

geo.newlayer = function() {
	layerCount += 1;
	const actionTag = actionGroups.length + 1;
	let indices = [];

	const result = original_newlayer.apply(this, arguments);

	realmoveCount = (typeof modules !== 'undefined' && modules.test && typeof modules.test.score === 'function') 
		? modules.test.score() 
		: realmoveCount;

	indices.push(addLog('[newlayer hook]', `Layer ${layerCount}`, actionTag));
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

	let undoIndex = actionGroups.length - 1;
	while (undoIndex >= 0) {
		const indices = actionGroups[undoIndex];
		const firstEntry = logEntries[indices[0]] || "";
		if (!firstEntry.includes('loadhash')) break;
		undoIndex--;
	}

	if (undoIndex >= 0) {
		const indicesToRemove = actionGroups.splice(undoIndex, 1)[0];

		while (undoIndex < actionGroups.length) {
			const indicesNext = actionGroups[undoIndex];
			const firstEntryNext = logEntries[indicesNext[0]] || "";
			if (!firstEntryNext.includes('loadhash')) break;
			actionGroups.splice(undoIndex, 1);
			indicesToRemove.push(...indicesNext);
		}

		indicesToRemove.sort((a, b) => b - a);
		for (let i = 0; i < indicesToRemove.length; i++) {
			logEntries.splice(indicesToRemove[i], 1);
		}

		const lastEntry = logEntries[indicesToRemove[0]];
		if (lastEntry && !lastEntry.startsWith('[newlayer')) {
			moveCount = Math.max(moveCount - 1, 0);
		}

		renderLog();
	}

	const result = original_undo.apply(this, arguments);

	realmoveCount = (typeof modules !== 'undefined' && modules.test && typeof modules.test.score === 'function') 
		? modules.test.score() 
		: realmoveCount;

	const newEntries = logNewChanges('undo', 'undo');
	addChangesLog('after undo', newEntries, 'undo');

	return result;
};
