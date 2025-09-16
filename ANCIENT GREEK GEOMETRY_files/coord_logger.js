// Geometry Logger – two variants we'll probably use changes.jumps
//
// Variant A: uses changes.jumps to group finalized actions.
// Variant B: uses lastChangesLength (raw scan) to log new entries after each record. removed.
//
// Both share a debug footer printed at the bottom of coordscroll showing engine state.

'use strict';

const coordBar = document.getElementById('coordscroll');
const nukerBtn = document.getElementById('coordnuker');

let logEntries = [];
let logEntryChangeIndex = [];
let entrySerial = 0;
let actionCount = 0; // NEW independent action counter
let realmoveCount = 0;
let lastProcessedJump = 0;

// user-drawn line tracking
let userLines = [];
let userLinesPending = [];
let userLineSerial = 0;

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
	footerDiv.textContent = `changes.len=${changes?.length ?? '??'} | jumps=${jumpsLen} [${jumpsTail}] | lastJump=${lastProcessedJump} | real=${realmoveCount} | log=${logEntries.length} | userLines=${userLines.length}`;
	if (!coordBar.contains(footerDiv)) coordBar.appendChild(footerDiv);
}

function renderLog() {
	if (!coordBar) return;
	coordBar.innerHTML = '';

	// Engine entries
	for (let i = 0; i < logEntries.length; i++) {
		const div = document.createElement('div');
		div.textContent = logEntries[i];
		div.className = 'coord-entry engine';
		coordBar.appendChild(div);
	}

	// UserLine entries
	for (let i = 0; i < userLines.length; i++) {
		const ul = userLines[i];
		const div = document.createElement('div');
		div.textContent = `UserLine ${ul.id}: ${ul.p1.x},${ul.p1.y} → ${ul.p2.x},${ul.p2.y} [user, action ${ul.actionId}]`;
		div.className = 'coord-entry user';
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
	userLines = [];
	userLinesPending = [];
	userLineSerial = 0;
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
const orig_makeline = window.makeline;
const orig_undo = geo.undo;

// hook makeline to queue userLines
window.makeline = function(p1, p2) {
	const result = orig_makeline.apply(this, arguments);
	userLinesPending.push({ p1, p2 });
	return result;
};

// --- just let changes.record handle logging ---
changes.record = function(finished) {
	const result = original_record.apply(this, arguments);
	realmoveCount = (typeof modules !== 'undefined' && modules.test && typeof modules.test.score === 'function') ? modules.test.score() : realmoveCount;

	if (changes && changes.jumps && changes.jumps.length > 1) {
		const currentLastJump = changes.jumps.length - 1;

		// trim entries to sync with engine
		logEntries = logEntries.filter((_, i) => logEntryChangeIndex[i] < changes.length);
		logEntryChangeIndex = logEntryChangeIndex.filter(idx => idx < changes.length);
		entrySerial = logEntries.length;

		for (let j = Math.max(1, lastProcessedJump + 1); j <= currentLastJump; j++) {
			for (let k = changes.jumps[j-1]; k < changes.jumps[j]; k++) {
				actionCount = j - 1; // fudge factor
				const formatted = formatChange(changes[k]);
				if (formatted) {
					logEntries.push(formatted);
					logEntryChangeIndex.push(k); // track source
					entrySerial = logEntries.length;
				}
			}

			// flush pending userLines for this action
			if (userLinesPending.length > 0) {
				for (let p of userLinesPending) {
					userLineSerial++;
					const ul = {
						id: userLineSerial,
						serial: userLineSerial,
						p1: p.p1,
						p2: p.p2,
						actionId: actionCount
					};
					userLines.push(ul);
				}
				userLinesPending = [];
			}
		}
		lastProcessedJump = currentLastJump;

		renderLog();
		return result;
	}
};

if (typeof changes.replay === 'function') {
	changes.replay = function() {
		clearLog();
		const res = original_replay.apply(this, arguments);
		lastProcessedJump = 0;
		realmoveCount = (typeof modules !== 'undefined' && modules.test && typeof modules.test.score === 'function') ? modules.test.score() : 0;
		renderLog();
		return res;
	};
}

// hook undo to also remove userLines
geo.undo = function() {
	const result = orig_undo.apply(this, arguments);

	if (userLines.length > 0) {
		// Remove all userLines from the last action
		const lastActionId = Math.max(...userLines.map(ln => ln.actionId));
		const removed = userLines.filter(ln => ln.actionId === lastActionId);
		userLines = userLines.filter(ln => ln.actionId < lastActionId);
		// decrement serial by number removed
		userLineSerial -= removed.length;
		if (userLineSerial < 0) userLineSerial = 0;
	}

	renderLog();
	return result;
};


// Reset hook
const orig_reset = geo.resetall;
geo.resetall = function() {
	clearLog();
	return orig_reset.apply(this, arguments);
};
