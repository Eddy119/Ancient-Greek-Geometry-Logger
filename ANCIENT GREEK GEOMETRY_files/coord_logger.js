// Geometry Logger using changes.record hook
// This version:
// - Hooks only into changes.record
// - Logs finalized entries from changes (arc, realline, newlayer)
// - Tracks layerCount, moveCount, and realmoveCount from modules.test.score()
// - Groups log entries per action so undo removes all entries from that action

'use strict';

// Cache DOM elements
const coordBar = document.getElementById('coordscroll');
const nukerBtn = document.getElementById('coordnuker');
let layerCount = 0;
let moveCount = 0;
let realmoveCount = 0; // updated via modules.test.score()
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
	return logEntries.length - 1; // return index
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

// Save original
const original_record = changes.record;

function logNewChanges(actionTag) {
	if (typeof changes === 'undefined') return [];
	let newEntries = [];
	for (let i = lastChangesLength; i < changes.length; i++) {
		const ch = changes[i];
		if (!ch) continue;
		let formatted = null;
		if (ch.type === 'arc') {
			formatted = `Arc ${ch.name}: Centre (${ch.obj?.centre?.x}, ${ch.obj?.centre?.y}), Edge (${ch.obj?.edge?.x}, ${ch.obj?.edge?.y}), r=${ch.obj?.radius}`;
		} else if (ch.type === 'realline') {
			formatted = `Line ${ch.name}: (${ch.obj?.point1?.x}, ${ch.obj?.point1?.y}) → (${ch.obj?.point2?.x}, ${ch.obj?.point2?.y})`;
		} else if (ch.type === 'newlayer') {
			layerCount += 1;
			formatted = `Layer ${layerCount}`;
		}
		if (formatted) {
			newEntries.push(addLog('[changes.record]', formatted, actionTag));
		}
	}
	lastChangesLength = changes.length;
	return newEntries;
}

changes.record = function(finished) {
	// Call original
	const result = original_record.apply(this, arguments);

	// Update realmoveCount from modules.test.score()
	realmoveCount = (typeof modules !== 'undefined' && modules.test && typeof modules.test.score === 'function')
		? modules.test.score()
		: realmoveCount;

	// Each record call = new actionTag
	const actionTag = actionGroups.length + 1;
	const indices = logNewChanges(actionTag);
	if (indices.length > 0) {
		actionGroups.push(indices);
		moveCount += 1;
	}

	return result;
};

// Hook reset and undo to clear/purge logs
const original_reset = geo.resetall;
geo.resetall = function() {
	clearLog();
	return original_reset.apply(this, arguments);
};

const original_undo = geo.undo;
geo.undo = function() {
	console.log('[undo hook]');

	if (actionGroups.length > 0) {
		const indices = actionGroups.pop();
		for (let i = 0; i < indices.length; i++) {
			logEntries.pop();
		}
		renderLog();
		moveCount = Math.max(moveCount - 1, 0);
	}

	const result = original_undo.apply(this, arguments);

	realmoveCount = (typeof modules !== 'undefined' && modules.test && typeof modules.test.score === 'function')
		? modules.test.score()
		: realmoveCount;

	return result;
};