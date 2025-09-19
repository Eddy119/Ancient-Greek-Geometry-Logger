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

// legacy pending queue for new points (filled by makeline/makearc, flushed in changes.replay and changes.record)
let pendingPids = [];
// pending queue for new points (filled by makeline/makearc, flushed in changes.record)
let pendingObjects = []; // each entry: { hash: 'aLb'|'aAb', beforeIds: Set<string> }

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

function addPointDependency(pid, desc, expr, ch = null, ptObj = null) { // low priority todo: ch = point in changes map, ptObj I'm not sure
	console.log(`Adding point dependency for p${pid}: ${desc}`, expr);
	pointDependencies[pid] = { desc, expr, change: ch, point: ptObj };
	const jIndex = (changes && changes.jumps) ? changes.jumps.length - 1 : 0;
	if (!window._jumpPointMap) window._jumpPointMap = {};
	if (!window._jumpPointMap[jIndex]) window._jumpPointMap[jIndex] = new Set();
	window._jumpPointMap[jIndex].add(String(pid));
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
	pendingPids = [];
	console.log("cleared point dependencies from clearLog");
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

// Helper to collect matching pointDependencies for this object hash, pointDependencies don't have parents object yet, might add later
function collectIntersectionsForHash(targetHash) {
	const intersections = [];
	for (let pid of Object.keys(pointDependencies)) {
		const info = pointDependencies[pid];
		let matches = false;
		if (info && Array.isArray(info.parents)) {
			matches = info.parents.includes(targetHash);
		} else if (info && typeof info.desc === 'string') {
			matches = info.desc.includes(targetHash);
		}
		if (matches) {
			intersections.push({ pid, info });
		}
	}
	return intersections;
}

function getpointDependenciesDesc(pid) { // unused function
    const info = pointDependencies[pid];
    if (info && typeof info.desc === 'string') {
        return info.desc;
    }
    return "why would it not exist?";
}

// formatting helper
function formatChange(ch, actionId) {
	if (!ch || !ch.type) return null;
	// ignore legacy 'line' type if present; we handle 'realline' explicitly
	if (ch.type === 'line') return null;

	let a = ch.a ?? ch.obj?.a ?? '?';
	let b = ch.b ?? ch.obj?.b ?? '?';
	let hash = (ch.type === 'arc') ? `${a}A${b}` : (ch.type === 'realline' ? `${a}L${b}` : `?`);
	const moveNum = (typeof modules !== 'undefined' && modules.test && typeof modules.test.score === 'function') ? modules.test.score() : realmoveCount;

	if (ch.type === 'arc') {
		addDependency(hash, { type: 'arc', depends: [a, b], obj: ch.obj, actionId });
		ensureSymbolicPoint(a); ensureSymbolicPoint(b);

		let logStr = `Action ${actionId} (Move ${moveNum}): Arc ${hash}\n  center: p${a}\n  radius: |p${a}p${b}|`;

		logStr += `\n  Intersections:\n    `;
		// logStr += `p${a} = ${pointDependencies[a].desc} => (${pointDependencies[a].expr.x}, ${pointDependencies[a].expr.y})\n    `;
		// logStr += `p${b} = ${pointDependencies[b].desc} => (${pointDependencies[b].expr.x}, ${pointDependencies[b].expr.y})`;
		logStr += `p${a} = ${getpointDependenciesDesc(a)} => (WIP)\n    `;
		logStr += `p${b} = ${getpointDependenciesDesc(b)} => (WIP)`;

		// const intersections = collectIntersectionsForHash(hash);
		// if (intersections.length > 0) {
		// 	logStr += `\n  Intersections:\n    `;
		// 	logStr += intersections.map(it => `p${it.pid} = ${it.info.desc} => (${it.info.expr.x}, ${it.info.expr.y})`).join('\n    ');
		// }
		return logStr;

	} else if (ch.type === 'realline') {
		// hide engine-split phantom lines (they don't appear in the page hash)
		const currentHash = window.location.hash || '';
		if (!currentHash.includes(hash)) return null;

		addDependency(hash, { type: 'line', depends: [a, b], obj: ch.obj, actionId });
		ensureSymbolicPoint(a); ensureSymbolicPoint(b);

		let logStr = `Action ${actionId} (Move ${moveNum}): Line ${hash}\n  endpoints: p${a}, p${b}`;

		logStr += `\n  Intersections:\n    `;
		// logStr += `p${a} = ${pointDependencies[a].desc} => (${pointDependencies[a].expr.x}, ${pointDependencies[a].expr.y})\n    `;
		// logStr += `p${b} = ${pointDependencies[b].desc} => (${pointDependencies[b].expr.x}, ${pointDependencies[b].expr.y})`;
		logStr += `p${a} = ${getpointDependenciesDesc(a)} => (WIP)\n    `;
		logStr += `p${b} = ${getpointDependenciesDesc(b)} => (WIP)`;

		// const intersections = getpointDependenciesDesc()
		// if (intersections.length > 0) {
		// 	logStr += `\n  Intersections:\n    `;
		// 	// logStr += intersections.map(it => `p${it.pid} = ${it.info.desc} => (${it.info.expr.x}, ${it.info.expr.y})`).join('\n    ');
		// 	logStr += intersections.map(it => `p${it.pid} = ${it.info.desc}`).join('\n    ');
		// }
		return logStr;

	} else if (ch.type === 'newlayer') {
		addDependency(`LAYER${actionId}`, { type: 'layer', depends: [], actionId });
		return `Action ${actionId} (Move ${moveNum}): NewLayer`;
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
	return Math.abs(d - r) <= Math.max(tol, Math.abs(r) * tol);
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
// ---- makeline / makearc: register pending object with a before snapshot ----
const orig_makeline = window.makeline;
window.makeline = function(p1, p2, spec) {
    // snapshot before invoking engine
    const beforeSet = snapshotPointIds();
    const res = orig_makeline.apply(this, arguments);
    // register pending object — the engine will add points later in changes.record
    const hash = `${p1}L${p2}`;
    pendingObjects.push({ hash, beforeIds: beforeSet, type: 'line', meta: { a: Number(p1), b: Number(p2) } });
    return res;
};

const orig_makearc = window.makearc;
window.makearc = function(c, e, r, spec) {
    const beforeSet = snapshotPointIds();
    const res = orig_makearc.apply(this, arguments);
    const hash = `${c}A${e}`;
    pendingObjects.push({ hash, beforeIds: beforeSet, type: 'arc', meta: { a: Number(c), b: Number(e) } });
    return res;
};

// ---- helper: build full objects list (all arcs/reallines). ensure the pendingObjectHash is included up front ----
function collectAllObjectsWith(hashToPrepend) {
    const objects = [];
    for (let k = 0; k < changes.length; k++) {
        const ch = changes[k];
        if (ch?.type === 'arc') objects.push(`${ch.a}A${ch.b}`);
        if (ch?.type === 'realline') objects.push(`${ch.a}L${ch.b}`);
    }
    // put the newly-created object first to help pair matching
    if (hashToPrepend && !objects.includes(hashToPrepend)) objects.unshift(hashToPrepend);
    return objects;
}

// tolerant coordinate lookup (used as fallback in replay)
function findPidByCoordsNearby(x, y, candidates, tol = 1e-5) {
    for (let pid of candidates) {
        const c = pointCoords(pid);
        if (!c) continue;
        if (Math.abs(c.x - x) <= tol && Math.abs(c.y - y) <= tol) return Number(pid);
    }
    return null;
}

// ---- changes.record flush: compute afterSet, resolve pendingObjects by diffing against their beforeIds ----
const orig_record = changes.record;
changes.record = function(finished) {
    const r = orig_record.apply(this, arguments);

    if (pendingObjects.length) {
        // snapshot after engine finalized points
        const afterAll = snapshotPointIds();

        // process each pending object (FIFO)
        for (const pend of pendingObjects) {
            try {
                // compute new pids for this pending object
                const newPids = [...afterAll].filter(x => !pend.beforeIds.has(x)).map(Number);

                // If none found (rare), we still attempt coordinate-based matching across all points added since the earliest before snapshot
                if (newPids.length === 0) {
                    // fallback: try to find any points added since smallest before snapshot among pendingObjects
                    // build a union of all beforeIds to get a global baseline
                    const unionBefore = new Set();
                    for (let p of pendingObjects) {
                        for (let id of p.beforeIds) unionBefore.add(id);
                    }
                    const candidates = [...afterAll].filter(x => !unionBefore.has(x));
                    // we won't try to auto-match here, skip — usually previous logic suffices
                }

                // build objects list including the newly-created object hash
                const objects = collectAllObjectsWith(pend.hash);

                // call describeIntersectionFromObjects for each newly created pid
                for (const pid of newPids) {
                    console.debug(`Record: resolving p${pid} for ${pend.hash} against ${objects.length} objects`);
                    describeIntersectionFromObjects(Number(pid), objects);
                }
            } catch (err) {
                console.error('Error resolving pending object', pend, err);
            }
        }

        // clear pendingObjects after processing
        pendingObjects = [];
    }

    // keep existing pendingPids compatibility (if you still use it elsewhere)
    if (Array.isArray(pendingPids) && pendingPids.length) {
        // resolve any plain pendingPids (older code paths) using full objects list
        const objects = collectAllObjectsWith();
        for (const pid of pendingPids) {
            describeIntersectionFromObjects(Number(pid), objects);
        }
        pendingPids = [];
    }

    // rebuild log now that dependencies added
    addLog();
    return r;
};

const orig_replay = changes.replay;
changes.replay = function() {
	clearLog();
	lastProcessedJump = 0;
	const res = orig_replay.apply(this, arguments);
	// flush any pending (from replay)
	if (pendingPids.length) {
		let objects = [];
		for (let k = 0; k < changes.length; k++) {
			const ch = changes[k];
			if (ch?.type === 'arc') objects.push(`${ch.a}A${ch.b}`);
			if (ch?.type === 'realline') objects.push(`${ch.a}L${ch.b}`);
		}
		pendingPids.forEach(pid => {
			console.debug(`Replay: resolving p${pid} against`, objects);
			describeIntersectionFromObjects(pid, objects);
		});
		pendingPids = [];
	}
	addLog();
	realmoveCount = modules?.test?.score?.() || 0;
	return res;
};

// ---- redo: capture before/after and register pendingObject (so record will resolve it) ----
const orig_redo = changes.redo;
changes.redo = function() {
    const beforeIds = snapshotPointIds();
    const r = orig_redo.apply(this, arguments);
    const afterIds = snapshotPointIds();
    // points newly created by redo (if any) — rather than immediate rely on changes.record,
    // record a generic pending object to ensure record runs resolution
    const newPids = [...afterIds].filter(x => !beforeIds.has(x)).map(Number);
    if (newPids.length) {
        // we don't always know a single hash here; but push a generic pending marker so record will collect them
        pendingObjects.push({ hash: null, beforeIds: beforeIds, type: 'redo' });
    }
    return r;
};

const orig_undo = changes.undo;
changes.undo = function() {
	const lastpointwas = lastpoint;
	let beforeIds = null;
	if (!lastpointwas) {
		beforeIds = new Set(Object.keys(window.points));
		console.debug('b4UndoPoints:', beforeIds);
	}
	const r = orig_undo.apply(this, arguments);
	if (!lastpointwas) {
		const afterIds = new Set(Object.keys(window.points));
		// any pid that existed before but not after = deleted
		for (let pid of beforeIds) {
			if (!afterIds.has(pid)) {
				console.debug(`Undo: removing p${pid} from pointDependencies`);
				// remove from pointDependencies if present
				delete pointDependencies[pid];
				// remove from jumpPointMap sets as well
				if (window._jumpPointMap) {
					for (let j of Object.keys(window._jumpPointMap)) {
						window._jumpPointMap[j].delete(String(pid));
						if (window._jumpPointMap[j].size === 0) delete window._jumpPointMap[j];
					}
				}
			}
		}

		logEntries = []; logEntryChangeIndex = []; entrySerial = 0;
		dependencyMap = {};
		if (changes.jumps.length >= 2) addLog();
	}
	return r;
};

const orig_reset = geo.resetall;
geo.resetall = function() { clearLog(); return orig_reset.apply(this, arguments); };

function addLog() {
	realmoveCount = modules?.test?.score?.() || realmoveCount;
	if (changes.jumps.length >= 2) {
		const currentLastJump = changes.jumps.length - 1;
		logEntries = []; logEntryChangeIndex = []; entrySerial = 0;
		dependencyMap = {}; // pointDependencies = {};
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
