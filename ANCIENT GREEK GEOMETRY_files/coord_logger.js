// Geometry Logger – changes.record-driven with userline tracking
// - Keeps separate drawnLines (unsplit user lines) logged inline
// - Groups actions (engine+user) so undo removes whole action
// - actionCount is independent and increments per actionGroup

'use strict';

const coordBar = document.getElementById('coordscroll');
const nukerBtn = document.getElementById('coordnuker');

let logEntries = [];
let logEntryChangeIndex = []; // parallel array: engine change index or -1 for user lines
let entrySerial = 0;
let actionCount = 0; // increments per actionGroup
let realmoveCount = 0;
let lastProcessedJump = 0;

// user lines state
let drawnLines = [];
let userLineId = 0;
let pendingUserLogIndices = []; // indices of user log entries waiting to be grouped

// action groups: each is { count }
let actionGroups = [];

// --- footer element ---
let footerDiv = document.createElement('div');
footerDiv.id = 'coord-footer';
footerDiv.style.fontSize = '11px';
footerDiv.style.color = '#666';
footerDiv.style.marginTop = '6px';

function updateFooter() {
	if (!coordBar) return;
	let jumpsLen = changes && changes.jumps ? changes.jumps.length : 0;
	let jumpsTail = (changes && changes.jumps) ? changes.jumps.slice(-5).join(',') : '';
	footerDiv.textContent = `changes.len=${changes?.length ?? '??'} | jumps=${jumpsLen} [${jumpsTail}] | lastJump=${lastProcessedJump} | real=${realmoveCount} | log=${logEntries.length} | actions=${actionCount}`;
	if (!coordBar.contains(footerDiv)) coordBar.appendChild(footerDiv);
}

function renderLog() {
	if (!coordBar) return;
	coordBar.innerHTML = '';
	for (let i = 0; i < logEntries.length; i++) {
		const div = document.createElement('div');
		div.textContent = logEntries[i];
		div.className = 'coord-entry';
		coordBar.appendChild(div);
	}
	coordBar.appendChild(footerDiv);
	updateFooter();
}

function clearLog() {
	logEntries = [];
	logEntryChangeIndex = [];
	entrySerial = 0;
	actionCount = 0;
	realmoveCount = 0;
	lastProcessedJump = 0;
	drawnLines = [];
	userLineId = 0;
	pendingUserLogIndices = [];
	actionGroups = [];
	if (coordBar) coordBar.innerHTML = '';
}

if (nukerBtn) nukerBtn.addEventListener('click', clearLog);

// formatting helper
function formatChange(ch) {
	if (!ch || !ch.type) return null;
	if (ch.type === 'line') return null; // skip plain line types
	const rm = realmoveCount;
	let a = (typeof ch.a !== 'undefined') ? ch.a : (typeof ch.obj?.a !== 'undefined' ? ch.obj.a : '?');
	let b = (typeof ch.b !== 'undefined') ? ch.b : (typeof ch.obj?.b !== 'undefined' ? ch.obj.b : '?');
	let hash = (ch.type === 'arc') ? `${a}A${b}` : (ch.type === 'realline' ? `${a}L${b}` : `?`);

	if (ch.type === 'arc') {
		const cx = ch.obj?.centre?.x ?? '??';
		const cy = ch.obj?.centre?.y ?? '??';
		const ex = ch.obj?.edge?.x ?? '??';
		const ey = ch.obj?.edge?.y ?? '??';
		const r = typeof ch.obj?.radius !== 'undefined' ? ch.obj.radius : '??';
		return `Action ${actionCount}: Arc ${hash} — centre ${cx},${cy} | edge ${ex},${ey} | r=${r} [#${entrySerial+1}, real ${rm}]`;
	} else if (ch.type === 'realline') {
		const x1 = ch.obj?.point1?.x ?? '??';
		const y1 = ch.obj?.point1?.y ?? '??';
		const x2 = ch.obj?.point2?.x ?? '??';
		const y2 = ch.obj?.point2?.y ?? '??';
		const angle = typeof ch.obj?.angle !== 'undefined' ? ch.obj.angle : '??';
		const len = typeof ch.obj?.length !== 'undefined' ? ch.obj.length : '??';
		return `Action ${actionCount}: Line ${hash} — ${x1},${y1} → ${x2},${y2} | angle=${angle} | len=${len} [#${entrySerial+1}, real ${rm}]`;
	} else if (ch.type === 'newlayer') {
		return `Action ${actionCount}: NewLayer [#${entrySerial+1}, real ${rm}]`;
	}
	return null;
}

// Save original record & replay
const original_record = changes.record;
const original_replay = changes.replay;

// --- just let changes.record handle logging ---
changes.record = function(finished) {
	const result = original_record.apply(this, arguments);
	realmoveCount = (typeof modules !== 'undefined' && modules.test && typeof modules.test.score === 'function') ? modules.test.score() : realmoveCount;

	// If there are new jumps, process them and attach any pending userlines to the next jump(s)
	if (changes && changes.jumps && changes.jumps.length > 1) {
		const currentLastJump = changes.jumps.length - 1;

		for (let j = Math.max(1, lastProcessedJump + 1); j <= currentLastJump; j++) {
			let addedCount = 0;

			// First: include any pending userlines that were created since last record
			while (pendingUserLogIndices.length > 0) {
				// these entries are already present in logEntries; just count them as part of this action
				pendingUserLogIndices.shift();
				addedCount++;
			}

			// Then: add engine-finalized entries for this jump
			for (let k = changes.jumps[j - 1]; k < changes.jumps[j]; k++) {
				const formatted = formatChange(changes[k]);
				if (formatted) {
					logEntries.push(formatted);
					logEntryChangeIndex.push(k);
					entrySerial = logEntries.length;
					addedCount++;
				}
			}

			if (addedCount > 0) {
				actionGroups.push({ count: addedCount });
				actionCount++;
			}
		}

		lastProcessedJump = currentLastJump;
		renderLog();
		return result;
	}

	// Fallback: if there are pending userlines but no jumps produced (edge case), group them
	if (pendingUserLogIndices.length > 0) {
		const added = pendingUserLogIndices.length;
		pendingUserLogIndices = [];
		actionGroups.push({ count: added });
		actionCount++;
		renderLog();
	}

	return result;
};

if (typeof changes.replay === 'function') {
	changes.replay = function() {
		clearLog();
		const res = original_replay.apply(this, arguments);
		lastProcessedJump = 0;
		realmoveCount = (typeof modules !== 'undefined' && modules.test && typeof modules.test.score === 'function') ? modules.test.score() : 0;
		return res;
	};
}

// Reset hook
const orig_reset = geo.resetall;
geo.resetall = function() {
	clearLog();
	return orig_reset.apply(this, arguments);
};

// --- hook makeline for user lines ---
const original_makeline = window.makeline;
window.makeline = function(p1, p2) {
	const result = original_makeline.apply(this, arguments);
	const record = {
		id: ++userLineId,
		a: p1.id,
		b: p2.id,
		x1: p1.x, y1: p1.y,
		x2: p2.x, y2: p2.y
	};
	drawnLines.push(record);

	entrySerial = logEntries.length;
	const entry = `UserLine ${record.id}: ${record.x1},${record.y1} → ${record.x2},${record.y2} [user, #${entrySerial + 1}]`;
	logEntries.push(entry);
	logEntryChangeIndex.push(-1); // mark as user line
	pendingUserLogIndices.push(logEntries.length - 1);

	renderLog();
	return result;
};

// --- hook undo for grouped removal ---
const orig_undo = geo.undo;
geo.undo = function() {
	const res = orig_undo.apply(this, arguments);

	// If we have action groups, pop the last group's entries (engine+user)
	if (actionGroups.length > 0) {
		const grp = actionGroups.pop();
		for (let i = 0; i < grp.count; i++) {
			const removedIdx = logEntries.length - 1;
			const chIdx = logEntryChangeIndex.pop();
			logEntries.pop();
			if (chIdx === -1) {
				// removed a user line
				drawnLines.pop();
			}
		}
		actionCount = Math.max(actionCount - 1, 0);
		entrySerial = logEntries.length;
		renderLog();
		return res;
	}

	// If no action groups but pending userlines exist (edge case), remove them
	if (pendingUserLogIndices.length > 0) {
		while (pendingUserLogIndices.length > 0) {
			const idx = pendingUserLogIndices.pop();
			logEntries.splice(idx, 1);
			logEntryChangeIndex.splice(idx, 1);
			drawnLines.pop();
		}
		entrySerial = logEntries.length;
		renderLog();
	}

	return res;
};

// End of logger
