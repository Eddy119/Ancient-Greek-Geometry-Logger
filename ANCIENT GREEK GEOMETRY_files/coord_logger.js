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
	if (window.points && window.points[pid]) {
		window.points[pid].symbolic = `p${pid}`;
	}
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

// --- Intersections ---
function intersectLineLine(pid, a, b, c, d) {
	ensureSymbolicPoint(a); ensureSymbolicPoint(b);
	ensureSymbolicPoint(c); ensureSymbolicPoint(d);
	const expr = { x: `(det(p${a},p${b},p${c},p${d}))x`, y: `(det(p${a},p${b},p${c},p${d}))y` };
	addPointDependency(pid, `line(${a},${b}) ∩ line(${c},${d})`, expr);
	return expr;
}

function intersectArcLine(pid, a, b, c, d) {
	ensureSymbolicPoint(a); ensureSymbolicPoint(b);
	ensureSymbolicPoint(c); ensureSymbolicPoint(d);
	const expr = { x: `(arc(${a},${b})∩line(${c},${d}))x`, y: `(arc(${a},${b})∩line(${c},${d}))y` };
	addPointDependency(pid, `arc(${a},${b}) ∩ line(${c},${d})`, expr);
	return expr;
}

function intersectArcArc(pid, a, b, c, d) {
	ensureSymbolicPoint(a); ensureSymbolicPoint(b);
	ensureSymbolicPoint(c); ensureSymbolicPoint(d);
	const expr = { x: `(arc(${a},${b})∩arc(${c},${d}))x`, y: `(arc(${a},${b})∩arc(${c},${d}))y` };
	addPointDependency(pid, `arc(${a},${b}) ∩ arc(${c},${d})`, expr);
	return expr;
}

// formatting helper
function formatChange(ch, actionId) {
	if (!ch || !ch.type) return null;
	if (ch.type === 'line') return null;
	let a = ch.a ?? ch.obj?.a ?? '?';
	let b = ch.b ?? ch.obj?.b ?? '?';
	let hash = (ch.type === 'arc') ? `${a}A${b}` : (ch.type === 'realline' ? `${a}L${b}` : `?`);

	if (ch.type === 'arc') {
		addDependency(hash, { type: 'arc', depends: [a, b], obj: ch.obj, actionId });
		ensureSymbolicPoint(a); ensureSymbolicPoint(b);
		return `Action ${actionId}: Arc ${hash}\n  center: p${a}\n  radius: |p${a}p${b}|`;
	} else if (ch.type === 'realline') {

		const currentHash = window.location.hash || '';
		if (!currentHash.includes(hash)) {
			return null; // hide phantom line
		}

		addDependency(hash, { type: 'line', depends: [a, b], obj: ch.obj, actionId });
		ensureSymbolicPoint(a); ensureSymbolicPoint(b);
		let logStr = `Action ${actionId}: Line ${hash}\n  endpoints: p${a}, p${b}`;
		// add intersections from pointDependencies
		const intersections = [];
		for (let pid of Object.keys(pointDependencies)) {
			const info = pointDependencies[pid];
			if (info.desc.includes(hash)) {
				intersections.push(`p${pid} = ${info.desc} => (${info.expr.x}, ${info.expr.y})`);
			}
		}
		if (intersections.length > 0) {
			logStr += `\n  Intersections:\n    ` + intersections.join('\n    ');
		}
		return logStr;
	} else if (ch.type === 'newlayer') {
		addDependency(`LAYER${actionId}`, { type: 'layer', depends: [], actionId });
		return `Action ${actionId}: NewLayer`;
	}
	return null;
}

// --- helpers ---
function snapshotPointIds() {
	return new Set(Object.keys(window.points || {}));
}

function pointCoords(pid) {
	const pt = window.points?.[pid];
	if (!pt) return null;
	return { x: Number(pt.x), y: Number(pt.y) };
}

function dist(p, q) {
	return Math.hypot(p.x - q.x, p.y - q.y);
}

function pointOnLine(pid, a, b, tol = 1e-6) {
	const P = pointCoords(pid), A = pointCoords(a), B = pointCoords(b);
	if (!P || !A || !B) return false;
	const ABx = B.x - A.x, ABy = B.y - A.y;
	const num = Math.abs(ABx * (A.y - P.y) - ABy * (A.x - P.x));
	const den = Math.hypot(ABx, ABy);
	return den >= 1e-12 && (num / den) <= tol;
}

function pointOnArc(pid, centerId, edgeId, tol = 1e-6) {
	const P = pointCoords(pid), C = pointCoords(centerId), E = pointCoords(edgeId);
	if (!P || !C || !E) return false;
	const r = dist(C, E), d = dist(C, P);
	return Math.abs(d - r) <= Math.max(1e-6, Math.abs(r) * 1e-6);
}

function describeIntersectionFromObjects(pid, objects) {
	if (!Array.isArray(objects) || objects.length < 2) return null;
	for (let i = 0; i < objects.length; i++) {
		for (let j = i + 1; j < objects.length; j++) {
			const h1 = objects[i], h2 = objects[j];
			const type1 = h1.includes('A') ? 'arc' : 'line';
			const type2 = h2.includes('A') ? 'arc' : 'line';
			const [a1, b1] = h1.split(/A|L/).map(Number);
			const [a2, b2] = h2.split(/A|L/).map(Number);
			const ok1 = (type1 === 'line' ? pointOnLine(pid, a1, b1) : pointOnArc(pid, a1, b1));
			const ok2 = (type2 === 'line' ? pointOnLine(pid, a2, b2) : pointOnArc(pid, a2, b2));
			if (ok1 && ok2) {
				let expr = null;
				if (type1 === 'line' && type2 === 'line') expr = intersectLineLine(pid, a1, b1, a2, b2);
				else if (type1 === 'arc' && type2 === 'line') expr = intersectArcLine(pid, a1, b1, a2, b2);
				else if (type1 === 'line' && type2 === 'arc') expr = intersectArcLine(pid, a2, b2, a1, b1);
				else if (type1 === 'arc' && type2 === 'arc') expr = intersectArcArc(pid, a1, b1, a2, b2);
				return { pid, parents: [h1, h2], expr };
			}
		}
	}
	console.error(`Could not determine parents for p${pid} among objects: ${objects.join(',')}`);
	return null;
}

// --- hooks ---
const orig_makeline = window.makeline;
window.makeline = function(p1, p2, spec) {
	const beforeSet = snapshotPointIds();
	const res = orig_makeline.apply(this, arguments);
	const afterSet = snapshotPointIds();
	const newPids = [...afterSet].filter(x => !beforeSet.has(x)).map(Number);
	// gather objects from last jump
	const jIndex = changes.jumps.length - 1;
	const start = changes.jumps[jIndex - 1] || 0, end = changes.jumps[jIndex] || changes.length;
	let objects = [];
	for (let k = start; k < end; k++) {
		const ch = changes[k];
		if (ch?.type === 'arc') objects.push(`${ch.a}A${ch.b}`);
		if (ch?.type === 'realline') objects.push(`${ch.a}L${ch.b}`);
	}
	newPids.forEach(pid => describeIntersectionFromObjects(pid, objects));
	addLog();
	return res;
};

const orig_makearc = window.makearc;
window.makearc = function(c, e, r, spec) {
	const beforeSet = snapshotPointIds();
	const res = orig_makearc.apply(this, arguments);
	const afterSet = snapshotPointIds();
	const newPids = [...afterSet].filter(x => !beforeSet.has(x)).map(Number);
	const jIndex = changes.jumps.length - 1;
	const start = changes.jumps[jIndex - 1] || 0, end = changes.jumps[jIndex] || changes.length;
	let objects = [];
	for (let k = start; k < end; k++) {
		const ch = changes[k];
		if (ch?.type === 'arc') objects.push(`${ch.a}A${ch.b}`);
		if (ch?.type === 'realline') objects.push(`${ch.a}L${ch.b}`);
	}
	newPids.forEach(pid => describeIntersectionFromObjects(pid, objects));
	addLog();
	return res;
};

const orig_replay = changes.replay;
changes.replay = function() {
	clearLog();
	lastProcessedJump = 0;
	const res = orig_replay.apply(this, arguments);
	// process all jumps
	for (let j = 1; j < changes.jumps.length; j++) {
		const start = changes.jumps[j - 1], end = changes.jumps[j];
		let objects = [], pointChanges = [];
		for (let k = start; k < end; k++) {
			const ch = changes[k];
			if (ch?.type === 'arc') objects.push(`${ch.a}A${ch.b}`);
			if (ch?.type === 'realline') objects.push(`${ch.a}L${ch.b}`);
			if (ch?.type === 'point') pointChanges.push(ch);
		}
		for (let pid in window.points) {
			const coords = pointCoords(pid);
			if (!coords) continue;
			if (pointChanges.some(pc => Math.abs(pc.a - coords.x) < 1e-6 && Math.abs(pc.b - coords.y) < 1e-6)) {
				describeIntersectionFromObjects(Number(pid), objects);
			}
		}
	}
	addLog();
	realmoveCount = modules?.test?.score?.() || 0;
	return res;
};

const orig_redo = changes.redo;
changes.redo = function() { const r = orig_redo.apply(this, arguments); addLog(); return r; };

const orig_undo = changes.undo;
changes.undo = function() {
	const r = orig_undo.apply(this, arguments);
	logEntries = []; logEntryChangeIndex = []; entrySerial = 0;
	dependencyMap = {}; pointDependencies = {};
	if (changes.jumps.length >= 2) addLog();
	return r;
};

const orig_reset = geo.resetall;
geo.resetall = function() { clearLog(); return orig_reset.apply(this, arguments); };

function addLog() {
	realmoveCount = modules?.test?.score?.() || realmoveCount;
	if (changes.jumps.length >= 2) {
		const currentLastJump = changes.jumps.length - 1;
		logEntries = []; logEntryChangeIndex = []; entrySerial = 0;
		dependencyMap = {}; pointDependencies = {};
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
