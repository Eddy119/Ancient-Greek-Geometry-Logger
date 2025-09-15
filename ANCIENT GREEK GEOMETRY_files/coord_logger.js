// Geometry Logger using changes.jumps + changes.record
// - Hooks changes.record and changes.replay (if present)
// - Uses changes.jumps to process *each logical action* (jump) once
// - Formats and prints detailed fields (centre/edge/radius, point1/point2/angle/length, obj.name, a/b hash)
// - Maintains actionGroups keyed to jumpIndex and a per-entry serial id
// - Rebuilds the log after replay/undo/reset to keep counts consistent

'use strict';

const coordBar = document.getElementById('coordscroll');
const nukerBtn = document.getElementById('coordnuker');

let logEntries = [];            // array of formatted strings shown in the sidebar
let actionGroups = [];          // array of { jumpIndex, count }
let entrySerial = 0;            // increases for every logged entry (distinct from moveCount)
let realmoveCount = 0;          // authoritative modules.test.score()

// Helper: rebuild everything from changes.jumps (authoritative)
function rebuildFromJumps() {
	logEntries = [];
	actionGroups = [];
	entrySerial = 0;
	realmoveCount = (typeof modules !== 'undefined' && modules.test && typeof modules.test.score === 'function')
		? modules.test.score()
		: 0;

	if (!changes || !changes.jumps || changes.jumps.length < 2) {
		// Nothing to rebuild (no completed jumps)
		renderLog();
		return;
	}

	for (let j = 1; j < changes.jumps.length; j++) {
		const start = changes.jumps[j - 1];
		const end = changes.jumps[j];
		let countForThisJump = 0;
		for (let i = start; i < end; i++) {
			const ch = changes[i];
			const formatted = formatChange(ch, j);
			if (formatted) {
				logEntries.push(formatted);
				entrySerial += 1;
				countForThisJump++;
			}
		}
		if (countForThisJump > 0) {
			actionGroups.push({ jumpIndex: j, count: countForThisJump });
		}
	}
	renderLog();
}

// Format a changes[] entry into a readable string. Returns null if we skip it.
function formatChange(ch, actionId) {
	if (!ch || !ch.type) return null;
	// update realmoveCount precomputed elsewhere (we'll include current value here)
	const rm = realmoveCount;
	let name = ch.obj && ch.obj.name ? ch.obj.name : (ch.name || '');
	let a = (typeof ch.a !== 'undefined') ? ch.a : (typeof ch.obj?.a !== 'undefined' ? ch.obj.a : '?');
	let b = (typeof ch.b !== 'undefined') ? ch.b : (typeof ch.obj?.b !== 'undefined' ? ch.obj.b : '?');
	let hash = (ch.type === 'arc') ? `${a}A${b}` : (ch.type === 'realline' ? `${a}L${b}` : `?`);

	if (ch.type === 'arc') {
		const cx = ch.obj?.centre?.x ?? '??';
		const cy = ch.obj?.centre?.y ?? '??';
		const ex = ch.obj?.edge?.x ?? '??';
		const ey = ch.obj?.edge?.y ?? '??';
		const r = typeof ch.obj?.radius !== 'undefined' ? ch.obj.radius : '??';
		return `Action ${actionId} #${entrySerial+1}: Arc ${hash}${name ? ` (${name})` : ''} — centre ${cx},${cy} | edge ${ex},${ey} | r=${r} [real ${rm}]`;
	} else if (ch.type === 'realline' || ch.type === 'line') {
		const x1 = ch.obj?.point1?.x ?? '??';
		const y1 = ch.obj?.point1?.y ?? '??';
		const x2 = ch.obj?.point2?.x ?? '??';
		const y2 = ch.obj?.point2?.y ?? '??';
		const angle = typeof ch.obj?.angle !== 'undefined' ? ch.obj.angle : '??';
		const len = typeof ch.obj?.length !== 'undefined' ? ch.obj.length : '??';
		return `Action ${actionId} #${entrySerial+1}: Line ${hash}${name ? ` (${name})` : ''} — ${x1},${y1} → ${x2},${y2} | angle=${angle} | len=${len} [real ${rm}]`;
	} else if (ch.type === 'newlayer') {
		// We'll compute layerCount globally when rebuilding
		return `Action ${actionId} #${entrySerial+1}: NewLayer [real ${rm}]`;
	}
	// other types we skip for now
	return null;
}

// UI functions
function renderLog() {
	if (!coordBar) return;
	coordBar.innerHTML = '';
	for (let i = 0; i < logEntries.length; i++) {
		const div = document.createElement('div');
		div.textContent = logEntries[i];
		div.className = 'coord-entry';
		coordBar.appendChild(div);
	}
}

function clearLog() {
	logEntries = [];
	actionGroups = [];
	entrySerial = 0;
	realmoveCount = 0;
	lastProcessedJump = 0;
	if (coordBar) coordBar.innerHTML = '';
}

if (nukerBtn) nukerBtn.addEventListener('click', clearLog);

// Keep track of the last jump index we've processed
let lastProcessedJump = (changes && changes.jumps && changes.jumps.length > 0) ? changes.jumps.length - 1 : 0;

// Wrap changes.replay if available (used by localStorage loader)
if (typeof changes !== 'undefined' && typeof changes.replay === 'function') {
	const orig_replay = changes.replay;
	changes.replay = function() {
		clearLog();
		const res = orig_replay.apply(this, arguments);
		// ensure modules.score updated
		realmoveCount = (typeof modules !== 'undefined' && modules.test && typeof modules.test.score === 'function') ? modules.test.score() : realmoveCount;
		// rebuild from new jumps
		rebuildFromJumps();
		return res;
	};
}

// Wrap changes.record — the authoritative commit point
const original_record = changes.record;
changes.record = function(finished) {
	// Call original first (this may push a new entry into changes.jumps)
	const result = original_record.apply(this, arguments);

	// modules.test.score() becomes correct after record finishes
	realmoveCount = (typeof modules !== 'undefined' && modules.test && typeof modules.test.score === 'function') ? modules.test.score() : realmoveCount;

	// If we have jumps, process any new jumps since lastProcessedJump
	if (changes && changes.jumps && changes.jumps.length > 1) {
		const currentLastJump = changes.jumps.length - 1;
		for (let j = Math.max(1, lastProcessedJump + 1); j <= currentLastJump; j++) {
			const start = changes.jumps[j - 1];
			const end = changes.jumps[j];
			let added = 0;
			for (let k = start; k < end; k++) {
				const ch = changes[k];
				const formatted = formatChange(ch, j);
				if (formatted) {
					logEntries.push(formatted);
					entrySerial += 1;
					added += 1;
				}
			}
			if (added > 0) {
				actionGroups.push({ jumpIndex: j, count: added });
			}
		}
		lastProcessedJump = currentLastJump;
		// render after processing all new jumps
		renderLog();
		return result;
	}

	// Fallback: if no jumps available, process raw new changes since lastProcessedChange
	// (this keeps compatibility with older or unusual states)
	const startIdx = (typeof lastProcessedChangeIndex !== 'undefined') ? lastProcessedChangeIndex : 0;
	for (let i = startIdx; i < changes.length; i++) {
		const ch = changes[i];
		const formatted = formatChange(ch, lastProcessedJump + 1);
		if (formatted) {
			logEntries.push(formatted);
			entrySerial += 1;
			if (actionGroups.length === 0 || actionGroups[actionGroups.length-1].jumpIndex !== lastProcessedJump + 1) {
				actionGroups.push({ jumpIndex: lastProcessedJump + 1, count: 1 });
			} else {
				actionGroups[actionGroups.length-1].count += 1;
			}
		}
	}
	lastProcessedChangeIndex = changes.length;
	renderLog();
	return result;
};

// Rebuild on initialization if there are already jumps
try {
	if (typeof changes !== 'undefined' && changes.jumps && changes.jumps.length > 1) {
		realmoveCount = (typeof modules !== 'undefined' && modules.test && typeof modules.test.score === 'function') ? modules.test.score() : 0;
		rebuildFromJumps();
		lastProcessedJump = changes.jumps.length - 1;
	}
} catch (e) {
	console.warn('Logger init failed', e);
}

// When undo is called, let the engine do its thing, then resync the log to the current jumps
const orig_undo = geo.undo;
geo.undo = function() {
	const res = orig_undo.apply(this, arguments);
	// resync: rebuild entire log from jumps — safest and keeps counts consistent
	try {
		realmoveCount = (typeof modules !== 'undefined' && modules.test && typeof modules.test.score === 'function') ? modules.test.score() : realmoveCount;
		rebuildFromJumps();
		lastProcessedJump = changes.jumps ? changes.jumps.length - 1 : 0;
	} catch (e) {
		console.warn('Logger resync after undo failed', e);
	}
	return res;
};

// Reset hook: clear and let engine reset
const orig_resetall = geo.resetall;
geo.resetall = function() {
	const res = orig_resetall.apply(this, arguments);
	clearLog();
	return res;
};

// End of logger
