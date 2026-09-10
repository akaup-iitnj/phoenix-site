/* Phoenix Industrial Labs: orbiting facility model (three.js r128, UMD global THREE) */
(function () {
  var host = document.getElementById('hero3d');
  if (!host || !window.THREE) return;
  var mark = function (n) { if (window.performance && performance.mark) performance.mark('f3d:' + n); };
  mark('start');
  var fallback = document.getElementById('hero-fallback');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var STILL = host.hasAttribute('data-still');   // headless render mode: one frame, report zone positions
  var T = THREE;

  var renderer, isTouch = window.matchMedia('(pointer: coarse)').matches;
  /* Phase 0: the WebGL context (the single most expensive step on low-end hardware) */
  function createRenderer() {
    try {
      renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: STILL });
    } catch (e) { host.setAttribute('data-3d', 'unsupported'); return false; }   // the still image stays in place
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.6 : 2));
    renderer.setClearColor(0xF5F5F3, 1);
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.domElement.style.touchAction = 'pan-y';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.appendChild(renderer.domElement);
    mark('renderer');
    return true;
  }

  var scene = new T.Scene();
  scene.background = new T.Color(0xF5F5F3);

  /* ---------- materials ---------- */
  function mat(hex, opts) { var m = new T.MeshStandardMaterial(Object.assign({ roughness: 0.92, metalness: 0.0 }, opts || {})); m.color.setHex(hex).convertSRGBToLinear(); return m; }
  var M = {
    slab: mat(0xC3C5C3), floor: mat(0xB6BAB8), green: mat(0x7DB2A2, { roughness: 0.75 }), tape: mat(0xE6C33A, { roughness: 0.7 }),
    wall: mat(0xEDEDEA), white: mat(0xF2F2F0, { roughness: 0.8 }), dark: mat(0x2C2F32), blue: mat(0x3F6FAF), orange: mat(0xE06A2C, { roughness: 0.6 }),
    grey: mat(0x9A9EA1), yellow: mat(0xE8C52E, { roughness: 0.6 }), plant: mat(0x4F8A5B), joint: mat(0x3A3D40, { roughness: 0.5 }),
    mesh: mat(0x6F7377, { roughness: 0.9, transparent: true, opacity: 0.22, depthWrite: false, side: T.DoubleSide }),
    screen: mat(0x1C2B3A, { roughness: 0.35 }),
    shadow: new T.ShadowMaterial({ opacity: 0.16 })
  };
  M.wallBack = mat(0xEDEDEA, { transparent: true }); M.wallLeft = mat(0xEDEDEA, { transparent: true });

  var root = new T.Group(); scene.add(root);
  var box = new T.BoxGeometry(1, 1, 1);
  var cyl = new T.CylinderGeometry(1, 1, 1, 18);
  var sph = new T.SphereGeometry(1, 16, 12);

  /* Primitives are recorded as instances (base geometry + world matrix) and merged per material later,
     instead of creating ~1,500 Mesh objects. Parents (Groups) must be positioned before children are added. */
  var buckets = {}, bucketOrder = [];
  var _q = new T.Quaternion(), _p = new T.Vector3(), _s = new T.Vector3(), _e = new T.Euler();
  function worldOf(parent) { var m = new T.Matrix4(), o = parent; while (o && o !== root) { o.updateMatrix(); m.premultiply(o.matrix); o = o.parent; } return m; }
  function inst(geo, m, cast, recv, px, py, pz, ry, sx, sy, sz, parent) {
    var key = m.uuid + '|' + (cast ? 1 : 0) + (recv ? 1 : 0), b = buckets[key];
    if (!b) { b = buckets[key] = { mat: m, cast: cast, recv: recv, items: [], verts: 0, idx: 0 }; bucketOrder.push(key); }
    _e.set(0, ry || 0, 0); _q.setFromEuler(_e); _p.set(px, py, pz); _s.set(sx, sy, sz);
    var world = new T.Matrix4().compose(_p, _q, _s);
    if (parent && parent !== root) world.premultiply(worldOf(parent));
    b.items.push({ g: geo, w: world }); b.verts += geo.attributes.position.count; b.idx += geo.index.count;
  }
  function B(m, w, h, d, x, y, z, ry, castShadow, parent) { inst(box, m, castShadow !== false, true, x, y + h / 2, z, ry, w, h, d, parent); }
  function C(m, r, h, x, y, z, parent) { inst(cyl, m, true, true, x, y + h / 2, z, 0, r, h, r, parent); }
  function S(m, r, x, y, z, parent) { inst(sph, m, true, false, x, y, z, 0, r, r, r, parent); }
  function pad(m, w, d, x, z, y) { inst(box, m, false, true, x, (y || 0) + 0.01, z, 0, w, 0.02, d, null); }
  function tapeRect(w, d, x, z, y) { var t = 0.12, yy = (y || 0) + 0.03; pad(M.tape, w, t, x, z - d / 2, yy); pad(M.tape, w, t, x, z + d / 2, yy); pad(M.tape, t, d, x - w / 2, z, yy); pad(M.tape, t, d, x + w / 2, z, yy); }

  /* Shared between the build phases */
  var SW, SD, WH, WT, wallBack, wallLeft;

  /* Phase 1: build the scene from primitives */
  function buildScene() {
    /* ---------- slab, floors, walls ---------- */
    SW = 48; SD = 32; // slab width (x) and depth (z)
    B(M.slab, SW, 0.5, SD, 0, -0.5, 0, 0, false);            // slab body, top at y=0
    pad(M.floor, SW - 0.02, SD - 0.02, 0, 0, 0);              // base floor (rooms and perimeter walkway)
    pad(M.green, 30.2, 28.4, 8.9, -1.2, 0.004);               // hall floor, green epoxy
    [-5.75, 0.0, 6.25, 12.75, 18.8].forEach(function (ax) { pad(M.floor, 1.6, 28.4, ax, -1.2, 0.008); }); // grey aisles between rows
    var ground = new T.Mesh(new T.PlaneGeometry(200, 200), M.shadow); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.5; ground.receiveShadow = true; scene.add(ground);

    WH = 5.2; WT = 0.25;
    B(M.wallBack, SW, WH, WT, 0, 0, -SD / 2 + WT / 2);   // back wall (outward normal -z)
    B(M.wallLeft, WT, WH, SD, -SW / 2 + WT / 2, 0, 0);   // left wall (outward normal -x)
    for (var px = -20; px <= 22; px += 6) { B(M.white, 0.9, 0.6, 0.04, px, 2.6, -SD / 2 + WT + 0.02, 0, false); B(M.blue, 0.35, 0.28, 0.02, px - 0.2, 2.9, -SD / 2 + WT + 0.05, 0, false); }
    for (var pz = -12; pz <= 12; pz += 6) { B(M.white, 0.04, 0.6, 0.9, -SW / 2 + WT + 0.02, 2.6, pz, 0, false); B(M.blue, 0.02, 0.28, 0.35, -SW / 2 + WT + 0.05, 2.9, pz - 0.2, 0, false); }

    /* ---------- rooms along the left wall: storage, computer classroom, theory classroom ---------- */
    var RH = 3.2, RT = 0.15;
    // storage: one room along the back wall, x -24..-12, z -16..-10
    B(M.wall, 12, RH, RT, -18, 0, -10);
    B(M.wall, RT, RH, 6, -12, 0, -13);
    function rack(rx, rz, ry) {
      var g = new T.Group(); g.position.set(rx, 0, rz); g.rotation.y = ry || 0; root.add(g);
      for (var s = 0; s < 4; s++) B(M.grey, 2.4, 0.05, 0.8, 0, 0.35 + s * 0.65, 0, 0, false, g);
      [[-1.2, -0.4], [1.2, -0.4], [-1.2, 0.4], [1.2, 0.4]].forEach(function (p) { B(M.orange, 0.06, 2.4, 0.06, p[0], 0, p[1], 0, true, g); });
      for (var bb = 0; bb < 3; bb++) B(M.blue, 0.5, 0.35, 0.6, -0.8 + bb * 0.8, 0.4 + (bb % 2) * 0.65, 0, 0, false, g);
      B(M.white, 0.5, 0.35, 0.6, 0.8, 1.7, 0, 0, false, g); B(M.white, 0.5, 0.35, 0.6, -0.8, 1.7, 0, 0, false, g);
    }
    rack(-22.4, -15.0); rack(-19.6, -15.0); rack(-16.8, -15.0);
    rack(-22.4, -12.4); rack(-19.6, -12.4);
    for (var c = 0; c < 3; c++) B(M.grey, 0.8, 2.0, 0.6, -14.6 + c * 0.9, 0, -15.3);   // tool cabinets
    B(M.white, 2.0, 0.9, 0.7, -14.4, 0, -11.4);                                        // issue counter

    // computer classroom: x -24..-12, z -10..0
    B(M.wall, RT, RH, 10, -12, 0, -5);
    B(M.wall, 12, RH, RT, -18, 0, 0);
    pad(M.white, 11.7, 9.7, -18, -5, 0.005);
    for (var row = 0; row < 4; row++) for (var k = 0; k < 3; k++) {
      var dx = -21.5 + k * 3.0, dz = -8.2 + row * 2.0;
      B(M.white, 2.2, 0.06, 0.6, dx, 0.72, dz); B(M.dark, 0.5, 0.7, 0.5, dx - 0.6, 0, dz, 0, false); B(M.dark, 0.5, 0.7, 0.5, dx + 0.6, 0, dz, 0, false);
      B(M.screen, 0.45, 0.3, 0.03, dx - 0.6, 0.85, dz - 0.15, 0, false); B(M.screen, 0.45, 0.3, 0.03, dx + 0.6, 0.85, dz - 0.15, 0, false);
      B(M.dark, 0.45, 0.45, 0.45, dx - 0.6, 0, dz + 0.75, 0, false); B(M.dark, 0.45, 0.45, 0.45, dx + 0.6, 0, dz + 0.75, 0, false);
    }
    B(M.screen, 0.06, 1.6, 3.0, -SW / 2 + WT + 0.04, 1.2, -5, 0, false);
    B(M.white, 1.6, 0.75, 0.7, -22.6, 0, -9.0);

    // lab space with workbenches: x -24..-12, z 0..10
    M.wood = mat(0xC9A46A, { roughness: 0.7 });
    B(M.wall, RT, RH, 10, -12, 0, 5);
    B(M.wall, 12, RH, RT, -18, 0, 10);
    pad(M.white, 11.7, 9.7, -18, 5, 0.005);
    function workbench(bx, bz) {
      B(M.wood, 1.6, 0.06, 0.7, bx, 0.86, bz);
      [[-0.72, -0.28], [0.72, -0.28], [-0.72, 0.28], [0.72, 0.28]].forEach(function (p) { B(M.dark, 0.07, 0.86, 0.07, bx + p[0], 0, bz + p[1], 0, false); });
      B(M.dark, 1.44, 0.05, 0.05, bx, 0.3, bz - 0.28, 0, false); B(M.dark, 1.44, 0.05, 0.05, bx, 0.3, bz + 0.28, 0, false);
      B(M.blue, 0.42, 0.2, 0.28, bx - 0.5, 0.92, bz - 0.1, 0, false); B(M.grey, 0.3, 0.08, 0.18, bx + 0.45, 0.92, bz + 0.1, 0, false);
    }
    for (var wr = 0; wr < 3; wr++) for (var wk = 0; wk < 3; wk++) workbench(-21.6 + wk * 3.2, 2.0 + wr * 3.0);
    B(M.screen, 0.06, 1.4, 2.6, -SW / 2 + WT + 0.04, 1.3, 5, 0, false);   // wall display
    B(M.grey, 0.9, 2.0, 0.5, -12.6, 0, 1.0); B(M.grey, 0.9, 2.0, 0.5, -12.6, 0, 9.0); // tool cabinets by the door

    /* ---------- articulated robot ---------- */
    function robot(x, y, z, ry) {
      var g = new T.Group(); g.position.set(x, y, z); g.rotation.y = ry || 0; root.add(g);
      C(M.joint, 0.34, 0.12, 0, 0, 0, g);                       // base plate
      C(M.orange, 0.26, 0.5, 0, 0.12, 0, g);                    // base column
      var sh = new T.Group(); sh.position.set(0, 0.62, 0); g.add(sh);
      S(M.joint, 0.2, 0, 0, 0, sh);                              // shoulder joint
      var upper = new T.Group(); upper.rotation.z = 0.55; sh.add(upper);
      B(M.orange, 0.26, 1.1, 0.26, 0, 0, 0, 0, true, upper);     // upper arm, from the joint outward
      var elbow = new T.Group(); elbow.position.set(0, 1.1, 0); upper.add(elbow);
      S(M.joint, 0.17, 0, 0, 0, elbow);
      var fore = new T.Group(); fore.rotation.z = -1.35; elbow.add(fore);
      B(M.orange, 0.2, 0.95, 0.2, 0, 0, 0, 0, true, fore);       // forearm
      var wrist = new T.Group(); wrist.position.set(0, 0.95, 0); wrist.rotation.z = 0.45; fore.add(wrist);
      S(M.joint, 0.13, 0, 0, 0, wrist);
      C(M.joint, 0.09, 0.22, 0, 0, 0, wrist);                    // wrist flange
      B(M.joint, 0.08, 0.22, 0.05, -0.08, 0.22, 0, 0, false, wrist); B(M.joint, 0.08, 0.22, 0.05, 0.08, 0.22, 0, 0, false, wrist); // gripper fingers
      return g;
    }

    /* ---------- main hall rows ---------- */
    M.red = mat(0xC8302A, { roughness: 0.6 }); M.glass = mat(0x9FB3C4, { roughness: 0.15, metalness: 0.05, transparent: true, opacity: 0.35 }); M.alu = mat(0xB8BCC0, { roughness: 0.4, metalness: 0.3 });
    function trainer(x, z, ry) {
      var g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = ry || 0; root.add(g);
      B(M.white, 1.6, 0.85, 1.1, 0, 0, 0, 0, true, g);                                  // cabinet
      B(M.dark, 0.6, 0.55, 0.5, -0.4, 0.1, -0.1, 0, false, g); B(M.dark, 0.6, 0.55, 0.5, 0.4, 0.1, -0.1, 0, false, g); // controllers inside
      B(M.glass, 1.5, 0.6, 0.02, 0, 0.12, 0.555, 0, false, g);                          // glass doors
      B(M.red, 1.6, 0.17, 0.03, 0, 0.83, 0.56, 0, false, g);                             // control band
      [-0.5, -0.35, -0.2, 0.15, 0.3].forEach(function (bx) { B(M.dark, 0.06, 0.06, 0.02, bx, 0.885, 0.58, 0, false, g); });
      B(M.screen, 0.24, 0.12, 0.02, 0.6, 0.86, 0.58, 0, false, g);                       // HMI
      B(M.alu, 1.5, 0.04, 1.0, 0, 0.85, 0, 0, false, g);                                 // deck plate
      B(M.alu, 1.4, 0.08, 0.08, 0, 0.89, 0.1, 0, false, g);                              // conveyor rail
      B(M.dark, 0.5, 0.1, 0.16, -0.3, 0.97, 0.1, 0, false, g);                           // conveyor belt segment
      [[-0.55, -0.3], [-0.1, -0.3], [0.35, -0.3]].forEach(function (p) { C(M.alu, 0.05, 0.42, p[0], 0.89, p[1], g); B(M.blue, 0.14, 0.12, 0.14, p[0], 1.31, p[1], 0, false, g); }); // pneumatic modules
      B(M.grey, 0.3, 0.3, 0.3, 0.55, 0.89, -0.25, 0, true, g); C(M.dark, 0.08, 0.2, 0.55, 1.19, -0.25, g);  // sorting module
      C(M.white, 0.03, 0.95, -0.72, 0.89, -0.5, g); C(M.white, 0.03, 0.95, 0.72, 0.89, -0.5, g);           // overhead frame posts
      B(M.white, 1.5, 0.05, 0.05, 0, 1.84, -0.5, 0, false, g);                                            // frame bar
      B(M.screen, 0.62, 0.36, 0.03, -0.35, 1.45, -0.48, 0, false, g); B(M.screen, 0.62, 0.36, 0.03, 0.35, 1.45, -0.48, 0, false, g); // two monitors
      return g;
    }
    function stationRow(x) {
      tapeRect(4.2, 28, x, -1, 0.01);
      for (var i = 0; i < 6; i++) {
        var z = -13 + i * 4.6;
        trainer(x - 0.5, z, Math.PI / 2);                                                 // faces the aisle
        B(M.dark, 0.45, 0.45, 0.45, x + 1.1, 0, z + 0.4, 0, false); B(M.dark, 0.45, 0.45, 0.45, x + 1.1, 0, z - 0.6, 0, false); // stools
      }
    }
    function cellRow(x, count, spacing) {
      tapeRect(4.6, 28, x, -1, 0.01);
      for (var i = 0; i < count; i++) {
        var z = -12 + i * spacing;
        var fw = 3.6, fd = 3.6, fh = 1.9;
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) { C(M.yellow, 0.06, fh, x + p[0] * fw / 2, 0, z + p[1] * fd / 2); });
        B(M.yellow, fw, 0.06, 0.06, x, fh - 0.06, z - fd / 2, 0, false); B(M.yellow, fw, 0.06, 0.06, x, fh - 0.06, z + fd / 2, 0, false);
        B(M.yellow, 0.06, 0.06, fd, x - fw / 2, fh - 0.06, z, 0, false); B(M.yellow, 0.06, 0.06, fd, x + fw / 2, fh - 0.06, z, 0, false);
        B(M.mesh, fw, fh - 0.2, 0.01, x, 0.1, z - fd / 2, 0, false); B(M.mesh, fw, fh - 0.2, 0.01, x, 0.1, z + fd / 2, 0, false);
        B(M.mesh, 0.01, fh - 0.2, fd, x - fw / 2, 0.1, z, 0, false); B(M.mesh, 0.01, fh - 0.2, fd, x + fw / 2, 0.1, z, 0, false);
        B(M.grey, 1.0, 0.7, 1.0, x - 0.7, 0, z - 0.4);                                   // plinth
        robot(x - 0.7, 0.7, z - 0.4, 0.4 + (i % 2) * 0.9);                                // robot on the plinth
        B(M.white, 1.5, 0.85, 0.8, x + 0.85, 0, z + 0.7); B(M.grey, 0.5, 1.1, 0.5, x + 1.3, 0, z - 1.1); B(M.screen, 0.36, 0.26, 0.03, x + 1.3, 1.15, z - 0.85, 0, false);
        C(M.yellow, 0.13, 3.6, x + 1.5, 0, z - 1.5); B(M.yellow, 0.16, 0.16, 2.6, x + 1.5, 3.45, z - 0.2, 0, true); B(M.dark, 0.2, 0.3, 0.25, x + 1.5, 3.05, z + 0.4, 0, false); B(M.yellow, 0.3, 0.3, 0.3, x + 1.5, 3.55, z - 1.5, 0, false);
      }
    }
    function benchRow(x) {
      tapeRect(4.2, 28, x, -1, 0.01);
      for (var i = 0; i < 3; i++) {
        var z = -10 + i * 8.5;
        B(M.white, 1.3, 0.9, 4.2, x, 0, z); for (var s = 0; s < 3; s++) { C(M.dark, 0.2, 0.45, x - 1.05, 0, z - 1.4 + s * 1.4); C(M.dark, 0.2, 0.45, x + 1.05, 0, z - 1.4 + s * 1.4); }
        B(M.grey, 0.8, 1.2, 0.6, x + 1.4, 0, z + 3.2); B(M.blue, 0.82, 0.5, 0.05, x + 1.4, 0.4, z + 3.5, 0, false);
      }
    }
    stationRow(-8.5); stationRow(-3.0);
    cellRow(3.0, 4, 6.6); cellRow(9.5, 4, 6.6); cellRow(16.0, 4, 6.6);
    benchRow(21.6);
    [[-5.8, 6.5], [6.3, -4.0], [12.8, 9.5], [19.0, -8.5]].forEach(function (p) { B(M.grey, 0.7, 1.0, 1.1, p[0], 0, p[1]); B(M.blue, 0.72, 0.4, 0.06, p[0], 0.45, p[1] - 0.58, 0, false); B(M.white, 0.72, 0.05, 1.12, p[0], 1.0, p[1], 0, false); });
    pad(M.tape, 36, 0.12, 6, 15.2, 0.03); pad(M.tape, 0.12, 31, 23.4, 0, 0.03);
  }

  /* Phase 2: merge static meshes per material (~1,500 draw calls become ~20) */
  function mergeScene() {
    mark('built');
    var byMaterial = {}, nm = new T.Matrix3(), v = new T.Vector3();
    bucketOrder.forEach(function (k) {
      var b = buckets[k];
      var pos = new Float32Array(b.verts * 3), nor = new Float32Array(b.verts * 3);
      var idx = b.verts > 65535 ? new Uint32Array(b.idx) : new Uint16Array(b.idx);
      var vo = 0, io = 0;
      b.items.forEach(function (it) {
        var P = it.g.attributes.position.array, N = it.g.attributes.normal.array, I = it.g.index.array, n = it.g.attributes.position.count;
        nm.getNormalMatrix(it.w);
        for (var i = 0; i < n; i++) {
          var o = (vo + i) * 3;
          v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(it.w); pos[o] = v.x; pos[o + 1] = v.y; pos[o + 2] = v.z;
          v.set(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]).applyMatrix3(nm).normalize(); nor[o] = v.x; nor[o + 1] = v.y; nor[o + 2] = v.z;
        }
        for (var q = 0; q < I.length; q++) idx[io + q] = I[q] + vo;
        vo += n; io += I.length;
      });
      var geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
      geo.setIndex(new T.BufferAttribute(idx, 1));
      var mesh = new T.Mesh(geo, b.mat); mesh.castShadow = b.cast; mesh.receiveShadow = b.recv; mesh.frustumCulled = false; scene.add(mesh);
      byMaterial[b.mat.uuid] = mesh;
    });
    wallBack = byMaterial[M.wallBack.uuid]; wallLeft = byMaterial[M.wallLeft.uuid];
    mark('merged');
  }

  /* Phase 3: lights, camera, interaction, first frame */
  function present() {
    /* ---------- zones (for the walk chapter still) ---------- */
    var ZONES = { rooms: [-18, 1.2, 0.5], trainers: [-5.7, 1.4, -1], floor: [12.5, 1.8, -1.5] };

    /* ---------- lights ---------- */
    scene.add(new T.HemisphereLight(0xffffff, 0xd6d7d3, 0.56));
    var sun = new T.DirectionalLight(0xffffff, 0.9); sun.position.set(-34, 48, 30); sun.castShadow = true;
    var SM = STILL ? 4096 : (isTouch ? 1536 : 2048);
    sun.shadow.mapSize.set(SM, SM); sun.shadow.camera.left = -40; sun.shadow.camera.right = 40; sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40; sun.shadow.camera.near = 10; sun.shadow.camera.far = 140; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
    scene.add(sun);
    var fill = new T.DirectionalLight(0xffffff, 0.18); fill.position.set(40, 20, -30); scene.add(fill);

    /* ---------- camera and orbit ---------- */
    var camera = new T.PerspectiveCamera(30, 16 / 9, 1, 500);
    var target = new T.Vector3(-1, 0.6, 0.5);
    var az = parseFloat(host.getAttribute('data-az') || '-0.62'), el = parseFloat(host.getAttribute('data-el') || '0.62'), elMin = 0.28, elMax = 1.15;
    var dist = 80, distTarget = 80, _v = new T.Vector3();
    // pan: a world-space shift of the whole camera rig that keeps the model's projected bounding box centred in the
    // canvas (the orbit target alone leaves the near, larger-looking half hanging lower); the still is trimmed the same way
    var pan = new T.Vector3(), panTarget = new T.Vector3(), _p = new T.Vector3(), _look = new T.Vector3(), _r = new T.Vector3(), _u = new T.Vector3();
    var corners = [];   // slab corners, plus the tops of the two walls (the open front-right corner has nothing at wall height)
    [-SW / 2, SW / 2].forEach(function (x) { [-0.5, WH].forEach(function (y) { [-SD / 2, SD / 2].forEach(function (z) { if (!(y === WH && x > 0 && z > 0)) corners.push(new T.Vector3(x, y, z)); }); }); });
    function placeCameraAt(d, p) {
      p = p || pan;
      camera.position.set(target.x + p.x + d * Math.cos(el) * Math.sin(az), target.y + p.y + d * Math.sin(el), target.z + p.z + d * Math.cos(el) * Math.cos(az));
      _look.copy(target).add(p); camera.lookAt(_look); camera.updateMatrixWorld();
    }
    function fitDist(snap) {
      var d = dist, p = _p.copy(pan), tanH = Math.tan(camera.fov * Math.PI / 360);
      for (var it = 0; it < 3; it++) {
        placeCameraAt(d, p);
        var x0 = 9, x1 = -9, y0 = 9, y1 = -9;
        for (var i = 0; i < corners.length; i++) { _v.copy(corners[i]).project(camera); x0 = Math.min(x0, _v.x); x1 = Math.max(x1, _v.x); y0 = Math.min(y0, _v.y); y1 = Math.max(y1, _v.y); }
        d *= Math.max((x1 - x0) / 2, (y1 - y0) / 2) / 0.97;            // the box spans 97% of the canvas on its longer side
        var halfH = d * tanH;                                          // then slide the rig so the box sits in the middle
        _r.setFromMatrixColumn(camera.matrixWorld, 0); _u.setFromMatrixColumn(camera.matrixWorld, 1);
        p.addScaledVector(_r, (x0 + x1) / 2 * halfH * camera.aspect).addScaledVector(_u, (y0 + y1) / 2 * halfH);
      }
      distTarget = d; panTarget.copy(p);
      if (snap) { dist = d; pan.copy(p); }
    }
    function fit() {
      var w = host.clientWidth, h = host.clientHeight || Math.round(w * 9 / 16);
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      fitDist(true);
    }
    function fadeWalls() {
      var cx = Math.sin(az), cz = Math.cos(az);
      var ob = T.MathUtils.clamp(1 - (-cz - 0.55) * 4, 0.12, 1), ol = T.MathUtils.clamp(1 - (-cx - 0.55) * 4, 0.12, 1);
      M.wallBack.opacity = ob; wallBack.castShadow = ob > 0.6; M.wallLeft.opacity = ol; wallLeft.castShadow = ol > 0.6;
    }
    fit();

    if (STILL) {
      placeCameraAt(dist); fadeWalls(); renderer.render(scene, camera);
      var out = {};
      Object.keys(ZONES).forEach(function (k) { var p = ZONES[k]; _v.set(p[0], p[1], p[2]).project(camera); out[k] = [(_v.x + 1) / 2 * 100, (1 - _v.y) / 2 * 100]; });
      var minx = 100, maxx = 0, miny = 100, maxy = 0;
      corners.forEach(function (c) { _v.copy(c).project(camera); var X = (_v.x + 1) / 2 * 100, Y = (1 - _v.y) / 2 * 100; minx = Math.min(minx, X); maxx = Math.max(maxx, X); miny = Math.min(miny, Y); maxy = Math.max(maxy, Y); });
      out.bbox = [minx, miny, maxx, maxy];
      window.__stillData = out; host.setAttribute('data-ready', '1');
      return;
    }

    var dragging = false, lastX = 0, lastY = 0, idleSince = 0, velAz = 0;
    var el0 = renderer.domElement;
    el0.addEventListener('pointerdown', function (e) { dragging = true; lastX = e.clientX; lastY = e.clientY; el0.setPointerCapture(e.pointerId); host.classList.add('grabbing'); });
    el0.addEventListener('pointermove', function (e) { if (!dragging) return; var dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY; az -= dx * 0.005; el = Math.max(elMin, Math.min(elMax, el + dy * 0.004)); velAz = -dx * 0.005; idleSince = performance.now(); });
    function endDrag() { dragging = false; host.classList.remove('grabbing'); }
    el0.addEventListener('pointerup', endDrag); el0.addEventListener('pointercancel', endDrag); el0.addEventListener('lostpointercapture', endDrag);

    var visible = true, running = false, lastT = 0;
    if ('IntersectionObserver' in window) { new IntersectionObserver(function (es) { es.forEach(function (e) { visible = e.isIntersecting; if (visible && !running) start(); }); }, { threshold: 0.02 }).observe(host); }
    document.addEventListener('visibilitychange', function () { if (!document.hidden && visible && !running) start(); });

    function frame(t) {
      if (!visible || document.hidden) { running = false; return; }
      var dt = Math.min(0.05, (t - lastT) / 1000 || 0.016); lastT = t;
      if (!dragging) {
        if (Math.abs(velAz) > 0.0002) { az += velAz * 0.9; velAz *= 0.90; }
        else if (!reduce && (performance.now() - idleSince) > 2200) { az += 0.11 * dt; }
      }
      fitDist(false); var k = Math.min(1, dt * 3); dist += (distTarget - dist) * k; pan.lerp(panTarget, k);
      placeCameraAt(dist); fadeWalls(); renderer.render(scene, camera);
      frames++; host.setAttribute('data-frames', String(frames)); host.setAttribute('data-az', az.toFixed(3));
      requestAnimationFrame(frame);
    }
    var frames = 0;
    function start() { running = true; lastT = performance.now(); requestAnimationFrame(frame); }
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(fit, 100); });
    placeCameraAt(dist); fadeWalls(); renderer.render(scene, camera); mark('rendered');
    host.classList.add('is-live'); host.setAttribute('data-3d', 'live');   // crossfade from the still to the live model
    start();
  }

  /* Run the phases as separate tasks so the page stays responsive while the model is prepared */
  var phases = [createRenderer, buildScene, mergeScene, present];
  function runPhase() { var f = phases.shift(); if (!f) return; if (f() === false) return; if (phases.length) setTimeout(runPhase, 0); }
  if (STILL) { if (createRenderer()) { buildScene(); mergeScene(); present(); } } else runPhase();
})();
