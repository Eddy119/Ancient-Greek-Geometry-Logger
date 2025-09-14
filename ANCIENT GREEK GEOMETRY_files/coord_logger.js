// Geometry Logger with direct hooks and changes inspection
// This version:
// - Logs directly from makeline/makearc/newlayer
// - Tracks layerCount and moveCount
// - Also prints entries from changes (arc, realline, newlayer) whenever makeline/makearc/newlayer fire
// - Prints labels so you know where the log came from

'use strict';

// Cache DOM elements
const coordBar = document.getElementById('coordscroll');
const nukerBtn = document.getElementById('coordnuker');
let layerCount = 0;
let moveCount = 0;
let logEntries = [];

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

function clearLog() {
	logEntries = [];
	layerCount = 0;
	moveCount = 0;
	renderLog();
	console.log('Coordinate log cleared');
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

window.makeline = function(p1, p2) {
	moveCount += 1;
	addLog(`[makeline hook] Move ${moveCount}`, `(${p1.x}, ${p1.y}) → (${p2.x}, ${p2.y})`);
	// also dump changes entries
	if (typeof changes !== 'undefined') {
		for (let i = 0; i < changes.length; i++) {
			const ch = changes[i];
			if (ch && (ch.type === 'arc' || ch.type === 'realline' || ch.type === 'newlayer')) {
				console.log('[changes after makeline]', i, ch);
			}
		}
	}
	return original_makeline.apply(this, arguments);
};

window.makearc = function(center, point) {
	moveCount += 1;
	addLog(`[makearc hook] Move ${moveCount}`, `Center (${center.x}, ${center.y}), Point (${point.x}, ${point.y})`);
	if (typeof changes !== 'undefined') {
		for (let i = 0; i < changes.length; i++) {
			const ch = changes[i];
			if (ch && (ch.type === 'arc' || ch.type === 'realline' || ch.type === 'newlayer')) {
				console.log('[changes after makearc]', i, ch);
			}
		}
	}
	return original_makearc.apply(this, arguments);
};

geo.newlayer = function() {
	layerCount += 1;
	addLog('[newlayer hook]', `Layer ${layerCount}`);
	if (typeof changes !== 'undefined') {
		for (let i = 0; i < changes.length; i++) {
			const ch = changes[i];
			if (ch && (ch.type === 'arc' || ch.type === 'realline' || ch.type === 'newlayer')) {
				console.log('[changes after newlayer]', i, ch);
			}
		}
	}
	return original_newlayer.apply(this, arguments);
};

geo.resetall = function() {
	clearLog();
	return original_reset.apply(this, arguments);
};

changes.undo = function() {
	console.log('[undo hook]');
	undoLog();
	return original_undo.apply(this, arguments);
};

geo.loadhash = function() {
	clearLog();
	const result = original_loadhash.apply(this, arguments);
	if (typeof changes !== 'undefined') {
		for (let i = 0; i < changes.length; i++) {
			const ch = changes[i];
			if (ch && (ch.type === 'arc' || ch.type === 'realline' || ch.type === 'newlayer')) {
				console.log('[changes after loadhash]', i, ch);
			}
		}
	}
	return result;
};

function undoLog() {
	const lastEntry = logEntries[logEntries.length - 1];
	if (typeof lastEntry !== 'undefined'&& lastEntry && lastEntry.startsWith('[newlayer')) {
		layerCount = Math.max(layerCount - 1, 0);
	}
	if (typeof lastEntry !== 'undefined' && lastEntry && lastEntry.includes('Move')) {
		moveCount = Math.max(moveCount - 1, 0);
	}
	logEntries.pop();
	renderLog();
}