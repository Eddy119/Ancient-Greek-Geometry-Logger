// Geometry Logger hooked into changes.record
// This version:
// - Hooks changes.record only (finalized moves)
// - Logs arcs, reallines, newlayers with details
// - Shows hash (a/b → e.g. 0A1)
// - Tracks layerCount, moveCount, realmoveCount
// - Undo clears last action group, Reset clears all

'use strict';

const coordBar = document.getElementById('coordscroll');
const nukerBtn = document.getElementById('coordnuker');
let layerCount = 0;
let moveCount = 0;
let realmoveCount = 0;
let logEntries = [];
let actionGroups = [];
let lastChangesLength = 0;

function renderLog() {
	if (!coordBar) return;
	coordBar.innerHTML = '';
	logEntries.forEach(entry => {
		const div = document.createElement('div');
		div.textContent = entry;
		div.className = 'coord-entry';
		coordBar.appendChild(div);
	});
}

function clearLog() {
	logEntries = [];
	actionGroups = [];
	layerCount = 0;
	moveCount = 0;
	realmoveCount = 0;
	lastChangesLength = 0;
	renderLog();
	console.log('Coordinate log cleared');
}

if (nukerBtn) {
	nukerBtn.addEventListener('click', clearLog);
}

// Save originals
const original_record = changes.record;
const original_reset = geo.resetall;
const original_undo = geo.undo;

function makeHash(a, b, type) {
	if (type === 'arc') return `${a}A${b}`;
	if (type === 'realline') return `${a}L${b}`;
	if (type === 'newlayer') return `Layer${layerCount}`;
	return `${a}?${b}`;
}

function addLog(entry) {
	logEntries.push(entry);
	renderLog();
	return logEntries.length - 1;
}

changes.record = function(finished) {
	// Call original first
	const result = original_record.apply(this, arguments);

	// Update real moves
	realmoveCount = (typeof modules !== 'undefined' && modules.test && typeof modules.test.score === 'function')
		? modules.test.score()
		: realmoveCount;

	// Capture new entries
	let newIndices = [];
	for (let i = lastChangesLength; i < changes.length; i++) {
		const ch = changes[i];
		if (!ch) continue;

		if (ch.type === 'arc') {
			const hash = makeHash(ch.a, ch.b, 'arc');
			const msg = `Arc ${hash}: Centre (${ch.obj?.centre?.x}, ${ch.obj?.centre?.y}), Edge (${ch.obj?.edge?.x}, ${ch.obj?.edge?.y}), r=${ch.obj?.radius}`;
			newIndices.push(addLog(`${msg} [real moves ${realmoveCount}]`));
		} else if (ch.type === 'realline') {
			const hash = makeHash(ch.a, ch.b, 'realline');
			const msg = `Line ${hash}: (${ch.obj?.point1?.x}, ${ch.obj?.point1?.y}) → (${ch.obj?.point2?.x}, ${ch.obj?.point2?.y}), angle=${ch.obj?.angle}, len=${ch.obj?.length}`;
			newIndices.push(addLog(`${msg} [real moves ${realmoveCount}]`));
		} else if (ch.type === 'newlayer') {
			layerCount += 1;
			const hash = makeHash(ch.a, ch.b, 'newlayer');
			const msg = `New Layer ${layerCount}`;
			newIndices.push(addLog(`${msg} [real moves ${realmoveCount}]`));
		}
	}

	if (newIndices.length > 0) {
		moveCount += 1;
		actionGroups.push(newIndices);
	}

	lastChangesLength = changes.length;
	return result;
};

geo.resetall = function() {
	clearLog();
	return original_reset.apply(this, arguments);
};

geo.undo = function() {
	if (actionGroups.length > 0) {
		const indices = actionGroups.pop();
		indices.sort((a, b) => b - a);
		for (let idx of indices) {
			logEntries.splice(idx, 1);
		}
		moveCount = Math.max(moveCount - 1, 0);
		renderLog();
	}
	return original_undo.apply(this, arguments);
};
