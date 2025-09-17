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
let actionCount = 0; // user-facing action id (derived from jumps)
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

function addPointDependency(pid, desc, expr) {
	pointDependencies[pid] = { desc, expr };
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
	coordBar.appendChild(renderDependencyMap());
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
	pointDependencies = {};
	symbolicPoints = { 0: { x: '0', y: '0' }, 1: { x: '1', y: '0' } };
	if (coordBar) coordBar.innerHTML = '';
}

if (nukerBtn) nukerBtn.addEventListener('click', clearLog);

// --- Intersections ---
function intersectLineLine(a, b, c, d) {
	ensureSymbolicPoint(a);
	ensureSymbolicPoint(b);
	ensureSymbolicPoint(c);
	ensureSymbolicPoint(d);
	return { x: `line(${a},${b})∩line(${c},${d})`, y: `±line`, den: `≠0` };
}

function intersectArcLine(a, b, c, d) {
	ensureSymbolicPoint(a);
	ensureSymbolicPoint(b);
	ensureSymbolicPoint(c);
	ensureSymbolicPoint(d);
	return {
		x: `(arc(${a},${b})∩line(${c},${d}))`,
		y: `±sqrt(expr)`
	};
}

function intersectArcArc(a, b, c, d) {
	ensureSymbolicPoint(a);
	ensureSymbolicPoint(b);
	ensureSymbolicPoint(c);
	ensureSymbolicPoint(d);
	return {
		x: `(arc(${a},${b})∩arc(${c},${d}))`,
		y: `±sqrt(expr)`
	};
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
		for (let otherHash in dependencyMap) {
			if (otherHash === hash2) continue;
			const dep = dependencyMap[otherHash];
			if (dep.type === 'line') {
				const [c, d] = dep.depends;
				if (dep.actionId <= actionId) {
					const inter = intersectLineLine(a, b, c, d);
					intersections.push(`p? = ${hash2} ∩ ${otherHash} = ${inter.x},${inter.y}`);
				}
			}
			if (dep.type === 'arc') {
				const [c, d] = dep.depends;
				const inter = intersectArcLine(c, d, a, b);
				intersections.push(`p? = ${hash2} ∩ ${otherHash} = ${inter.x},${inter.y}`);
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
const original_record = changes.record;
const original_replay = changes.replay;
const orig_undo = changes.undo;
const orig_reset = geo.resetall;

// --- changes.record wrapper ---
changes.record = function(finished) {
	const result = original_record.apply(this, arguments);
	realmoveCount = (typeof modules !== 'undefined' && modules.test && typeof modules.test.score === 'function') ? modules.test.score() : realmoveCount;

	if (changes && changes.jumps && changes.jumps.length > 1) {
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
	return result;
};

// wrap replay
if (typeof changes.replay === 'function') {
	changes.replay = function() {
		clearLog();
		const res = original_replay.apply(this, arguments);
		lastProcessedJump = 0;
		realmoveCount = (typeof modules !== 'undefined' && modules.test && typeof modules.test.score === 'function') ? modules.test.score() : 0;
		// changes.record(); // rebuild log after replay changes.replay() in geo.js already calls changes.replay()
		return res;
	};
}

// hook undo
changes.undo = function() {
	const res = orig_undo.apply(this, arguments);
	changes.record(); // rebuild log + dependencies
	return res;
};

// Reset hook
geo.resetall = function() {
	clearLog();
	return orig_reset.apply(this, arguments);
};

// End of logger
