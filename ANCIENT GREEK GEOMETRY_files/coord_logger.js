// Geometry Logger – two variants (choose via USE_JUMPS flag)
//
// Variant A: uses changes.jumps to group finalized actions.
// Variant B: uses lastChangesLength (raw scan) to log new entries after each record.
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
let lastChangesLength = 0;
let lastProcessedJump = 0;

// === toggle between implementations ===
const USE_JUMPS = true; // set true for jumps version, false for lastChangesLength version

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
	footerDiv.textContent = `changes.len=${changes?.length ?? '??'} | jumps=${jumpsLen} [${jumpsTail}] | lastJump=${lastProcessedJump} | real=${realmoveCount} | log=${logEntries.length}`;
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
	lastChangesLength = 0;
	lastProcessedJump = 0;
	if (coordBar) coordBar.innerHTML = '';
}

if (nukerBtn) nukerBtn.addEventListener('click', clearLog);

// formatting helper
function formatChange(ch) {
	if (!ch || !ch.type) return null;
	if (ch.type === 'line') return null; // skip plain line types
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
		return `Action ${actionCount}: Arc ${hash}${name ? ` (${name})` : ''} — centre ${cx},${cy} | edge ${ex},${ey} | r=${r} [#${entrySerial+1}, real ${rm}]`;
	} else if (ch.type === 'realline') {
		const x1 = ch.obj?.point1?.x ?? '??';
		const y1 = ch.obj?.point1?.y ?? '??';
		const x2 = ch.obj?.point2?.x ?? '??';
		const y2 = ch.obj?.point2?.y ?? '??';
		const angle = typeof ch.obj?.angle !== 'undefined' ? ch.obj.angle : '??';
		const len = typeof ch.obj?.length !== 'undefined' ? ch.obj.length : '??';
		return `Action ${actionCount}: Line ${hash}${name ? ` (${name})` : ''} — ${x1},${y1} → ${x2},${y2} | angle=${angle} | len=${len} [#${entrySerial+1}, real ${rm}]`;
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

	if (USE_JUMPS) {
		if (changes && changes.jumps && changes.jumps.length > 1) {
			const currentLastJump = changes.jumps.length - 1;

			// trim entries to sync with engine
			logEntries = logEntries.filter((_, i) => logEntryChangeIndex[i] < changes.length);
			logEntryChangeIndex = logEntryChangeIndex.filter(idx => idx < changes.length);
			entrySerial = logEntries.length;

			for (let j = Math.max(1, lastProcessedJump + 1); j <= currentLastJump; j++) {
				actionCount++;
				for (let k = changes.jumps[j-1]; k < changes.jumps[j]; k++) {
					const formatted = formatChange(changes[k]);
					if (formatted) {
						logEntries.push(formatted);
						logEntryChangeIndex.push(k);
						entrySerial = logEntries.length;
					}
				}
			}
			lastProcessedJump = currentLastJump;
		}
	} else {
		// trim entries to sync with engine
		logEntries = logEntries.filter((_, i) => logEntryChangeIndex[i] < changes.length);
		logEntryChangeIndex = logEntryChangeIndex.filter(idx => idx < changes.length);
		entrySerial = logEntries.length;

		let actionId = 0;
		for (let i = lastChangesLength; i < changes.length; i++) {
			actionCount++;
			const formatted = formatChange(changes[i]);
			if (formatted) {
				logEntries.push(formatted);
				logEntryChangeIndex.push(i);
				entrySerial = logEntries.length;
			}
		}
		lastChangesLength = changes.length;
		lastProcessedJump++;
	}

	renderLog();
	return result;
};

if (typeof changes.replay === 'function') {
	changes.replay = function() {
		clearLog();
		const res = original_replay.apply(this, arguments);
		lastChangesLength = 0;
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
