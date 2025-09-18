// Geometry Logger with symbolic groundwork (algebraic)
// - Logs arcs/lines/layers with dependency map
// - Tracks symbolic points and dependencies
// - Symbolic logging: line-line, arc-line, arc-arc intersections

'use strict';

const coordBar = document.getElementById('coordscroll');
const nukerBtn = document.getElementById('coordnuker');

let logEntries = [];
let logEntryChangeIndex = []; // stores actionId for engine entries
let entrySerial = 0;
let realmoveCount = 0;
let lastProcessedJump = 0;

// dependency tracking
let dependencyMap = {};
let pointDependencies = {}; // map pointId → description of how it was created

// symbolic points dictionary (user can seed known exact points here)
let symbolicPoints = {
	0: { x: '0', y: '0' },
	1: { x: '1', y: '0' } // p0p1 = 1 (unit length)
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

function addDependency(hash, info) {
	dependencyMap[hash] = info;
}

function addPointDependency(pid, desc, expr, ch = null, ptObj = null) {
	pointDependencies[pid] = { desc, expr, change: ch, point: ptObj };
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
	const ptTitle = document.createElement('div');
	ptTitle.textContent = 'Point Dependencies';
	ptTitle.style.fontWeight = '600';
	ptTitle.style.marginTop = '6px';
	div.appendChild(ptTitle);
	for (let pid of Object.keys(pointDependencies)) {
		const info = pointDependencies[pid];
		const li = document.createElement('div');
		li.textContent = `p${pid} = ${info.desc} ~ ${JSON.stringify(info.expr)}`;
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
	// coordBar.appendChild(renderDependencyMap()); // obnoxious, will add later
	coordBar.appendChild(footerDiv);
	updateFooter();
}

function clearLog() {
	logEntries = [];
	logEntryChangeIndex = [];
	entrySerial = 0;
	realmoveCount = 0;
	lastProcessedJump = 0;
	dependencyMap = {};
	pointDependencies = {};
	symbolicPoints = { 0: { x: '0', y: '0' }, 1: { x: '1', y: '0' } };
	if (coordBar) coordBar.innerHTML = '';
}

if (nukerBtn) nukerBtn.addEventListener('click', clearLog);

// --- Intersections ---   these 3 need symbolic formulae to print and input to nerdamer
// also think about when 2 points are created geo.js calculates order deterministically, can copy that logic
function intersectLineLine(pid, a, b, c, d) {
	// ensure input points exist in dictionary
	ensureSymbolicPoint(a);
	ensureSymbolicPoint(b);
	ensureSymbolicPoint(c);
	ensureSymbolicPoint(d);
	const expr = { x: `(det(p${a},p${b},p${c},p${d}))x`, y: `(det(p${a},p${b},p${c},p${d}))y` };
	addPointDependency(pid, `Intersection of line(${a},${b}) and line(${c},${d})`, expr, null, window.points[pid]);
	return expr;
}

function intersectArcLine(pid, a, b, c, d) {
	ensureSymbolicPoint(a);
	ensureSymbolicPoint(b);
	ensureSymbolicPoint(c);
	ensureSymbolicPoint(d);
	const expr = { x: `(arc(${a},${b})∩line(${c},${d}))x`, y: `(arc(${a},${b})∩line(${c},${d}))y` };
	addPointDependency(pid, `Intersection of arc(${a},${b}) and line(${c},${d})`, expr, null, window.points[pid]);
	return expr;
}

function intersectArcArc(pid, a, b, c, d) {
	ensureSymbolicPoint(a);
	ensureSymbolicPoint(b);
	ensureSymbolicPoint(c);
	ensureSymbolicPoint(d);
	const expr = { x: `(arc(${a},${b})∩arc(${c},${d}))x`, y: `(arc(${a},${b})∩arc(${c},${d}))y` };
	addPointDependency(pid, `Intersection of arc(${a},${b}) and arc(${c},${d})`, expr, null, window.points[pid]);
	return expr;
}

// formatting helper
function formatChange(ch, actionId) {
	if (!ch || !ch.type) return null;
	if (ch.type === 'line') return null;
	let a = (typeof ch.a !== 'undefined') ? ch.a : (typeof ch.obj?.a !== 'undefined' ? ch.obj.a : '?');
	let b = (typeof ch.b !== 'undefined') ? ch.b : (typeof ch.obj?.b !== 'undefined' ? ch.obj.b : '?');
	let hash = (ch.type === 'arc') ? `${a}A${b}` : (ch.type === 'realline' ? `${a}L${b}` : `?`);

	if (ch.type === 'arc') {
		addDependency(hash, { type: 'arc', depends: [a, b], obj: ch.obj, actionId });
		ensureSymbolicPoint(a);
		ensureSymbolicPoint(b);
		return `Action ${actionId}: Arc ${hash} — center p${a}, radius |p${a}p${b}|`;
	} else if (ch.type === 'realline') {
		const hash2 = `${a}L${b}`;
		const currentHash = window.location.hash || '';
		if (!currentHash.includes(hash2)) return null;
		addDependency(hash2, { type: 'line', depends: [a, b], obj: ch.obj, actionId });
		ensureSymbolicPoint(a);
		ensureSymbolicPoint(b);
		let logStr = `Action ${actionId}: Line ${hash2} — |p${a}p${b}|`;
		// intersections
		const intersections = [];
		for (let pid in window.points) {
			const pt = window.points[pid];
			if (!pt) continue;
			const pointChanges = changes.filter(c => c.type === 'point' && c.x === pt.x && c.y === pt.y);
			if (pointChanges.length) {
				// I don't think pt.parents exists
				const parents = (pt.parents || []);
				if (parents.includes(hash2)) {
					let expr;
					if (parents.some(p => p.includes('L')) && parents.length === 2) {
						const [c, d] = dependencyMap[parents.find(p => p !== hash2)].depends;
						expr = intersectLineLine(pid, a, b, c, d);
					} else if (parents.some(p => p.includes('A'))) {
						const arcHash = parents.find(p => p.includes('A'));
						const [c, d] = dependencyMap[arcHash].depends;
						expr = intersectArcLine(pid, c, d, a, b);
					}
					if (expr) {
						addPointDependency(pid, `${hash2} ∩ ${parents.find(p => p!==hash2)}`, expr, pointChanges[0], pt);
						intersections.push(`p${pid} = ${hash2} ∩ ${parents.find(p => p!==hash2)} = ${expr.x},${expr.y}`);
					}
				}
			}
		}
		if (intersections.length > 0) {
			logStr += ` | Intersections:\n  ` + intersections.join('\n  ');
		}
		return logStr;
	} else if (ch.type === 'newlayer') {
		addDependency(`LAYER${actionId}`, { type: 'layer', depends: [], actionId });
		return `Action ${actionId}: NewLayer`;
	}
	return null;
}

// Save original functions
// const original_record = changes.record;
const original_replay = changes.replay;
const orig_undo = changes.undo;
const orig_reset = geo.resetall;

const orig_makeline = window.makeline;
window.makeline = function (point1, point2, spec) {
	const res = orig_makeline.apply(this, arguments);
	addLog();
	return res;
};

const orig_makearc = window.makearc;
window.makearc = function (centre, edge, radius, spec) {
	const res = orig_makearc.apply(this, arguments);
	addLog();
	return res;
};

const orig_redo = changes.redo;
changes.redo = function () {
    const res = orig_redo.apply(this, arguments); // original function runs first
    addLog();
    return res;
};

function addLog() {
	realmoveCount = (typeof modules !== 'undefined' && modules.test && typeof modules.test.score === 'function') ? modules.test.score() : realmoveCount;
	if (changes.jumps.length >= 2) {
		const currentLastJump = changes.jumps.length - 1;
		logEntries = [];
		logEntryChangeIndex = [];
		entrySerial = 0;
		dependencyMap = {};
		pointDependencies = {};

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
}

// wrap replay: this calls when loadhash or sidebar load
if (typeof changes.replay === 'function') {
	changes.replay = function() {
		clearLog();
		lastProcessedJump = 0;
		const res = original_replay.apply(this, arguments);
		addLog();
		realmoveCount = (typeof modules !== 'undefined' && modules.test && typeof modules.test.score === 'function') ? modules.test.score() : 0;
		return res;
	};
}

changes.undo = function() {
	const res = orig_undo.apply(this, arguments);
	if (!lastpoint) {
		logEntries = [];
		logEntryChangeIndex = [];
		entrySerial = 0;
		dependencyMap = {};
		pointDependencies = {};
		if (changes.jumps.length >= 2) {
			addLog();
		}
	}
	return res;
};

geo.resetall = function() {
	clearLog();
	return orig_reset.apply(this, arguments);
};

// --- new helpers for detecting intersections via engine-created points ---

function snapshotPointIds() {
	return new Set(Object.keys(window.points || {}).map(k => String(k)));
}

function pointCoords(pid) {
	const pt = window.points && window.points[pid];
	if (!pt) return null;
	return { x: Number(pt.x), y: Number(pt.y) };
}

function dist(p, q) {
	return Math.hypot(p.x - q.x, p.y - q.y);
}

// engine-created points are probably identical to window.points so tolerance is prob unneccessary
function pointOnLine(pid, a, b, tol = 1e-6) {
	const P = pointCoords(pid);
	const A = pointCoords(a);
	const B = pointCoords(b);
	if (!P || !A || !B) return false;
	// distance from P to line AB (infinite line)
	const ABx = B.x - A.x;
	const ABy = B.y - A.y;
	const num = Math.abs(ABx * (A.y - P.y) - ABy * (A.x - P.x));
	const den = Math.hypot(ABx, ABy);
	if (den < 1e-12) return false;
	const d = num / den;
	return d <= tol;
}

function pointOnArc(pid, centerId, edgeId, tol = 1e-6) {
	const P = pointCoords(pid);
	const C = pointCoords(centerId);
	const E = pointCoords(edgeId);
	if (!P || !C || !E) return false;
	const r = dist(C, E);
	const d = dist(C, P);
	return Math.abs(d - r) <= Math.max(1e-6, Math.abs(r) * 1e-6);
}

function describeIntersectionFromObjects(pid, objects) {
	// objects is array of hashes like '0L2' or '1A0'
	// try every pair to see which two contain this point
	for (let i = 0; i < objects.length; i++) {
		for (let j = i + 1; j < objects.length; j++) {
			const h1 = objects[i];
			const h2 = objects[j];
			const type1 = h1.includes('A') ? 'arc' : (h1.includes('L') ? 'line' : null);
			const type2 = h2.includes('A') ? 'arc' : (h2.includes('L') ? 'line' : null);
			if (!type1 || !type2) continue;
			const [a1, b1] = h1.split(/A|L/).map(n => Number(n));
			const [a2, b2] = h2.split(/A|L/).map(n => Number(n));
			let ok1 = false, ok2 = false;
			if (type1 === 'line') ok1 = pointOnLine(pid, a1, b1);
			else if (type1 === 'arc') ok1 = pointOnArc(pid, a1, b1);
			if (type2 === 'line') ok2 = pointOnLine(pid, a2, b2);
			else if (type2 === 'arc') ok2 = pointOnArc(pid, a2, b2);
			if (ok1 && ok2) {
				// we've found the parent pair
				let expr = null;
				if (type1 === 'line' && type2 === 'line') {
					expr = intersectLineLine(pid, a1, b1, a2, b2);
				} else if (type1 === 'arc' && type2 === 'line') {
					expr = intersectArcLine(pid, a1, b1, a2, b2);
				} else if (type1 === 'line' && type2 === 'arc') {
					expr = intersectArcLine(pid, a2, b2, a1, b1);
				} else if (type1 === 'arc' && type2 === 'arc') {
					expr = intersectArcArc(pid, a1, b1, a2, b2);
				}
				if (expr) {
					addPointDependency(pid, `${h1} ∩ ${h2}`, expr);
					// link to engine point object for later numeric use
					if (window.points && window.points[pid]) window.points[pid].symbolic = `p${pid}`;
					return { pid, parents: [h1, h2], expr };
				}
			}
		}
	}
	// welp it could not determine any parents
	console.error(`Could not determine parents for p${pid} among objects: ${objects.join(',')}`);
	return null;
}

// hook makeline and makearc with snapshots & intersection detection
const _orig_makeline = window.makeline;
window.makeline = function(p1, p2, spec) {
	const beforeSet = snapshotPointIds();
	const prevJumps = Array.isArray(changes?.jumps) ? changes.jumps.length : 0;
	const res = _orig_makeline.apply(this, arguments);
	// after operation
	const afterSet = snapshotPointIds();
	const newPids = [...afterSet].filter(x => !beforeSet.has(x)).map(x => Number(x));
	const newJumps = Array.isArray(changes?.jumps) ? changes.jumps.length : prevJumps;
	let objects = [];
	if (newJumps > prevJumps) {
		const jIndex = newJumps - 1;
		const start = changes.jumps[jIndex - 1] || 0;
		const end = changes.jumps[jIndex] || changes.length;
		for (let k = start; k < end; k++) {
			const ch = changes[k];
			if (!ch || !ch.type) continue;
			if (ch.type === 'arc') objects.push(`${ch.a}A${ch.b}`);
			if (ch.type === 'realline') objects.push(`${ch.a}L${ch.b}`);
		}
	}
	for (let pid of newPids) {
		describeIntersectionFromObjects(pid, objects);
	}
	addLog();
	return res;
};

const _orig_makearc = window.makearc;
window.makearc = function(c, e, r, spec) {
	const beforeSet = snapshotPointIds();
	const prevJumps = Array.isArray(changes?.jumps) ? changes.jumps.length : 0;
	const res = _orig_makearc.apply(this, arguments);
	const afterSet = snapshotPointIds();
	const newPids = [...afterSet].filter(x => !beforeSet.has(x)).map(x => Number(x));
	const newJumps = Array.isArray(changes?.jumps) ? changes.jumps.length : prevJumps;
	let objects = [];
	if (newJumps > prevJumps) {
		const jIndex = newJumps - 1;
		const start = changes.jumps[jIndex - 1] || 0;
		const end = changes.jumps[jIndex] || changes.length;
		for (let k = start; k < end; k++) {
			const ch = changes[k];
			if (!ch || !ch.type) continue;
			if (ch.type === 'arc') objects.push(`${ch.a}A${ch.b}`);
			if (ch.type === 'realline') objects.push(`${ch.a}L${ch.b}`);
		}
	}
	for (let pid of newPids) {
		describeIntersectionFromObjects(pid, objects);
	}
	addLog();
	return res;
};

// also watch changes.replay to link any points created by replay
const _orig_replay = changes.replay;
changes.replay = function() {
	const beforeSet = snapshotPointIds();
	const res = _orig_replay.apply(this, arguments);
	const afterSet = snapshotPointIds();
	const newPids = [...afterSet].filter(x => !beforeSet.has(x)).map(x => Number(x));
	// try to associate newly created points with objects in the last jump
	const jIndex = (changes.jumps && changes.jumps.length) ? changes.jumps.length - 1 : 0;
	const start = (changes.jumps && changes.jumps[jIndex - 1]) || 0;
	const end = (changes.jumps && changes.jumps[jIndex]) || changes.length;
	let objects = [];
	for (let k = start; k < end; k++) {
		const ch = changes[k];
		if (!ch || !ch.type) continue;
		if (ch.type === 'arc') objects.push(`${ch.a}A${ch.b}`);
		if (ch.type === 'realline') objects.push(`${ch.a}L${ch.b}`);
	}
	for (let pid of newPids) describeIntersectionFromObjects(pid, objects);
	addLog();
	return res;
};

// link pointDependencies to window.points for convenience when available
for (let pid of Object.keys(pointDependencies)) {
	if (window.points && window.points[pid]) window.points[pid].symbolic = `p${pid}`;
}

// End of logger
