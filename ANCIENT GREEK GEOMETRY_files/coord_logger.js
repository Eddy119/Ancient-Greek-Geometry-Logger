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

function addPointDependency(pid, desc, expr, parents = []) {
	console.log(`Adding point dependency for p${pid}: ${desc}`, expr, new Error().stack);
	pointDependencies[pid] = { desc, expr, change: null, point: window.points?.[pid], parents: parents.slice() }; // copy of parents array // ch = point in changes map, point = ptObj
	const jIndex = (changes && changes.jumps) ? changes.jumps.length - 1 : 0;
	if (!window._jumpPointMap) window._jumpPointMap = {};
	if (!window._jumpPointMap[jIndex]) window._jumpPointMap[jIndex] = new Set();
	window._jumpPointMap[jIndex].add(String(pid));
	if (window.points && window.points[pid]) {
		window.points[pid].symbolic = `p${pid}`;
	}
	addChangesToPointDependency(pid);
}

function addChangesToPointDependency(pid) {
	const p = window.points?.[pid];
	if (!p) {
		console.error(`addChangesToPointDependency: no point with id ${pid}`);
		return;
	} // safety
	for (let i = changes.jumps[changes.jumps.length - 2]; i < changes.jumps[changes.jumps.length - 1]; i++) {
		const ch = changes[i];
		if (!ch || ch.type !== "point") continue;

		// compare coordinates (loose float comparison if needed)
		if (ch.a === p.x && ch.b === p.y) {
			// attach this change record to the pointDependencies entry
			pointDependencies[pid].change = {index: i, entry: changes[i]};
		}
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
// Updated: produce symbolic expressions (strings) and attach correct pointDependencies entry for the given pid.

function _getSymCoord(id, coord) {
	// prefer simplified/symbolic expr if available, else fallback to symbolicPoints name
	if (pointDependencies[id] && pointDependencies[id].expr && typeof pointDependencies[id].expr[coord] !== 'undefined') return pointDependencies[id].expr[coord];
	if (symbolicPoints[id] && typeof symbolicPoints[id][coord] !== 'undefined') return symbolicPoints[id][coord];
	return `p${id}${coord}`;
}

function intersectLineLine(pid, a, b, c, d) {
	// build symbolic formula for intersection of line AB and CD using determinant formula
	ensureSymbolicPoint(a); ensureSymbolicPoint(b); ensureSymbolicPoint(c); ensureSymbolicPoint(d);
	const x1 = _getSymCoord(a,'x'), y1 = _getSymCoord(a,'y');
	const x2 = _getSymCoord(b,'x'), y2 = _getSymCoord(b,'y');
	const x3 = _getSymCoord(c,'x'), y3 = _getSymCoord(c,'y');
	const x4 = _getSymCoord(d,'x'), y4 = _getSymCoord(d,'y');

	const den = `(${x1} - ${x2})*(${y3} - ${y4}) - (${y1} - ${y2})*(${x3} - ${x4})`;
	const numx = `((${x1}*${y2} - ${y1}*${x2})*(${x3} - ${x4}) - (${x1} - ${x2})*(${x3}*${y4} - ${y3}*${x4}))`;
	const numy = `((${x1}*${y2} - ${y1}*${x2})*(${y3} - ${y4}) - (${y1} - ${y2})*(${x3}*${y4} - ${y3}*${x4}))`;
	const expr = { x: `(${numx})/(${den})`, y: `(${numy})/(${den})` };
	addPointDependency(pid, `line(${a},${b}) ∩ line(${c},${d})`, expr, [`${a}L${b}`, `${c}L${d}`]);
	return expr;
}

function intersectArcLine(pid, a, b, c, d) {
	// arc (center a, edge b) intersect line (c,d)
	ensureSymbolicPoint(a); ensureSymbolicPoint(b); ensureSymbolicPoint(c); ensureSymbolicPoint(d);
	// numeric helpers to decide ordering (which of the two intersections matches pid)
	const P = pointCoords(pid);
	const E = pointCoords(c); const L = pointCoords(d);
	const C = pointCoords(a); const Edge = pointCoords(b);
	if (!E || !L || !C || !Edge) {
		// fallback: just attach symbolic placeholders
		const expr = { x: `(arc(${a},${b})∩line(${c},${d}))x`, y: `(arc(${a},${b})∩line(${c},${d}))y` };
		addPointDependency(pid, `arc(${a},${b}) ∩ line(${c},${d})`, expr, [`${a}A${b}`, `${c}L${d}`]);
		return expr;
	}
	// compute numeric intersections using standard quadratic method from geo.js
	const ex = E.x, ey = E.y, lx = L.x, ly = L.y;
	const cx = C.x, cy = C.y;
	const r = Math.hypot(Edge.x - cx, Edge.y - cy);
	const dx = lx - ex, dy = ly - ey;
	const fx = ex - cx, fy = ey - cy;
	const Acoef = dx*dx + dy*dy;
	const Bcoef = 2*(fx*dx + fy*dy);
	const Ccoef = (fx*fx + fy*fy) - r*r;
	const disc = Bcoef*Bcoef - 4*Acoef*Ccoef;
	if (disc < 0) {
		// no real intersection; still attach symbolic
		const expr = { x: `(arc(${a},${b})∩line(${c},${d}))x`, y: `(arc(${a},${b})∩line(${c},${d}))y` };
		addPointDependency(pid, `arc(${a},${b}) ∩ line(${c},${d})`, expr, [`${a}A${b}`, `${c}L${d}`]);
		return expr;
	}
	const sqrtD = Math.sqrt(disc);
	const t1 = (-Bcoef - sqrtD) / (2*Acoef);
	const t2 = (-Bcoef + sqrtD) / (2*Acoef);
	const p1 = { x: ex + t1*dx, y: ey + t1*dy };
	const p2 = { x: ex + t2*dx, y: ey + t2*dy };
	// construct symbolic expressions for p1 and p2 in terms of parameters
	const sx_ex = _getSymCoord(c,'x'), sx_ey = _getSymCoord(c,'y');
	const sx_lx = _getSymCoord(d,'x'), sx_ly = _getSymCoord(d,'y');
	const sx_cx = _getSymCoord(a,'x'), sx_cy = _getSymCoord(a,'y');
	const sx_edge_x = _getSymCoord(b,'x'), sx_edge_y = _getSymCoord(b,'y');
	const sx_r2 = `((${sx_edge_x} - ${sx_cx})^2 + (${sx_edge_y} - ${sx_cy})^2)`;
	const sx_dx = `(${sx_lx} - ${sx_ex})`; const sx_dy = `(${sx_ly} - ${sx_ey})`;
	const sx_fx = `(${sx_ex} - ${sx_cx})`; const sx_fy = `(${sx_ey} - ${sx_cy})`;
	const sx_A = `(${sx_dx})^2 + (${sx_dy})^2`;
	const sx_B = `2*(${sx_fx}*${sx_dx} + ${sx_fy}*${sx_dy})`;
	const sx_C = `(${sx_fx})^2 + (${sx_fy})^2 - (${sx_r2})`;
	// symbolic t1/t2 (quadratic formula)
	const sx_disc = `(${sx_B})^2 - 4*(${sx_A})*(${sx_C})`;
	const sx_t1 = `((-1*(${sx_B})) - sqrt(${sx_disc}))/(2*(${sx_A}))`;
	const sx_t2 = `((-1*(${sx_B})) + sqrt(${sx_disc}))/(2*(${sx_A}))`;
	const expr1 = { x: `(${sx_ex}) + (${sx_t1})*(${sx_dx})`, y: `(${sx_ey}) + (${sx_t1})*(${sx_dy})` };
	const expr2 = { x: `(${sx_ex}) + (${sx_t2})*(${sx_dx})`, y: `(${sx_ey}) + (${sx_t2})*(${sx_dy})` };
	// choose which symbolic expression corresponds to numeric pid
	let chosenExpr = expr1;
	if (P) {
		const d1 = Math.hypot(P.x - p1.x, P.y - p1.y);
		const d2 = Math.hypot(P.x - p2.x, P.y - p2.y);
		chosenExpr = (d2 < d1) ? expr2 : expr1;
	}
	addPointDependency(pid, `arc(${a},${b}) ∩ line(${c},${d})`, chosenExpr, [`${a}A${b}`, `${c}L${d}`]);
	return chosenExpr;
}

function intersectArcArc(pid, a, b, c, d) {
	// two circles intersection (arc centers a,c with edge b,d respectively)
	ensureSymbolicPoint(a); ensureSymbolicPoint(b); ensureSymbolicPoint(c); ensureSymbolicPoint(d);
	const P = pointCoords(pid);
	const C1 = pointCoords(a); const E1 = pointCoords(b);
	const C2 = pointCoords(c); const E2 = pointCoords(d);
	if (!C1 || !E1 || !C2 || !E2) {
		const expr = { x: `(arc(${a},${b})∩arc(${c},${d}))x`, y: `(arc(${a},${b})∩arc(${c},${d}))y` };
		addPointDependency(pid, `arc(${a},${b}) ∩ arc(${c},${d})`, expr, [`${a}A${b}`, `${c}A${d}`]);
		return expr;
	}
	// numeric intersection using known formula (from earlier code)
	const x0 = C1.x, y0 = C1.y, r0 = Math.hypot(E1.x - C1.x, E1.y - C1.y);
	const x1 = C2.x, y1 = C2.y, r1 = Math.hypot(E2.x - C2.x, E2.y - C2.y);
	const dx = x1 - x0, dy = y1 - y0;
	const dist = Math.hypot(dx, dy);
	if (dist > (r0 + r1) || dist < Math.abs(r0 - r1) || dist === 0) {
		const expr = { x: `(arc(${a},${b})∩arc(${c},${d}))x`, y: `(arc(${a},${b})∩arc(${c},${d}))y` };
		addPointDependency(pid, `arc(${a},${b}) ∩ arc(${c},${d})`, expr, [`${a}A${b}`, `${c}A${d}`]);
		return expr;
	}
	const A = ((r0*r0) - (r1*r1) + (dist*dist)) / (2*dist);
	const x2 = x0 + (dx * A / dist);
	const y2 = y0 + (dy * A / dist);
	const h = Math.sqrt(Math.max(0, r0*r0 - A*A));
	const rx = -dy * (h / dist);
	const ry = dx * (h / dist);
	const p1 = { x: x2 + rx, y: y2 + ry };
	const p2 = { x: x2 - rx, y: y2 - ry };
	// build symbolic expressions
	const sx_x0 = _getSymCoord(a,'x'), sx_y0 = _getSymCoord(a,'y');
	const sx_r0sq = `((${_getSymCoord(b,'x')} - ${sx_x0})^2 + (${_getSymCoord(b,'y')} - ${sx_y0})^2)`;
	const sx_x1 = _getSymCoord(c,'x'), sx_y1 = _getSymCoord(c,'y');
	const sx_r1sq = `((${_getSymCoord(d,'x')} - ${sx_x1})^2 + (${_getSymCoord(d,'y')} - ${sx_y1})^2)`;
	const sx_dx = `(${sx_x1} - ${sx_x0})`; const sx_dy = `(${sx_y1} - ${sx_y0})`;
	const sx_d = `sqrt((${sx_dx})^2 + (${sx_dy})^2)`;
	const sx_A = `(((${sx_r0sq}) - (${sx_r1sq}) + (${sx_d})^2)/(2*${sx_d}))`;
	const sx_x2 = `(${sx_x0} + (${sx_dx})*(${sx_A})/(${sx_d}))`;
	const sx_y2 = `(${sx_y0} + (${sx_dy})*(${sx_A})/(${sx_d}))`;
	const sx_h = `sqrt(max(0, (${sx_r0sq}) - (${sx_A})^2))`;
	const sx_rx = `(-(${sx_dy})*(${sx_h})/(${sx_d}))`;
	const sx_ry = `(${sx_dx}*(${sx_h})/(${sx_d}))`;
	const expr1 = { x: `(${sx_x2}) + (${sx_rx})`, y: `(${sx_y2}) + (${sx_ry})` };
	const expr2 = { x: `(${sx_x2}) - (${sx_rx})`, y: `(${sx_y2}) - (${sx_ry})` };
	let chosen = expr1;
	if (P) {
		const d1 = Math.hypot(P.x - p1.x, P.y - p1.y);
		const d2 = Math.hypot(P.x - p2.x, P.y - p2.y);
		chosen = (d2 < d1) ? expr2 : expr1;
	}
	addPointDependency(pid, `arc(${a},${b}) ∩ arc(${c},${d})`, chosen, [`${a}A${b}`, `${c}A${d}`]);
	return chosen;
}

// Unused Helper to collect matching pointDependencies for this object hash, keep for now
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

function formatPoint(pid) {
	const dep = pointDependencies[pid];
	if (dep) {
		// Constructed point with dependency info
		// return `p${pid} = ${dep.desc} => (${dep.expr.x}, ${dep.expr.y})`;
		return `p${pid} = ${dep.desc}`; // for now
	} else {
		// Likely an original/axiom point
		const p = window.points?.[pid];
		if (p) {
			return `p${pid} = original => (${p.x}, ${p.y})`;
		}
		return `p${pid} = unknown`;
	}
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
		logStr += formatPoint(a) + `\n    ` + formatPoint(b);


		return logStr;

	} else if (ch.type === 'realline') {
		// hide engine-split phantom lines (they don't appear in the page hash)
		const currentHash = window.location.hash || '';
		if (!currentHash.includes(hash)) return null;

		addDependency(hash, { type: 'line', depends: [a, b], obj: ch.obj, actionId });
		ensureSymbolicPoint(a); ensureSymbolicPoint(b);

		let logStr = `Action ${actionId} (Move ${moveNum}): Line ${hash}\n  endpoints: p${a}, p${b}`;

		logStr += `\n  Intersections:\n    `;
		logStr += formatPoint(a) + `\n    ` + formatPoint(b);

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

// --- Symbolic simplification helpers (Nerdamer integration) ---
function simplifyExprString(exprStr) {
	// wrapper around global nerdamer; returns simplified string or original on error
	try {
		if (typeof nerdamer === 'undefined') {
			console.warn('simplifyExprString: nerdamer not available');
			return exprStr;
		}
		// nerdamer expects '^' for powers and sqrt(), etc. Use .expand()/.simplify() as needed
		const res = nerdamer(exprStr).expand().simplify();
		return res.toString();
	} catch (err) {
		console.error('simplifyExprString error for', exprStr, err);
		return exprStr;
	}
}

function simplifyPoint(pid, options = { force: false }) {
	const info = pointDependencies[pid];
	if (!info || !info.expr) return null;
	if (info.simplified && !options.force) return info.simplified;
	const sx = info.expr.x;
	const sy = info.expr.y;
	const sx_s = simplifyExprString(sx);
	const sy_s = simplifyExprString(sy);
	info.simplified = { x: sx_s, y: sy_s };
	return info.simplified;
}

function lengthBetweenSymbolic(a, b) {
	// return symbolic expression (unsimplified) for distance between a and b
	const ax = _getSymCoord(a,'x'), ay = _getSymCoord(a,'y');
	const bx = _getSymCoord(b,'x'), by = _getSymCoord(b,'y');
	const dx = `((${ax}) - (${bx}))`;
	const dy = `((${ay}) - (${by}))`;
	const expr = `sqrt((${dx})^2 + (${dy})^2)`;
	return expr;
}

function simplifyLengthBetween(a,b) {
	const raw = lengthBetweenSymbolic(a,b);
	return simplifyExprString(raw);
}

// utility: simplify all dependencies needed for a given object hash (incremental)
function simplifyDependenciesForHash(hash) {
	// find all points that list this hash as a parent (directly)
	const toSimplify = [];
	for (let pid of Object.keys(pointDependencies)) {
		const info = pointDependencies[pid];
		if (!info) continue;
		if (Array.isArray(info.parents) && info.parents.includes(hash)) toSimplify.push(Number(pid));
		else if (typeof info.desc === 'string' && info.desc.includes(hash)) toSimplify.push(Number(pid));
	}
	// simplify each
	for (const pid of toSimplify) {
		simplifyPoint(pid);
	}
	return toSimplify;
}

// Hook: optional helper to compute and cache lengths for dependencyMap entries
function cacheLengthForHash(hash) {
	const info = dependencyMap[hash];
	if (!info) return null;
	if (info.type === 'line' && Array.isArray(info.depends)) {
		const [a,b] = info.depends;
		const raw = lengthBetweenSymbolic(a,b);
		const simple = simplifyExprString(raw);
		info.length = { raw, simple };
		return info.length;
	}
	if (info.type === 'arc' && Array.isArray(info.depends)) {
		const [c,e] = info.depends;
		const raw = lengthBetweenSymbolic(c,e); // radius expression
		const simple = simplifyExprString(raw);
		info.radius = { raw, simple };
		return info.radius;
	}
	return null;
}

// end of appended helpers

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
	console.debug('describeIntersectionFromObjects called for pid=', pid, 'objects=', objects);
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
				console.debug(`describe: matched pid ${pid} as intersection of ${h1} & ${h2}, Intersecting ${type1} ${a1} ${b1} with ${type2} ${a2} ${b2}`);
				let expr = null;
				if (type1 === 'line' && type2 === 'line') expr = intersectLineLine(pid, a1, b1, a2, b2);
				else if (type1 === 'arc' && type2 === 'line') expr = intersectArcLine(pid, a1, b1, a2, b2);
				else if (type1 === 'line' && type2 === 'arc') expr = intersectArcLine(pid, a2, b2, a1, b1);
				else if (type1 === 'arc' && type2 === 'arc') expr = intersectArcArc(pid, a1, b1, a2, b2);
				 // attach parents to pointDependencies
				pointDependencies[pid].parents = [h1, h2];
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
    // snapshot before invoking engine (keep for pendingObjects diff)
    const beforeSet = snapshotPointIds();
    console.debug(`makeline: snapshot before has ${beforeSet.size} points`);
    const res = orig_makeline.apply(this, arguments);
    // normalize ids: p1/p2 may be numeric ids or point objects with .id
    const aId = (p1 && typeof p1 === 'object' && typeof p1.id !== 'undefined') ? Number(p1.id) : Number(p1);
    const bId = (p2 && typeof p2 === 'object' && typeof p2.id !== 'undefined') ? Number(p2.id) : Number(p2);
    const hash = `${aId}L${bId}`;
    console.debug(`makeline: created pending object ${hash}`);
    pendingObjects.push({ hash, beforeIds: beforeSet, type: 'line', meta: { a: aId, b: bId } });
    console.debug('makeline pushed pendingObject', pendingObjects[pendingObjects.length-1]);
    return res;
};

const orig_makearc = window.makearc;
window.makearc = function(c, e, r, spec) {
    const beforeSet = snapshotPointIds();
    console.debug(`makearc: snapshot before has ${beforeSet.size} points`);
    const res = orig_makearc.apply(this, arguments);
    const cId = (c && typeof c === 'object' && typeof c.id !== 'undefined') ? Number(c.id) : Number(c);
    const eId = (e && typeof e === 'object' && typeof e.id !== 'undefined') ? Number(e.id) : Number(e);
    const hash = `${cId}A${eId}`;
    console.debug(`makearc: created pending object ${hash}`);
    pendingObjects.push({ hash, beforeIds: beforeSet, type: 'arc', meta: { a: cId, b: eId } });
    console.debug('makearc pushed pendingObject', pendingObjects[pendingObjects.length-1]);
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

	if (pendingObjects && pendingObjects.length) {
		// snapshot after engine finalized points
		const afterAll = snapshotPointIds();
		console.debug(`changes.record: processing ${pendingObjects.length} pendingObjects; afterAll size=${afterAll.size}`);

		for (const pend of pendingObjects) {
			try {
				const newPids = [...afterAll].filter(x => !pend.beforeIds.has(x)).map(Number);
				console.debug(`pending ${pend.hash} -> newPids:`, newPids);
				console.debug('changes.record: pendingObjects (before processing)=', pendingObjects);

				// grab the dep object
				let lookupHash = pend.hash;
                if (!dependencyMap[lookupHash] && pend.meta && typeof pend.meta.a !== 'undefined' && typeof pend.meta.b !== 'undefined') {
                    lookupHash = `${pend.meta.a}${pend.type === 'arc' ? 'A' : 'L'}${pend.meta.b}`;
                    console.debug('changes.record: fallback computed lookupHash=', lookupHash);
                }
                const dep = dependencyMap[lookupHash];
				if (dep && (dep.type === "line" || dep.type === "arc")) {
					const [a, b] = dep.depends;
					// collect + simplify for both endpoints
					collectPointDependenciesRecursive(a);
					simplifyPointRecursive(a);
					collectPointDependenciesRecursive(b);
					simplifyPointRecursive(b);
				}

				// simplify/calc length for this hash itself
				if (pend.hash) {
					try {
						const simplifiedList = simplifyDependenciesForHash(pend.hash);
						console.debug(`simplified deps for ${pend.hash}:`, simplifiedList);
					} catch (e) {
						console.debug("simplifyDependenciesForHash failed", e);
					}
					try {
						const cached = cacheLengthForHash(pend.hash);
						console.debug(`cacheLengthForHash(${pend.hash}) ->`, cached);
					} catch (e) {
						console.debug("cacheLengthForHash failed for", pend.hash, e);
					}
				}
				console.debug('changes.record: after processing pend:', pend.hash, 'newPids=', newPids);
			} catch (err) {
				console.error("Error resolving pending object", pend, err);
			}
		}

		pendingObjects = [];
	}

	// legacy pendingPids path
	if (Array.isArray(pendingPids) && pendingPids.length) {
		const objects = collectAllObjectsWith();
		for (const pid of pendingPids) {
			console.debug("Record: resolving legacy pending pid", pid);
			describeIntersectionFromObjects(Number(pid), objects);
			if (pointDependencies[pid]) {
				try {
					simplifyPoint(pid);
					console.debug(`Record: simplified legacy p${pid}`, pointDependencies[pid].simplified);
				} catch (e) {
					console.debug("simplifyPoint failed for legacy pid", pid, e);
				}
			}
		}
		pendingPids = [];
	}

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
			if (ch?.type === 'arc' || ch?.type === 'realline') {
				objects.push(ch);
			}
		}
		// process endpoints for each replayed object
		for (let obj of objects) {
			const [a, b] = [obj.a, obj.b];
			collectPointDependenciesRecursive(a);
			simplifyPointRecursive(a);
			collectPointDependenciesRecursive(b);
			simplifyPointRecursive(b);
		}
		pendingPids = [];
	}

	// cache lengths/radii for all dependencyMap entries (best-effort)
	for (let h of Object.keys(dependencyMap)) {
		try { cacheLengthForHash(h); } 
		catch(e) { console.debug('cacheLengthForHash error for', h, e); }
	}

	addLog();
	realmoveCount = modules?.test?.score?.() || 0;
	return res;
};


// ---- redo: capture before/after and register pendingObject (so record will resolve it) ----
const orig_redo = changes.redo;
changes.redo = function () {
	orig_redo.apply(this, arguments);


	// after redo, handle new objects similarly
	if (pendingObjects && pendingObjects.length) {
		pendingObjects.forEach((obj) => {
			if (obj.type === "line" || obj.type === "arc") {
				const [a, b] = obj.points;
				collectPointDependenciesRecursive(a);
				simplifyPointRecursive(a);
				collectPointDependenciesRecursive(b);
				simplifyPointRecursive(b);
			}
		});
		pendingObjects = [];
	}
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

// --- Recursive functions ---
function collectPointDependenciesRecursive(pid, visited = new Set()) {
	if (visited.has(pid)) return;
	visited.add(pid);


	const dep = pointDependencies[pid];
	if (!dep || !dep.parents) return;
	console.log("collectPointDependenciesRecursive", pointDependencies[pid],"pid:", pid, "parents:", pid, dep.parents);

	dep.parents.forEach((parentHash) => {
		if (!dependencyMap[parentHash]) {
			// ensure dependencyMap entry exists
			describeIntersectionFromObjects(parentHash);
		}
		// now recurse into parent point IDs
		const parentDep = dependencyMap[parentHash];
		if (parentDep && parentDep.depends) {
			parentDep.depends.forEach((p) => {
				collectPointDependenciesRecursive(p, visited);
			});
		}
	});
}

function simplifyPointRecursive(pid, visited = new Set()) {
	if (visited.has(pid)) return;
	visited.add(pid);


	collectPointDependenciesRecursive(pid);


	const dep = pointDependencies[pid];
	if (!dep || !dep.expr) return;


	try {
		// only simplify if not already simplified
		if (!dep.simplified) {
			dep.simplified = {
				x: nerdamer("simplify(" + dep.expr.x.toString() + ")").toString(),
				y: nerdamer("simplify(" + dep.expr.y.toString() + ")").toString(),
			};
			console.log("Simplified point", pid, dep.simplified);
		}
	} catch (e) {
		console.warn("Failed to simplify point", pid, e);
	}


	// recurse into parents
	if (dep.parents) {
		dep.parents.forEach((parentHash) => {
			const parentDep = dependencyMap[parentHash];
			if (parentDep && parentDep.depends) {
				parentDep.depends.forEach((p) => simplifyPointRecursive(p, visited));
			}
		});
	}
}

function addLengthDependency(a, b) {
	const expr = `sqrt((${a}.x-${b}.x)^2+(${a}.y-${b}.y)^2)`;
	const simp = nerdamer(expr).simplify().toString();

	const key = `len_${a}_${b}`;
	dependencyMap[key] = {
		type: 'length',
		points: [a, b],
		expr,
		simplified: simp
	};
}
