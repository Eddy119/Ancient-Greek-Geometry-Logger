// Geometry Logger with symbolic groundwork
// - Logs arcs/lines/layers with dependency map
// - Begins symbolic logging: dependency tree for points + Line∩Line symbolic intersections

'use strict';

const coordBar = document.getElementById('coordscroll');
const nukerBtn = document.getElementById('coordnuker');

let logEntries = [];
let logEntryChangeIndex = []; // stores actionId for engine entries
let entrySerial = 0;
let actionCount = 0; // user-facing action id (derived from jumps)
let realmoveCount = 0;
let lastProcessedJump = 0;

// dependency tracking
let dependencyMap = {};

// symbolic points dictionary (seeded with known exact points)
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
	footerDiv.textContent = `changes.len=${changes?.length ?? '??'} | jumps=${jumpsLen} [${jumpsTail}] | lastJump=${lastProcessedJump} | real=${realmoveCount} | log=${logEntries.length}`;
	if (!coordBar.contains(footerDiv)) coordBar.appendChild(footerDiv);
}

function ensureSymbolicPoint(id) {
	if (typeof id === 'undefined' || id === null) return;
	if (symbolicPoints[id]) return;
	symbolicPoints[id] = { x: `p${id}x`, y: `p${id}y` };
}

function renderDependencyMap() {
	const div = document.createElement('div');
	div.style.marginTop = '8px';
	div.style.fontSize = '11px';
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

	for (let i = 0; i < logEntries.length; i++) {
		const div = document.createElement('div');
		div.textContent = logEntries[i];
		div.className = 'coord-entry engine';
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
	dependencyMap = {};
	symbolicPoints = { 0: { x: '0', y: '0' }, 1: { x: '1', y: '0' }, 2: { x: '0', y: '1' } };
	if (coordBar) coordBar.innerHTML = '';
}

if (nukerBtn) nukerBtn.addEventListener('click', clearLog);

function addDependency(hash, info) {
	dependencyMap[hash] = info;
}

// --- symbolic intersection helpers ---
function intersectLineLine(a, b, c, d) {
	// a,b,c,d are point objects with x,y numeric
	const x1 = a.x, y1 = a.y;
	const x2 = b.x, y2 = b.y;
	const x3 = c.x, y3 = c.y;
	const x4 = d.x, y4 = d.y;

	const D = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
	if (Math.abs(D) < 1e-9) return null; // parallel

	const numX = ((x1 * y2 - y1 * x2) * (x3 - x4)) - ((x1 - x2) * (x3 * y4 - y3 * x4));
	const numY = ((x1 * y2 - y1 * x2) * (y3 - y4)) - ((y1 - y2) * (x3 * y4 - y3 * x4));
	const x = numX / D;
	const y = numY / D;

	return { x, y, expr: `(${numX}/${D}, ${numY}/${D})` };
}

// formatting helper
function formatChange(ch, actionId) {
	if (!ch || !ch.type) return null;
	if (ch.type === 'line') return null;
	let a = (typeof ch.a !== 'undefined') ? ch.a : (typeof ch.obj?.a !== 'undefined' ? ch.obj.a : '?');
	let b = (typeof ch.b !== 'undefined') ? ch.b : (typeof ch.obj?.b !== 'undefined' ? ch.obj.b : '?');
	let hash = (ch.type === 'arc') ? `${a}A${b}` : (ch.type === 'realline' ? `${a}L${b}` : `?`);

	if (ch.type === 'arc') {
		const cx = ch.obj?.centre?.x ?? '??';
		const cy = ch.obj?.centre?.y ?? '??';
		const ex = ch.obj?.edge?.x ?? '??';
		const ey = ch.obj?.edge?.y ?? '??';
		const r = typeof ch.obj?.radius !== 'undefined' ? ch.obj.radius : '??';
		addDependency(hash, { type: 'arc', depends: [a, b], obj: ch.obj, actionId });
		ensureSymbolicPoint(a);
		ensureSymbolicPoint(b);
		return `Action ${actionId}: Arc ${hash} — centre ${cx},${cy} | edge ${ex},${ey} | r=${r} [#${entrySerial+1}, move ${realmoveCount}]`;
	} else if (ch.type === 'realline') {
		const hash2 = `${a}L${b}`;
		const currentHash = window.location.hash || '';
		if (!currentHash.includes(hash2)) return null;
		const pa = window.points?.[a];
		const pb = window.points?.[b];
		if (pa && pb) {
			// symbolic intersection stub: check if both points are already symbolic
			ensureSymbolicPoint(a);
			ensureSymbolicPoint(b);
		}
		addDependency(hash2, { type: 'line', depends: [a, b], obj: ch.obj, actionId });
		let xa = pa?.x ?? '??', ya = pa?.y ?? '??';
		let xb = pb?.x ?? '??', yb = pb?.y ?? '??';
		return `Action ${actionId}: Line ${hash2} — ${xa},${ya} → ${xb},${yb} [#${entrySerial+1}, move ${realmoveCount}]`;
	} else if (ch.type === 'newlayer') {
		addDependency(`LAYER${actionId}`, { type: 'layer', depends: [], actionId });
		return `Action ${actionId}: NewLayer [#${entrySerial+1}, move ${realmoveCount}]`;
	}
	return null;
}

// Save original functions
const original_record = changes.record;
const original_replay = changes.replay;
const orig_undo = changes.undo;

// --- changes.record wrapper ---
changes.record = function(finished) {
	const result = original_record.apply(this, arguments);
	realmoveCount = (typeof modules !== 'undefined' && modules.test && typeof modules.test.score === 'function') ? modules.test.score() : realmoveCount;

	if (changes && changes.jumps && changes.jumps.length > 1) {
		const currentLastJump = changes.jumps.length - 1;

		logEntries = [];
		logEntryChangeIndex = [];
		entrySerial = 0;

		for (let j = 1; j <= currentLastJump; j++) {
			const actionId = j - 1;
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

// wrap replay
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

// hook undo: just rebuild by replay
changes.undo = function() {
	const res = orig_undo.apply(this, arguments);
	renderLog();
	return res;
};

// Reset hook
const orig_reset = geo.resetall;
geo.resetall = function() {
	clearLog();
	return orig_reset.apply(this, arguments);
};

// End of logger
