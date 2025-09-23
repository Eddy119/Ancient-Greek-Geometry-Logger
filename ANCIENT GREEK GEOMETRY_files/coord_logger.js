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

// helpers for consistent hash formatting
function makeLineHash(a, b) {
	a = Number(a); b = Number(b);
	return `${a}L${b}`;
}
function makeArcHash(a, b) {
	return `${Number(a)}A${Number(b)}`;
}

function addPointParentSkeleton(pid, desc, parents = [], type = "intersection", meta = {}) {
  // ensure a canonical pointDependencies entry exists and keep expr untouched
  if (!pointDependencies[pid]) {
    pointDependencies[pid] = {
      desc: desc ?? (pointDependencies[pid]?.desc ?? ""),
      expr: pointDependencies[pid]?.expr ?? null, // keep existing expr if any
      change: pointDependencies[pid]?.change ?? null, // making this addChangesToPointDependency(pid) causes undefined error, adding below*
      point: window.points?.[pid] ?? pointDependencies[pid]?.point ?? null,
      parents: [],
      type: type ?? pointDependencies[pid]?.type ?? "intersection",
      meta: Object.assign({}, pointDependencies[pid]?.meta ?? {}, meta)
    };
	addChangesToPointDependency(pid); // *here
  }

  // merge parents without duplicates (parents are hashes like '2L3' or '0A1')
  const target = pointDependencies[pid].parents || [];
  for (const h of parents) {
    if (!target.includes(h)) target.push(h);
  }
  pointDependencies[pid].parents = target;

  // keep desc/type/meta up-to-date
  if (desc) pointDependencies[pid].desc = desc;
  if (type) pointDependencies[pid].type = type;
  pointDependencies[pid].meta = Object.assign({}, pointDependencies[pid].meta || {}, meta);

  // light bookkeeping (jump map, optional)
  const jIndex = (changes && changes.jumps) ? changes.jumps.length - 1 : 0;
  window._jumpPointMap = window._jumpPointMap || {};
  window._jumpPointMap[jIndex] = window._jumpPointMap[jIndex] || new Set();
  window._jumpPointMap[jIndex].add(String(pid));
}


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

function addPointDependency(pid, desc, expr = null, parents = [], type = "intersection", meta = {}) { // uncalled function right now
	// ensure parents is an array
	const parentsArr = Array.isArray(parents) ? parents.slice() : (parents ? Array.from(parents) : []);

	// canonical write (no overwrites later)
	pointDependencies[pid] = {
		desc: desc ?? pointDependencies[pid]?.desc ?? "",
		expr: (typeof expr !== 'undefined') ? expr : (pointDependencies[pid]?.expr ?? null),
		change: pointDependencies[pid]?.change ?? null,
		point: window.points?.[pid] ?? pointDependencies[pid]?.point ?? null,
		parents: parentsArr,
		type: type ?? pointDependencies[pid]?.type ?? "intersection",
		meta: Object.assign({}, pointDependencies[pid]?.meta ?? {}, meta)
	};

	// book-keeping: jump map, set symbolic name
	const jIndex = (changes && changes.jumps) ? changes.jumps.length - 1 : 0;
	if (!window._jumpPointMap) window._jumpPointMap = {};
	if (!window._jumpPointMap[jIndex]) window._jumpPointMap[jIndex] = new Set();
	window._jumpPointMap[jIndex].add(String(pid));
	if (window.points && window.points[pid]) {
		window.points[pid].symbolic = `p${pid}`;
	}

	// attach change ref if available (keeps previous behavior)
	if (pointDependencies[pid].change === null) {
		addChangesToPointDependency(pid); // where do we put this now
	}
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
	try {
		if (id === 0) return coord === "x" ? "0" : "0";
    	if (id === 1) return coord === "x" ? "1" : "0";
		// if (pointDependencies[id] && !pointDependencies[id].expr && !pointDependencies[id]._computing) {
			// Uncomment to DANGEROUSLY attempt to ensure the expression for this point (will recurse to parents as needed)
			// ensureExpr(Number(id));
		// }
		// prefer simplified/symbolic expr if available, else fallback to symbolicPoints name
		if (pointDependencies[id] && pointDependencies[id].expr && typeof pointDependencies[id].expr[coord] !== 'undefined') {
			if (pointDependencies[id].simplified[coord]) {return pointDependencies[id].simplified[coord];}
			else {console.warn('no simplified expr for p' + id); return pointDependencies[id].expr[coord];}
			// return pointDependencies[id].expr[coord];
		}

		// do NOT auto-trigger ensureExpr here — return symbolic placeholder or pre-seeded symbolicPoints
		if (symbolicPoints[id] && typeof symbolicPoints[id][coord] !== 'undefined') return symbolicPoints[id][coord];
		return `p${id}${coord}`;

	} catch (e) {
		console.debug('_getSymCoord: ensureExpr failed for p' + id, e);
	}
}

// numeric test
function areCollinearPoints(a, b, c, d) {
	const A = pointCoords(a), B = pointCoords(b), C = pointCoords(c), D = pointCoords(d);
	const area1 = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
	const area2 = (B.x - A.x) * (D.y - A.y) - (B.y - A.y) * (D.x - A.x);
	return Math.abs(area1) < 1e-6 && Math.abs(area2) < 1e-6;
}

function intersectLineLine(pid, a, b, c, d) {
	const h1 = makeLineHash(a, b);
	const h2 = makeLineHash(c, d);

	// collinearity check (use your existing helper)
	if (areCollinearPoints(a, b, c, d)) {
		// tag as collinear but keep both parents so dependency graph is intact
		const desc = `collinear intersection ${h1} ∩ ${h2}`;
		addPointParentSkeleton(pid, desc, [h1, h2], "collinear", { note: "collinear pair" });

		// annotate dependencyMap lines if you want
		if (dependencyMap[h1]) dependencyMap[h1].collinearWith = dependencyMap[h1].collinearWith || h2;
		if (dependencyMap[h2]) dependencyMap[h2].collinearWith = dependencyMap[h2].collinearWith || h1;

		return null; // no expr returned
	}

	// normal (non-collinear) case: record parents; expr will be produced lazily later
	const desc = `L(${a},${b}) ∩ L(${c},${d})`;
	addPointParentSkeleton(pid, desc, [h1, h2], "intersection");
	return null;
}

function intersectArcLine(pid, arcCenter, arcEdge, lineP1, lineP2) { // engine ordering relied on
	const hArc = makeArcHash(arcCenter, arcEdge);
	const hLine = makeLineHash(lineP1, lineP2);

	// record parents only
	const desc = `A(${arcCenter},${arcEdge}) ∩ L(${lineP1},${lineP2})`;
	addPointParentSkeleton(pid, desc, [hArc, hLine], "intersection");
	return null;
}

function intersectArcArc(pid, aCenter, aEdge, bCenter, bEdge) { // engine ordering relied on
	const hA = makeArcHash(aCenter, aEdge);
	const hB = makeArcHash(bCenter, bEdge);

	const desc = `A(${aCenter},${aEdge}) ∩ A(${bCenter},${bEdge})`;
	addPointParentSkeleton(pid, desc, [hA, hB], "intersection");
	return null;
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
	return { x: (Number(pt.x) + 256) / 512, y: -(Number(pt.y)) / 512 }; // normalize engine coords
}

// --- Symbolic simplification helpers (Nerdamer integration) ---
let USE_NERDAMER = true;

function simplifyExprString(exprStr) {
	// temporary: skip nerdamer-based simplification if disabled
	if (!USE_NERDAMER) return exprStr;
	try {
		if (typeof Algebrite === 'undefined') {
			console.warn('simplifyExprString: nerdamer not available');
			return exprStr;
		}
		// nerdamer expects '^' for powers and sqrt(), etc. Use .expand()/.simplify() as needed
		console.debug("what could we be possibly be feeding nerdamer?", exprStr);
		const res = Algebrite.run(`simplify(${exprStr})`);
		console.debug("what could nerdamer be spitting?", res.toString());
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
	if (!info) { console.debug('cacheLengthForHash: no info for', hash); return null} // cacheLengthForHash doesn't work, doesn't matter for now
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

function pointOnLine(pid, a, b, tol = 1e-6) { // this detects point on inf extension of the line, check flagDependenciesForHash() for any exclusions (don't exclude)
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
	console.debug("is it inputting garbage? ",objects);
	if (!Array.isArray(objects) || objects.length < 2) return null;
	let found = false;
	let collinear = false;
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
				found = true;
				let expr = null;
				if (type1 === 'line' && type2 === 'line') expr = intersectLineLine(pid, a1, b1, a2, b2);
				else if (type1 === 'arc' && type2 === 'line') expr = intersectArcLine(pid, a1, b1, a2, b2);
				else if (type1 === 'line' && type2 === 'arc') expr = intersectArcLine(pid, a2, b2, a1, b1);
				else if (type1 === 'arc' && type2 === 'arc') expr = intersectArcArc(pid, a1, b1, a2, b2);
				// ensure we have a skeleton; if not, create fallback
				if (!pointDependencies[pid] || !pointDependencies[pid].parents || pointDependencies[pid].parents.length === 0) {
					// fallback: write parents from objects array (objects order should be the two hashes)
					console.warn("fallback: write parents from objects array");
					const fallbackParents = [h1, h2].slice(0, 2);
					addPointParentSkeleton(pid, `fallback ${fallbackParents.join(',')}`, fallbackParents, "intersection");
				}
				// we only need the first matching pair			// TODO: keep looping if collinear
				if (!pointDependencies[pid]) return null;
				if (pointDependencies[pid].type !== "collinear") {collinear = false; return pointDependencies[pid];}
				else collinear = true;
			}
		}
	}
	if (collinear) console.warn(`only collinear parents detected for p${pid} among objects: ${objects.join(',')}`);
	if (!found) console.error(`Could not determine parents for p${pid} among objects: ${objects.join(',')}`);
	return null;
}

function ensureExpr(pid) {
	const dep = pointDependencies[pid];
	if (!dep) {
		console.error(`ensureExpr: no pointDependencies for p${pid}`);
		return null;
	}
	// If expression already exists, bail out
	if (dep.expr) return dep.expr;
	if (dep._computing) return null; // already in progress
	dep._computing = true;
	// Parents should already be populated by addPointParentSkeleton
	if (!dep.parents || dep.parents.length < 2) {
		console.error(`ensureExpr: not enough parents for p${pid}`, dep.parents);
		dep._computing = false;
		return null;
	}

	const obj1 = dep.parents[0];
	const obj2 = dep.parents[dep.parents.length - 1];
	let expr = null;
	try {
		if (obj1.includes("L") && obj2.includes("L")) {
			// line-line
			expr = exprIntersectLineLine(obj1, obj2);
		} else if ((obj1.includes("A") && obj2.includes("L")) || (obj1.includes("L") && obj2.includes("A"))) {
			// arc-line: ensure we pass (arcCenter, arcEdge, lineP1, lineP2)
			let arcHash = obj1.includes('A') ? obj1 : obj2;
			let lineHash = obj1.includes('L') ? obj1 : obj2;
			const [ac, ae] = arcHash.split(/A|L/).map(Number);
			const [lp1, lp2] = lineHash.split(/A|L/).map(Number);

			const cand1 = exprArcLine(ac, ae, lp1, lp2, 0);
			const cand2 = exprArcLine(ac, ae, lp1, lp2, 1);
			expr = chooseExprForPid(pid, cand1, cand2);
		} else if (obj1.includes("A") && obj2.includes("A")) {
			// arc-arc
			const [a1, b1] = obj1.split(/A|L/).map(Number);
			const [a2, b2] = obj2.split(/A|L/).map(Number);
			const cand1 = exprArcArc(a1, b1, a2, b2, 0);
			const cand2 = exprArcArc(a1, b1, a2, b2, 1);
			expr = chooseExprForPid(pid, cand1, cand2);
		} else {
			console.error(`ensureExpr: unrecognized parent combo for p${pid}`, obj1, obj2);
		}
	} catch (e) {
		console.error('ensureExpr: error computing expr for p' + pid, e);
		expr = null;
	}

	dep.expr = expr;
	dep._computing = false;
	return expr;
}

function exprIntersectLineLine(h1, h2) {
	// recover endpoints from hash
	const [a, b] = h1.split("L").map(Number);
	const [c, d] = h2.split("L").map(Number);

	// use _getSymCoord for coords
	const Ax = _getSymCoord(a,'x'), Ay = _getSymCoord(a,'y'), Bx = _getSymCoord(b,'x'), By = _getSymCoord(b,'y');
	const Cx = _getSymCoord(c,'x'), Cy = _getSymCoord(c,'y'), Dx = _getSymCoord(d,'x'), Dy = _getSymCoord(d,'y');

	// determinant formula
	const denom = `((${Ax})-(${Bx}))*((${Cy})-(${Dy})) - ((${Ay})-(${By}))*((${Cx})-(${Dx}))`;
	const x = `(((${Ax}*${By})-(${Ay}*${Bx}))*(${Cx}-${Dx}) - ((${Ax})-(${Bx}))*(((${Cx}*${Dy})-(${Cy}*${Dx})))) / (${denom})`;
	const y = `(((${Ax}*${By})-(${Ay}*${Bx}))*(${Cy}-${Dy}) - ((${Ay})-(${By}))*(((${Cx}*${Dy})-(${Cy}*${Dx})))) / (${denom})`;

	return { x, y };
}

function exprArcArc(a, b, c, d, choice) {
	// circle (a,b) ∩ circle (c,d)
	const ax = _getSymCoord(a, 'x'), ay = _getSymCoord(a, 'y');
	const bx = _getSymCoord(b, 'x'), by = _getSymCoord(b, 'y');
	const cx = _getSymCoord(c, 'x'), cy = _getSymCoord(c, 'y');
	const dx = _getSymCoord(d, 'x'), dy = _getSymCoord(d, 'y');

	// squared radii
	const r1sq = `((${bx}) - (${ax}))^2 + ((${by}) - (${ay}))^2`;
	const r2sq = `((${dx}) - (${cx}))^2 + ((${dy}) - (${cy}))^2`;

	// line between centers
	const dxac = `((${cx}) - (${ax}))`, dyac = `((${cy}) - (${ay}))`;
	const d2 = `(${dxac})^2 + (${dyac})^2`;

	// base point along line connecting centers
	const t = `(((${r1sq}) - (${r2sq}) + (${d2})) / (2*(${d2})))`;
	const px = `(${ax}) + (${t})*(${dxac})`;
	const py = `(${ay}) + (${t})*(${dyac})`;

	// distance from base point to intersection
	const hsq = `(${r1sq}) - ((${t})^2*(${d2}))`;
	const h = `sqrt(${hsq})`;

	// perpendicular offset
	const rx = `-(${dyac})`, ry = dxac;
	const mag = `sqrt(${d2})`;

	let ix, iy;
	if (choice === 0) {
		ix = `(${px}) + (${h})*(${rx})/(${mag})`;
		iy = `(${py}) + (${h})*(${ry})/(${mag})`;
	} else {
		ix = `(${px}) - (${h})*(${rx})/(${mag})`;
		iy = `(${py}) - (${h})*(${ry})/(${mag})`;
	}
	return { x: ix, y: iy };
}

function exprArcLine(a, b, c, d, choice) {
	// circle (a,b) ∩ line (c,d)
	const ax = _getSymCoord(a, 'x'), ay = _getSymCoord(a, 'y');
	const bx = _getSymCoord(b, 'x'), by = _getSymCoord(b, 'y');
	const cx = _getSymCoord(c, 'x'), cy = _getSymCoord(c, 'y');
	const dx_ = _getSymCoord(d, 'x'), dy_ = _getSymCoord(d, 'y');

	// radius squared
	const r2 = `((${bx}) - (${ax}))^2 + ((${by}) - (${ay}))^2`;

	// line direction
	const vx = `((${dx_}) - (${cx}))`, vy = `((${dy_}) - (${cy}))`;

	// quadratic coefficients for intersection
	const A = `(${vx}^2 + ${vy}^2)`;
	const B = `(2*( (${cx} - ${ax})*(${vx}) + (${cy} - ${ay})*(${vy}) ))`;
	const C = `(${cx} - ${ax})^2 + (${cy} - ${ay})^2 - (${r2})`;

	// IMPORTANT: fully parenthesize A and C when combining them
	// determinant (discriminant)
	const disc = `(${B})^2 - 4*(${A})*(${C})`;
	const sqrtDisc = `sqrt(${disc})`;

	// IMPORTANT: wrap numerator fully in parentheses to avoid premature simplification
	let t;
	if (choice === 0) {
		t = `(((-1)*(${B})) + ${sqrtDisc}) / (2*(${A}))`;
	} else {
		t = `(((-1)*(${B})) - ${sqrtDisc}) / (2*(${A}))`;
	}

	// console.debug('ARCLINE',ax,ay,bx,by,cx,cy,dx_,dy_);
	// parenthesize t and vx/vy when multiplying, also wrap t in parentheses when used
	const ix = `(${cx}) + ((${t})*(${vx}))`;
	const iy = `(${cy}) + ((${t})*(${vy}))`;

	return { x: ix, y: iy };
}

function pointDependenciesFor(hash) {
	// helper: find a representative point in that object that has expr
	const dep = dependencyMap[hash];
	if (!dep) return null;
	for (const pid of dep.depends || []) {
		if (pointDependencies[pid] && pointDependencies[pid].expr) return pointDependencies[pid];
	}
	return null;
}

// Numeric intersection helpers (return array of {x,y})
function numericIntersectArcArc(a,b,c,d) {
	const A = pointCoords(a), B = pointCoords(b), C = pointCoords(c), D = pointCoords(d);
	if (!A||!B||!C||!D) return [];
	const x0 = A.x, y0 = A.y, r0 = Math.hypot(B.x - A.x, B.y - A.y);
	const x1 = C.x, y1 = C.y, r1 = Math.hypot(D.x - C.x, D.y - C.y);
	const dx = x1 - x0, dy = y1 - y0;
	const dist = Math.hypot(dx, dy);
	// no intersection or contained
	if (dist > r0 + r1 + 1e-12) return [];
	if (dist < Math.abs(r0 - r1) - 1e-12) return [];
	if (dist < 1e-12 && Math.abs(r0 - r1) < 1e-12) return [];
	const a_ = (r0*r0 - r1*r1 + dist*dist) / (2*dist);
	const x2 = x0 + dx * (a_ / dist);
	const y2 = y0 + dy * (a_ / dist);
	let h2 = r0*r0 - a_*a_;
	if (h2 < -1e-12) return [];
	h2 = Math.max(0, h2);
	const h = Math.sqrt(h2);
	const rx = -dy * (h / dist);
	const ry = dx * (h / dist);
	const p1 = { x: x2 + rx, y: y2 + ry };
	const p2 = { x: x2 - rx, y: y2 - ry };
	if (h < 1e-12) return [p1];
	return [p1, p2];
}

function numericIntersectArcLine(a,b,c,d) {
	const A = pointCoords(a), B = pointCoords(b), E1 = pointCoords(c), E2 = pointCoords(d);
	if (!A||!B||!E1||!E2) return [];
	const cx = A.x, cy = A.y, r = Math.hypot(B.x - A.x, B.y - A.y);
	const ex = E1.x, ey = E1.y, lx = E2.x, ly = E2.y;
	const vx = lx - ex, vy = ly - ey;
	const fx = ex - cx, fy = ey - cy;
	const aa = vx*vx + vy*vy;
	const bb = 2*(fx*vx + fy*vy);
	const cc = fx*fx + fy*fy - r*r;
	const disc = bb*bb - 4*aa*cc;
	if (disc < -1e-12) return [];
	const sd = Math.sqrt(Math.max(0, disc));
	// order: choose (+) first to match symbolic expr ordering in exprArcLine
	const t_plus = (-bb + sd) / (2*aa);
	const t_minus = (-bb - sd) / (2*aa);
	const p_plus = { x: ex + t_plus*vx, y: ey + t_plus*vy };
	const p_minus = { x: ex + t_minus*vx, y: ey + t_minus*vy };
	if (Math.abs(t_plus - t_minus) < 1e-12) return [p_plus];
	return [p_plus, p_minus];
}

function chooseExprForPid(pid, expr1, expr2) {
  // numeric chooser: compute numeric intersection candidates from parents and pick the closest
  const P = pointCoords(pid); // pointCoords not window.points
  if (!P) { console.warn(`no numeric position for pid ${pid}`); return expr1; }
  const dep = pointDependencies[pid];
  if (!dep || !dep.parents || dep.parents.length < 2) return expr1;
  const obj1 = dep.parents[0];
  const obj2 = dep.parents[dep.parents.length - 1];
  let candidates = [];
  try {
    if (obj1.includes('A') && obj2.includes('A')) {
      const [a1,b1] = obj1.split(/A|L/).map(Number);
      const [a2,b2] = obj2.split(/A|L/).map(Number);
      candidates = numericIntersectArcArc(a1,b1,a2,b2);
    } else {
      let arcHash = obj1.includes('A') ? obj1 : obj2;
      let lineHash = obj1.includes('L') ? obj1 : obj2;
      const [ac, ae] = arcHash.split(/A|L/).map(Number);
      const [lp1, lp2] = lineHash.split(/A|L/).map(Number);
      candidates = numericIntersectArcLine(ac, ae, lp1, lp2);
    }
  } catch (e) {
    console.warn('chooseExprForPid numeric intersection failed', e);
  }
  if (!candidates || candidates.length === 0) {console.warn(`no numeric intersection candidates for p${pid}`);return null};
  let bestIdx = 0; let bestDist = Infinity;
  for (let i = 0; i < candidates.length; i++) {
	const q = candidates[i]; if (!q) continue;
	const d = Math.hypot(P.x - q.x, P.y - q.y); // I'll patch this at pointCoords() P.y - (-q.y) because canvas coords are inverted, unit length in window.points is 256
	if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return (bestIdx === 1) ? expr2 : expr1;
}

function ensureExprForHash(hash) {
  const dep = dependencyMap[hash];
  if (!dep || !dep.depends) return;
  for (const pid of dep.depends) ensureExpr(pid);
}

// --- hooks ---
// ---- makeline / makearc: register pending object with a before snapshot ----
const orig_makeline = window.makeline;
window.makeline = function(p1, p2, spec) {
    // snapshot before invoking engine (keep for pendingObjects diff)
    const beforeSet = snapshotPointIds();
	const aId = (p1 && typeof p1 === 'object' && typeof p1.id !== 'undefined') ? Number(p1.id) : Number(p1);
	const bId = (p2 && typeof p2 === 'object' && typeof p2.id !== 'undefined') ? Number(p2.id) : Number(p2);
	const hash = String(`${aId}L${bId}`);
	console.debug(`makeline: snapshot before has ${beforeSet.size} points`);
    const res = orig_makeline.apply(this, arguments);
	console.debug(`makeline: created pending object ${hash}`);
    // register pending object — the engine will add points later in changes.record
    pendingObjects.push({ hash, beforeIds: beforeSet, type: 'line', meta: { a: Number(p1.id), b: Number(p2.id) } });
    return res;
};

const orig_makearc = window.makearc;
window.makearc = function(c, e, r, spec) {
    const beforeSet = snapshotPointIds();
	const aId = (c && typeof c === 'object' && typeof c.id !== 'undefined') ? Number(c.id) : Number(c);
	const bId = (e && typeof e === 'object' && typeof e.id !== 'undefined') ? Number(e.id) : Number(e);
	const hash = String(`${aId}L${bId}`);
	console.debug(`makearc: snapshot before has ${beforeSet.size} points`);
    const res = orig_makearc.apply(this, arguments);
	console.debug(`makearc: created pending object ${hash}`);
    pendingObjects.push({ hash, beforeIds: beforeSet, type: 'arc', meta: { a: Number(c.id), b: Number(e.id) } });
    return res;
};

// ---- helper: build full objects list (all arcs/reallines). ensure the pendingObjectHash is included up front ----
function collectAllObjectsWith(hashToPrepend) {
    const objects = [];
    for (let k = 0; k < changes.length; k++) {
        const ch = changes[k];
        if (ch?.type === 'arc') objects.push(`${String(ch.a)}A${String(ch.b)}`);
        if (ch?.type === 'realline') objects.push(`${String(ch.a)}L${String(ch.b)}`);
    }
    // put the newly-created object first to help pair matching
    if (hashToPrepend && !objects.includes(hashToPrepend)) objects.unshift(hashToPrepend);
    return objects;
}

// helper: recursively flag pointDependencies for a given object hash
function flagDependenciesForHash(hash, visitedHashes = new Set()) {
	if (!hash || visitedHashes.has(hash)) return;
	visitedHashes.add(hash);

	// derive numeric point ids from hash (works for 'aLb' and 'aAb')
	const ids = String(hash).split(/A|L/).map(x => Number(x)).filter(n => !isNaN(n));
	for (const pid of ids) {
		if (pid === 0 || pid === 1) continue; // base points
		// ensure entry exists for this pid
		if (!pointDependencies[pid]) {
			// if we don't have a dependency skeleton for this pid, skip — it will be discovered by describeIntersectionFromObjects
			continue;
		}
		// if already has expr or already flagged, skip recursing
		if (pointDependencies[pid].expr) continue;
		if (pointDependencies[pid].flag) continue;

		// flag it
		pointDependencies[pid].flag = true;
		console.debug(`flagDependenciesForHash: flagged p${pid} for hash ${hash}, reconfirm:`, pointDependencies[pid].flag);

		// recurse into its parents (object hashes)
		const parents = pointDependencies[pid].parents || [];
		for (const ph of parents) {
			if (typeof ph === 'string' && ph.length) flagDependenciesForHash(ph, visitedHashes);
		}
	}
}

// helper: process all flagged points (compute expr) — does not unflag
function processFlaggedPoints() {
	const flagged = Object.keys(pointDependencies).filter(k => pointDependencies[k]?.flag && !pointDependencies[k]?.expr).map(Number);
	if (!flagged.length) return;
	console.debug('processFlaggedPoints: will ensureExpr for', flagged);
	for (const pid of flagged) {
		try {
			ensureExpr(pid);
			// optionally simplify but only if nerdamer enabled
			if (USE_NERDAMER) {
				try { simplifyPoint(pid); } catch (e) { console.debug('simplifyPoint failed for', pid, e); }
			}
		} catch (e) {
			console.debug('processFlaggedPoints: ensureExpr failed for', pid, e);
		}
	}
}

// ---- changes.record flush: compute afterSet, resolve pendingObjects by diffing against their beforeIds ----
const orig_record = changes.record;
changes.record = function(finished) {
    const r = orig_record.apply(this, arguments);

    if (pendingObjects.length) {
        // snapshot after engine finalized points
        const afterAll = snapshotPointIds();
        console.debug(`changes.record: processing ${pendingObjects.length} pendingObjects; afterAll size=${afterAll.size}`);
        console.debug(pendingObjects);

        // process each pending object (FIFO)
        for (const pend of pendingObjects) {
            try {
                if (!pend || !pend.hash) return r;

                console.debug("Record patch: processing object", pend.hash, pend.type);
                if (!dependencyMap[pend.hash]) { // temp seeding
                    dependencyMap[pend.hash] = {
                        type: pend.type,
                        depends: [], // may be incomplete
                        obj: null,
                    };
                }

                // compute new pids for this pending object
                const newPids = [...afterAll].filter(x => !pend.beforeIds.has(x)).map(Number);
                console.debug(`pending ${pend.hash} -> newPids:`, newPids);

                // build objects list including the newly-created object hash
                const objects = collectAllObjectsWith(pend.hash);
                console.debug("pendingObjects: ",pendingObjects,"pend: ",pend," pend.hash: ", pend.hash);// more debug

                // call describeIntersectionFromObjects for each newly created pid
                for (const pid of newPids) {
                    console.debug(`Record: resolving p${pid} for ${pend.hash} against ${objects.length} objects, ${objects}`);
                    console.debug('pend.meta: ', pend.meta);
                    describeIntersectionFromObjects(Number(pid), objects);
                    if (pointDependencies[pid]) {
                        console.debug(`Record: p${pid} added pointDependencies:`, pointDependencies[pid]);
                    } else {
                        console.debug(`Record: p${pid} had no pointDependencies after describeIntersectionFromObjects`);
                    }
                }

                // ---- NEW: flag dependency skeleton from this pending object and recurse ----
                try {
                    if (pend.hash) {
                        flagDependenciesForHash(pend.hash);
                    }
                } catch (e) { console.debug('flagDependenciesForHash error', e); }

                // process flagged points: compute exprs for the flagged set // uncomment to process
                try { processFlaggedPoints(); } catch(e) { console.debug('processFlaggedPoints error', e); }

                // After processing newPids, simplify any dependencies directly referencing this hash and cache lengths
                if (pend.hash) {
                    try { const simplifiedList = simplifyDependenciesForHash(pend.hash); console.debug(`simplified deps for ${pend.hash}:`, simplifiedList); } catch(e){ console.debug('simplifyDependenciesForHash failed', e); }
                    try { const cached = cacheLengthForHash(pend.hash); /*console.debug(`cacheLengthForHash(${pend.hash}) ->`, cached);*/ } catch(e){ console.debug('cacheLengthForHash failed for', pend.hash, e); }
                }
            } catch (err) {
                console.error('Error resolving pending object', pend, err);
            }
        }

        // clear pendingObjects after processing
        pendingObjects = [];
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
	pendingPids = [];
	// cache lengths/radii for all dependencyMap entries (best-effort)
	for (let h of Object.keys(dependencyMap)) {
		try { cacheLengthForHash(h); } catch(e) { console.debug('cacheLengthForHash error for', h, e); }
	}
	addLog();
	realmoveCount = modules?.test?.score?.() || 0;
	return res;
};

// ---- redo: capture before/after and register pendingObject (so record will resolve it) ----
const orig_redo = changes.redo;
changes.redo = function() { // TODO: there's some problems with pointdependencies coming back from redo, some are missing
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
	addLog();
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
				// remove symbolicPoints entry except p0/p1
				try {
					const pidStr = String(pid);
					if (symbolicPoints && pidStr !== '0' && pidStr !== '1') delete symbolicPoints[pidStr];
				} catch(e) { /* ignore */ }
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
