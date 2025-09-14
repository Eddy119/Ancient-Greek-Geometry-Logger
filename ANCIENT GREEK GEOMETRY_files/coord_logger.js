// Geometry Logger with direct hooks and changes inspection
// This version:
// - Logs directly from makeline/makearc/newlayer
// - Tracks layerCount and moveCount
// - Prints *new entries* from changes (arc, realline, newlayer) whenever makeline/makearc/newlayer fire
// - Prints labels so you know where the log came from
// - Also appends changes entries to coordbar as coord-entries (concat string per move)

'use strict';

// Cache DOM elements
const coordBar = document.getElementById('coordscroll');
const nukerBtn = document.getElementById('coordnuker');
let layerCount = 0;
let moveCount = 0;
let logEntries = [];
let lastChangesLength = 0; // track processed changes

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

function addLog(label, details) {
	const formatted = `${label}: ${details}`;
	logEntries.push(formatted);
	renderLog();
}

function addChangesLog(label, entries) {
	if (entries.length === 0) return;
	const combined = entries.map(e => JSON.stringify(e)).join(" | ");
	const formatted = `[changes ${label}] ${combined}`;
	logEntries.push(formatted);
	renderLog();
}

function clearLog() {
	logEntries = [];
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
const original_undo = changes.undo;
const original_loadhash = geo.loadhash;

function logNewChanges(label) {
	if (typeof changes === 'undefined') return [];
	let newEntries = [];
	for (let i = lastChangesLength; i < changes.length; i++) {
		const ch = changes[i];
		if (ch && (ch.type === 'arc' || ch.type === 'realline' || ch.type === 'newlayer')) {
			console.log(`[changes new after ${label}]`, i, ch);
			newEntries.push(ch);
		}
	}
	lastChangesLength = changes.length;
	return newEntries;
}

window.makeline = function(p1, p2) {
	moveCount += 1;
	addLog(`[makeline hook] Move ${moveCount}`, `(${p1.x}, ${p1.y}) → (${p2.x}, ${p2.y})`);
	const result = original_makeline.apply(this, arguments);
	const newEntries = logNewChanges('makeline');
	addChangesLog('after makeline', newEntries);
	return result;
};

window.makearc = function(center, point) {
	moveCount += 1;
	addLog(`[makearc hook] Move ${moveCount}`, `Center (${center.x}, ${center.y}), Point (${point.x}, ${point.y})`);
	const result = original_makearc.apply(this, arguments);
	const newEntries = logNewChanges('makearc');
	addChangesLog('after makearc', newEntries);
	return result;
};

geo.newlayer = function() {
	layerCount += 1;
	addLog('[newlayer hook]', `Layer ${layerCount}`);
	const result = original_newlayer.apply(this, arguments);
	const newEntries = logNewChanges('newlayer');
	addChangesLog('after newlayer', newEntries);
	return result;
};

geo.resetall = function() {
	clearLog();
	return original_reset.apply(this, arguments);
};

changes.undo = function() {
	console.log('[undo hook]');
    undoLog();
	const result = original_undo.apply(this, arguments);
	const newEntries = logNewChanges('undo');
	addChangesLog('after undo', newEntries);
	return result;
};

geo.loadhash = function() {
	clearLog();
	const result = original_loadhash.apply(this, arguments);
	const newEntries = logNewChanges('loadhash');
	addChangesLog('after loadhash', newEntries);
	return result;
};

function undoLog() {
	const lastEntry = logEntries[logEntries.length - 1];
	if (lastEntry && lastEntry.startsWith('[newlayer')) {
		layerCount = Math.max(layerCount - 1, 0);
	}
	if (lastEntry && lastEntry.includes('Move')) {
		moveCount = Math.max(moveCount - 1, 0);
	}
	logEntries.pop();
	renderLog();
}