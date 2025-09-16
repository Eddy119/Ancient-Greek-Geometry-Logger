// Geometry Logger – changes.record-driven with user-line tracking
// - Keeps separate userLines (unsplit user lines) logged inline
// - Groups actions (engine) and keeps userLines linked to the action they belong to
// - Robust undo/resync using dedicated actionCounter

'use strict';

const coordBar = document.getElementById('coordscroll');
const nukerBtn = document.getElementById('coordnuker');

let logEntries = [];
let logEntryChangeIndex = []; // stores actionId for engine entries
let entrySerial = 0;
let actionCounter = 0; // clean user-facing action counter
let realmoveCount = 0;
let lastProcessedJump = 0;

// user-drawn line tracking
let userLines = [];           // committed user lines
let userLinesPending = [];    // pending user lines (awaiting next changes.record)
let userLineSerial = 0;       // monotonic id for user lines (decremented when removed)

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
	footerDiv.textContent = `changes.len=${changes?.length ?? '??'} | jumps=${jumpsLen} [${jumpsTail}] | lastJump=${lastProcessedJump} | real=${realmoveCount} | log=${logEntries.length} | userLines=${userLines.length} | actionCounter=${actionCounter}`;
	if (!coordBar.contains(footerDiv)) coordBar.appendChild(footerDiv);
}

function renderLog() {
	if (!coordBar) return;
	coordBar.innerHTML = '';

	// Merge engine + userLines by actionId
	let merged = [];
	for (let i = 0; i < logEntries.length; i++) {
		merged.push({ type: 'engine', text: logEntries[i], actionId: logEntryChangeIndex[i], _order: i });
	}
	for (let i = 0; i < userLines.length; i++) {
		const ul = userLines[i];
		merged.push({ type: 'user', text: `UserLine ${ul.id}: ${ul.p1.x},${ul.p1.y} → ${ul.p2.x},${ul.p2.y} [user, action ${ul.actionId}]`, actionId: ul.actionId, _order: logEntries.length + i });
	}

	// sort by actionId, then by insertion order (_order)
	merged.sort((a, b) => {
		if (a.actionId !== b.actionId) return a.actionId - b.actionId;
		return a._order - b._order;
	});

	for (let entry of merged) {
		const div = document.createElement('div');
		div.textContent = entry.text;
		div.className = entry.type === 'engine' ? 'coord-entry engine' : 'coord-entry user';
		coordBar.appendChild(div);
	}

	coordBar.appendChild(footerDiv);
	updateFooter();
}

function clearLog() {
	logEntries = [];
	logEntryChangeIndex = [];
	entrySerial = 0;
	actionCounter = 0;
	realmoveCount = 0;
	lastProcessedJump = 0;
	userLines = [];
	userLinesPending = [];
	userLineSerial = 0;
	if (coordBar) coordBar.innerHTML = '';
}

if (nukerBtn) nukerBtn.addEventListener('click', clearLog);

// formatting helper
function formatChange(ch, actionId) {
	if (!ch || !ch.type) return null;
	if (ch.type === 'line') return null; // skip plain 'line' entries
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
		return `Action ${actionId}: Arc ${hash} — centre ${cx},${cy} | edge ${ex},${ey} | r=${r} [#${entrySerial+1}, real ${rm}]`;
	} else if (ch.type === 'realline') {
		const x1 = ch.obj?.point1?.x ?? '??';
		const y1 = ch.obj?.point1?.y ?? '??';
		const x2 = ch.obj?.point2?.x ?? '??';
		const y2 = ch.obj?.point2?.y ?? '??';
		const angle = typeof ch.obj?.angle !== 'undefined' ? ch.obj.angle : '??';
		const len = typeof ch.obj?.length !== 'undefined' ? ch.obj.length : '??';
		return `Action ${actionId}: Line ${hash} — ${x1},${y1} → ${x2},${y2} | angle=${angle} | len=${len} [#${entrySerial+1}, real ${rm}]`;
	} else if (ch.type === 'newlayer') {
		return `Action ${actionId}: NewLayer [#${entrySerial+1}, real ${rm}]`;
	}
	return null;
}

// Save original functions
const original_record = changes.record;
const original_replay = changes.replay;
const orig_makeline = window.makeline;
const orig_undo = changes.undo;

// hook makeline to queue userLines (capture user-intended unsplit line)
window.makeline = function(p1, p2) {
	const result = orig_makeline.apply(this, arguments);
	// store pending; will be assigned to the next action (changes.record)
	userLinesPending.push({ p1, p2 });
	return result;
};

// --- changes.record wrapper: processes new jumps and flushes pending user lines ---
changes.record = function(finished) {
	const result = original_record.apply(this, arguments);
	realmoveCount = (typeof modules !== 'undefined' && modules.test && typeof modules.test.score === 'function') ? modules.test.score() : realmoveCount;

	if (changes && changes.jumps && changes.jumps.length > 1) {
		const currentLastJump = changes.jumps.length - 1;

		for (let j = Math.max(1, lastProcessedJump + 1); j <= currentLastJump; j++) {
			actionCounter++; // bump once per new jump

			// push engine-formatted entries belonging to this action
			for (let k = changes.jumps[j - 1]; k < changes.jumps[j]; k++) {
				const formatted = formatChange(changes[k], actionCounter);
				if (formatted) {
					logEntries.push(formatted);
					logEntryChangeIndex.push(actionCounter);
					entrySerial = logEntries.length;
				}
			}

			// flush pending userLines for this action (commit them)
			if (userLinesPending.length > 0) {
				for (let p of userLinesPending) {
					userLineSerial++;
					const ul = {
						id: userLineSerial,
						p1: p.p1,
						p2: p.p2,
						actionId: actionCounter
					};
					userLines.push(ul);
				}
				userLinesPending = [];
			}
		}

		lastProcessedJump = currentLastJump;
		renderLog();
	}
	return result;
};

// wrap replay: clear logs and let engine rebuild, then resync
if (typeof changes.replay === 'function') {
	changes.replay = function() {
		clearLog();
		const res = original_replay.apply(this, arguments);
		lastProcessedJump = 0;
		actionCounter = 0;
		realmoveCount = (typeof modules !== 'undefined' && modules.test && typeof modules.test.score === 'function') ? modules.test.score() : 0;
		renderLog();
		return res;
	};
}

// hook undo to remove userLines and engine entries that belonged to removed actions
changes.undo = function() {
	if (!lastpoint) {
		actionCounter = Math.max(0, actionCounter - 1);
		userLines = userLines.filter(ln => ln.actionId <= actionCounter);
		userLineSerial = userLines.length;
		logEntries = logEntries.filter((_, i) => logEntryChangeIndex[i] <= actionCounter);
		logEntryChangeIndex = logEntryChangeIndex.filter(id => id <= actionCounter);
		entrySerial = logEntries.length;
		renderLog();
	}
	return orig_undo.apply(this, arguments);
};

// Reset hook
const orig_reset = geo.resetall;
geo.resetall = function() {
	clearLog();
	return orig_reset.apply(this, arguments);
};

// End of logger