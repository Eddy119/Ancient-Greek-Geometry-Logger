// Geometry Logger with symbolic groundwork
// - Logs arcs/lines/layers with dependency map
// - Tracks symbolic points and dependencies
// - Begins symbolic logging: line-line, arc-line, arc-arc intersections

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

	// render engine entries only (userLines ignored)
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
	pointDependencies = {};
	symbolicPoints = { 0: { x: '0', y: '0' }, 1: { x: '1', y: '0' }, 2: { x: '0', y: '1' } };
	if (coordBar) coordBar.innerHTML = '';
}

if (nukerBtn) nukerBtn.addEventListener('click', clearLog);

// intersection helpers (symbolic placeholders)
function intersectLineLine(a, b, c, d) {
	// a,b,c,d are point *IDs*, not point objects
	ensureSymbolicPoint(a);
	ensureSymbolicPoint(b);
	ensureSymbolicPoint(c);
	ensureSymbolicPoint(d);

	// numeric (approx) coords, if available
	const pa = window.points?.[a];
	const pb = window.points?.[b];
	const pc = window.points?.[c];
	const pd = window.points?.[d];

	const x1 = pa?.x ?? `p${a}x`, y1 = pa?.y ?? `p${a}y`;
	const x2 = pb?.x ?? `p${b}x`, y2 = pb?.y ?? `p${b}y`;
	const x3 = pc?.x ?? `p${c}x`, y3 = pc?.y ?? `p${c}y`;
	const x4 = pd?.x ?? `p${d}x`, y4 = pd?.y ?? `p${d}y`;

	// denominator
	const D = `(${x1} - ${x2}) * (${y3} - ${y4}) - (${y1} - ${y2}) * (${x3} - ${x4})`;

	if (Math.abs(D) < 1e-9) return {
		x: `parallel`,
		y: `parallel`,
		den: `parallel`,
	}; // parallel

	// return a symbolic object
	return {
		x: `((${x1}*${y2} - ${y1}*${x2}) * (${x3} - ${x4}) - (${x1} - ${x2}) * (${x3}*${y4} - ${y3}*${x4})) / (${D})`,
		y: `((${x1}*${y2} - ${y1}*${x2}) * (${y3} - ${y4}) - (${y1} - ${y2}) * (${x3}*${y4} - ${y3}*${x4})) / (${D})`,
		den: D
	};
}


function intersectArcLine(a, b, c, d) {
	// arc centre-edge a,b with line c,d
	ensureSymbolicPoint(a);
	ensureSymbolicPoint(b);
	ensureSymbolicPoint(c);
	ensureSymbolicPoint(d);
	const expr = { x: `(quadratic expr)`, y: `(quadratic expr)` };
	return expr;
}

function intersectArcArc(a, b, c, d) {
	// arc a,b with arc c,d
	ensureSymbolicPoint(a);
	ensureSymbolicPoint(b);
	ensureSymbolicPoint(c);
	ensureSymbolicPoint(d);
	const expr = { x: `(circle-circle expr)`, y: `(circle-circle expr)` };
	return expr;
}

// formatting helper
function formatChange(ch, actionId) {
	if (!ch || !ch.type) return null;
	if (ch.type === 'line') return null; // skip raw split lines
	const rm = realmoveCount;
	let a = (typeof ch.a !== 'undefined') ? ch.a : (typeof ch.obj?.a !== 'undefined' ? ch.obj.a : '?');
	let b = (typeof ch.b !== 'undefined') ? ch.b : (typeof ch.obj?.b !== 'undefined' ? ch.obj.b : '?');
	let hash = (ch.type === 'arc') ? `${a}A${b}` : (ch.type === 'realline' ? `${a}L${b}` : `?`);

	if (ch.type === 'arc') {
		addDependency(hash, { type: 'arc', depends: [a, b], obj: ch.obj, actionId });
		ensureSymbolicPoint(a);
		ensureSymbolicPoint(b);
		return `Action ${actionId}: Arc ${hash}`;
	} else if (ch.type === 'realline') {
		const hash2 = `${a}L${b}`;
		const currentHash = window.location.hash || '';
		if (!currentHash.includes(hash2)) return null;
		addDependency(hash2, { type: 'line', depends: [a, b], obj: ch.obj, actionId });
		ensureSymbolicPoint(a);
		ensureSymbolicPoint(b);
		// --- compute intersections with existing lines/arcs ---
		const intersections = [];
		for (let otherHash in dependencyMap) {
			const dep = dependencyMap[otherHash];
			if (dep.type === 'line') {
				const [c, d] = dep.depends;
				const inter = intersectLineLine(a, b, c, d);
				intersections.push(`${hash2} ∩ ${otherHash} = ${JSON.stringify(inter)}`);
			}
		}

		// combine log string
		let logStr = `Action ${actionId}: Line ${hash2}`;
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

// hook undo
changes.undo = function() {
	const res = orig_undo.apply(this, arguments);
	renderLog();
	return res;
};

// Reset hook
geo.resetall = function() {
	clearLog();
	return orig_reset.apply(this, arguments);
};

// End of logger
