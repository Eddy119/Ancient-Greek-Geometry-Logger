// Geometry Logger with symbolic groundwork
// - Logs arcs/lines/layers with dependency map
// - Tracks user lines separately
// - Begins symbolic logging: seed symbolic points, print symbolic coords alongside numeric

'use strict';

const coordBar = document.getElementById('coordscroll');
const nukerBtn = document.getElementById('coordnuker');

let logEntries = [];
let logEntryChangeIndex = []; // stores actionId for engine entries
let entrySerial = 0;
let actionCount = 0; // user-facing action id (derived from jumps)
let realmoveCount = 0;
let lastProcessedJump = 0;

// user-drawn line tracking
let userLines = [];           // committed user lines
let userLinesPending = [];    // pending user lines (awaiting next changes.record)
let userLineSerial = 0;       // monotonic id for user lines

// dependency tracking
let dependencyMap = {};

// symbolic points dictionary (user can seed known exact points here)
let symbolicPoints = {
	0: { x: '0', y: '0' },
	1: { x: '1', y: '0' },
	2: { x: '0', y: '1' }
};

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

function ensureSymbolicPoint(id) {
	if (typeof id === 'undefined' || id === null) return;
	if (symbolicPoints[id]) return;
	// Prefer to seed from known exact points if you extend this later.
	// For now create a placeholder symbolic name like p{id}.
	symbolicPoints[id] = { x: `p${id}`, y: `p${id}` };
}

function renderDependencyMap() {
	const div = document.createElement('div');
	div.style.marginTop = '8px';
	div.style.fontSize = '11px';
	document.createTextNode('');
	const title = document.createElement('div');
	title.textContent = 'Dependencies (hash → depends)';
	title.style.fontWeight = '600';
	div.appendChild(title);
	for (let k of Object.keys(dependencyMap)) {
		const info = dependencyMap[k];
		const li = document.createElement('div');
		li.textContent = `${k} → ${info.type} : ${JSON.stringify(info.depends)}`;
		li.style.fontSize = '11px';
		div.appendChild(li);
	}
	return div;
}

function renderLog() {
	if (!coordBar) return;
	coordBar.innerHTML = '';

	// Merge engine + userLines by actionId
	let merged = [];
	for (let i = 0; i < logEntries.length; i++) {
		merged.push({ type: 'engine', text: logEntries[i], actionId: logEntryChangeIndex[i], _order: i });
	}

	// we keep userLines hidden in the UI by default; they remain available in userLines[].
	// Hide userLines from log but keep this for debugging later, DO NOT REMOVE.
	// for (let i = 0; i < userLines.length; i++) {
	// 	const ul = userLines[i];
	// 	merged.push({ type: 'user', text: `UserLine ${ul.id}: ${ul.p1.x},${ul.p1.y} → ${ul.p2.x},${ul.p2.y} [user, action ${ul.actionId}]`, actionId: ul.actionId, _order: -1 });
	// }

	// sort purely by actionId and order
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

	// append dependency map for debugging
	const depDiv = renderDependencyMap();
	coordBar.appendChild(depDiv);

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
	dependencyMap = {};
	// reset symbolic seeds but keep extensibility
	symbolicPoints = { 0: { x: '0', y: '0' }, 1: { x: '1', y: '0' }, 2: { x: '0', y: '1' } };
	if (coordBar) coordBar.innerHTML = '';
}

if (nukerBtn) nukerBtn.addEventListener('click', clearLog);

function addDependency(hash, info) {
	dependencyMap[hash] = info;
}

// formatting helper
function formatChange(ch, actionId) {
	if (!ch || !ch.type) return null;
	if (ch.type === 'line') return null; // skip raw split 'line' entries
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
		addDependency(hash, { type: 'arc', depends: [a, b], obj: ch.obj, actionId }); // arc defined by points a, b
		// ensure placeholders exist for a/b (centres/edges)
		ensureSymbolicPoint(a);
		ensureSymbolicPoint(b);
		let symCentre = symbolicPoints[a] ? `(${symbolicPoints[a].x}, ${symbolicPoints[a].y})` : '';
		let symEdge = symbolicPoints[b] ? `(${symbolicPoints[b].x}, ${symbolicPoints[b].y})` : '';
		return `Action ${actionId}: Arc ${hash} — centre ${cx},${cy}${symCentre ? ' ~ ' + symCentre : ''} | edge ${ex},${ey}${symEdge ? ' ~ ' + symEdge : ''} | r=${r} [#${entrySerial+1}, move ${rm}]`;
	} else if (ch.type === 'realline') {
		const hash2 = `${a}L${b}`;
		const currentHash = window.location.hash || '';
		// hide split/generated lines that don't appear in the page hash
		if (!currentHash.includes(hash2)) return null;
		// lookup true endpoints from global points table
		const pa = window.points?.[a];
		const pb = window.points?.[b];
		let xa = pa?.x ?? '??', ya = pa?.y ?? '??';
		let xb = pb?.x ?? '??', yb = pb?.y ?? '??';
		// const x1 = ch.obj?.point1?.x ?? '??'; // these 4 print weird
		const angle = typeof ch.obj?.angle !== 'undefined' ? ch.obj.angle : '??';
		const len = typeof ch.obj?.length !== 'undefined' ? ch.obj.length : '??';
		addDependency(hash2, { type: 'line', depends: [a, b], obj: ch.obj, actionId }); // line defined by points a, b
		// ensure symbolic placeholders
		ensureSymbolicPoint(a);
		ensureSymbolicPoint(b);
		let symA = symbolicPoints[a] ? `(${symbolicPoints[a].x}, ${symbolicPoints[a].y})` : '';
		let symB = symbolicPoints[b] ? `(${symbolicPoints[b].x}, ${symbolicPoints[b].y})` : '';
		// return `Action ${actionId}: Line ${hash} — ${x1},${y1} → ${x2},${y2} | angle=${angle} | len=${len} [#${entrySerial+1}, real ${rm}], pa: ${xa},${ya} → pb: ${xb},${yb}`;
		return `Action ${actionId}: Line ${hash2} — ${xa},${ya}${symA ? ' ~ ' + symA : ''} → ${xb},${yb}${symB ? ' ~ ' + symB : ''} | angle=${angle} | len=${len} [#${entrySerial+1}, move ${rm}]`;
	} else if (ch.type === 'newlayer') {
		addDependency(`LAYER${actionId}`, { type: 'layer', depends: [], actionId });
		return `Action ${actionId}: NewLayer [#${entrySerial+1}, move ${rm}]`;
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

// --- changes.record wrapper ---
changes.record = function(finished) {
	const result = original_record.apply(this, arguments);
	realmoveCount = (typeof modules !== 'undefined' && modules.test && typeof modules.test.score === 'function') ? modules.test.score() : realmoveCount;

	if (changes && changes.jumps && changes.jumps.length > 1) {
		const currentLastJump = changes.jumps.length - 1;

		// Rebuild logs fresh each time
		logEntries = [];
		logEntryChangeIndex = [];
		entrySerial = 0;

		for (let j = 1; j <= currentLastJump; j++) {
			const actionId = j - 1;

			// flush userLinesPending for this action (attach to this actionId)
			if (userLinesPending.length > 0) {
				for (let p of userLinesPending) {
					userLineSerial++;
					const ul = { id: userLineSerial, p1: p.p1, p2: p.p2, actionId };
					userLines.push(ul);
					// also add to dependencyMap as userLine (we don't need this)
					// addDependency(`UL${ul.id}`, { type: 'userLine', from: [ul.p1, ul.p2], actionId });
				}
				userLinesPending = [];
			}

			// engine entries
			for (let k = changes.jumps[j - 1]; k < changes.jumps[j]; k++) {
				const formatted = formatChange(changes[k], actionId);
				if (formatted) {
					logEntries.push(formatted);
					logEntryChangeIndex.push(actionId);
					entrySerial = logEntries.length;
				}
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
		realmoveCount = (typeof modules !== 'undefined' && modules.test && typeof modules.test.score === 'function') ? modules.test.score() : 0;
		renderLog();
		return res;
	};
}

// hook undo to remove userLines that belonged to removed actions
changes.undo = function() {
	const res = orig_undo.apply(this, arguments);
	if (!lastpoint) {
		const currentLastJump = (changes && changes.jumps && changes.jumps.length > 0) ? changes.jumps.length - 1 : 0;
		const removed = userLines.filter(ln => ln.actionId >= currentLastJump);
		if (removed.length > 0) {
			userLines = userLines.filter(ln => ln.actionId < currentLastJump);
			userLineSerial = userLines.length;
		}
		renderLog();
	}
	return res;
};

// Reset hook
const orig_reset = geo.resetall;
geo.resetall = function() {
	clearLog();
	return orig_reset.apply(this, arguments);
};

// End of logger
