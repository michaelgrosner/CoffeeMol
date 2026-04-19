'use strict';

// ===== Prototype extensions =====

if (typeof String.prototype.startswith !== 'function') {
    String.prototype.startswith = function(str) { return this.slice(0, str.length) === str; };
}
if (typeof String.prototype.endswith !== 'function') {
    String.prototype.endswith = function(str) { return this.slice(-str.length) === str; };
}
if (typeof Array.prototype.norm !== 'function') {
    Array.prototype.norm = function() { return Math.sqrt(this.dot(this)); };
}
if (typeof Array.prototype.dot !== 'function') {
    Array.prototype.dot = function(v) {
        if (v.length !== this.length) alert("Lengths for dot product must be equal");
        return summation(v.map((vi, i) => vi * this[i]));
    };
}

// ===== Constants =====

const ATOM_SIZE = 3;
const DEBUG = true;

const nuc_acids = ["A", "C", "G", "T", "DA", "DC", "DG", "DT", "RA", "RC", "RG", "RT"];
const supported_draw_methods = ["both", "lines", "points", "cartoon"];
const selector_delimiter = "/";

// ===== Atom tables =====

// Jmol CPK colors — http://jmol.sourceforge.net/jscolors/
const atom_colors = {
    'H': [255, 255, 255],
    'C': [144, 144, 144],
    'N': [ 48,  80, 248],
    'O': [255,  13,  13],
    'F': [144, 224,  80],
    'P': [255, 128,   0],
    'S': [255, 200,  50],
    'K': [143,  64, 212],
    'I': [148,   0, 148],
    'V': [166,   0, 255],
    '_': [180, 180, 180],
};

// Van der Waals radii relative to C = 1.0
const atom_radii = {
    'H': 0.65,
    'C': 1.00,
    'N': 0.93,
    'O': 0.91,
    'F': 0.88,
    'P': 1.12,
    'S': 1.12,
    'I': 1.35,
};

// ===== Utility functions =====

function summation(v) {
    let r = 0;
    for (const x of v) r += x;
    return r;
}

function encodeHTML(s) {
    return s.replace("<", "&lt;").replace(">", "&gt;");
}

function timeIt(fn) {
    const t = new Date();
    fn();
    return (new Date()) - t;
}

function hexToRGBArray(h) {
    if (Array.isArray(h)) return h;
    if (h.startswith("0x")) h = h.substring(2);
    return [0, 2, 4].map(i => parseInt(h.substring(i, i + 2), 16));
}

function arrayToRGB(a) {
    if (typeof a === 'string') {
        if (a.startswith("#")) return a;
        alert("Improperly formatted string -> color. Must be of the form #XXXXXX");
    }
    if (a == null) {
        a = randomRGB();
        if (DEBUG) alert(`No color defined for ${a.toString()}. Using a random color`);
    }
    if (a.length !== 3) alert(`Array To RGB must be of length 3, it is length ${a.length}: ${a}`);
    const fixer = c => parseInt(c > 255 ? 255 : c < 0 ? 0 : c);
    a = a.map(fixer);
    return `rgb(${a[0]}, ${a[1]}, ${a[2]})`;
}

function isBonded(a1, a2) {
    if (a1.parent.typeName() !== a2.parent.typeName()) return false;
    const aad = atomAtomDistance(a1, a2);
    if (a1.info.drawMethod === 'cartoon') {
        if (aad < 4  && a1.parent.isProtein() && a1.original_atom_name === "CA" && a2.original_atom_name === "CA") return true;
        if (aad < 10 && a1.parent.isDNA()     && a1.original_atom_name === "P"  && a2.original_atom_name === "P")  return true;
        return false;
    }
    return aad < 2;
}

function degToRad(deg) { return deg * 0.0174532925; }
function radToDeg(rad) { return rad * 57.2957795; }
function delay(ms, f)  { return setInterval(f, ms); }

function pdbAtomToDict(a_str) {
    const handleResiName = r => nuc_acids.slice(4).includes(r) ? r.substr(1, 2) : r;
    const handleAtomName = a => a.substr(0, 1);
    const raw = a_str.substring(13, 16).trim();
    return {
        original_atom_name: raw,
        atom_name:          handleAtomName(raw),
        resi_name:          handleResiName(a_str.substring(17, 20).trim()),
        chain_id:           a_str.substring(21, 22).trim(),
        resi_id:            parseInt(a_str.substring(23, 26)),
        x:                  parseFloat(a_str.substring(31, 38)),
        y:                  parseFloat(a_str.substring(38, 45)),
        z:                  parseFloat(a_str.substring(46, 53)),
    };
}

function randomInt(maxInt) { return Math.floor(Math.random() * maxInt); }
function randomRGB()       { return [randomInt(255), randomInt(255), randomInt(255)]; }
function deepCopy(o)       { return structuredClone(o); }
function randomDrawMethod() { return supported_draw_methods[randomInt(supported_draw_methods.length)]; }
function defaultInfo()      { return { drawMethod: randomDrawMethod() }; }

function genIFSLink(selector_str, key, val, pretty) {
    const link = `javascript:window.coffeemol.changeInfoFromSelectors('${selector_str}', '${key}', '${val}');`;
    return `<div class='dropdown-option'><a href="${link}">${pretty}</a></div>`;
}

function mousePosition(e) { return { x: e.offsetX, y: e.offsetY }; }

function sortBondsByZ(b1, b2) { return b1.zCenter() - b2.zCenter(); }
function sortByZ(a1, a2)      { return a1.z - a2.z; }
function atomAtomDistance(a1, a2) {
    return Math.sqrt((a1.x - a2.x) ** 2 + (a1.y - a2.y) ** 2 + (a1.z - a2.z) ** 2);
}

// Global helper used by the debug viewer's submit button
function addNewStructure(e) {
    const filepath = document.querySelector('#add-new-structure .text')?.value;
    coffeemol.addNewStructure(filepath);
}

function fromSplashLink(filename) {
    coffeemol.addNewStructure(filename, { drawMethod: 'cartoon' });
}

// ===== Selector =====

class Selector {
    constructor(s = null) {
        if (!s) {
            this.str   = "0";
            this.array = [0];
        } else if (Array.isArray(s)) {
            this.str   = s.join(selector_delimiter);
            this.array = s;
        } else if (typeof s === "string") {
            this.str   = s;
            this.array = s.split(selector_delimiter);
        }
    }

    right() { const a = this.array.slice(); a[a.length - 1]++; return new Selector(a.join(selector_delimiter)); }
    left()  { const a = this.array.slice(); a[a.length - 1]--; return new Selector(a.join(selector_delimiter)); }

    down() {
        const a = this.array.slice();
        a.push(0);
        return new Selector(a.join(selector_delimiter));
    }

    up() {
        const a = this.array.slice(0, -1);
        const n = new Selector(a.join(selector_delimiter));
        return n.str === this.str ? null : n;
    }
}

// ===== Bond =====

class Bond {
    constructor(a1, a2) {
        this.a1 = a1;
        this.a2 = a2;
        this.computeLength();
    }

    toString() {
        return `<Bond of Length: ${this.computeLength().toFixed(3)} between ${this.a1} and ${this.a2}>`;
    }

    computeLength() {
        if (this.length == null) this.length = atomAtomDistance(this.a1, this.a2);
        return this.length;
    }

    zCenter() { return (this.a1.z + this.a2.z) / 2.0; }
}

// ===== Element (base class) =====

class Element {
    constructor(parent, name, cc = null) {
        this.parent   = parent;
        this.name     = name;
        this.children = [];
        this.info     = {};
        this.selector = null;
        if (this.parent != null) this.parent.addChild(this);
        this.cc = cc != null ? cc : this.parent.cc;
    }

    constructorName() { return this.constructor.name; }

    writeContextInfo() {
        if (this.constructorName() === "Atom") return;
        const shortenName    = n => n.length > 20 ? n.substr(0, 17) + "..." : n;
        const plural         = this.children.length === 1 ? '' : 's';
        const pointsLink     = genIFSLink(this.selector.str, "drawMethod", "points",  "Points");
        const linesLink      = genIFSLink(this.selector.str, "drawMethod", "lines",   "Lines");
        const bothLink       = genIFSLink(this.selector.str, "drawMethod", "both",    "Points + lines");
        const cartoonLink    = genIFSLink(this.selector.str, "drawMethod", "cartoon", "Cartoon");
        const child_type     = this.children[0].constructorName();
        const dropdown       = `<span class='fake-button open-dropdown'>Draw</span><span class='dropdown ${this.selector.str}'>${pointsLink} ${linesLink} ${bothLink} ${cartoonLink}</span>`;
        const ctx_info       = `<span class='element-desc ${this.constructorName()} fake-button'>${this.constructorName()}: ${shortenName(this.name)} with ${this.children.length} ${child_type}${plural}</span> ${dropdown}`;
        const children_info  = this.children.map(c => c.writeContextInfo());
        return `<div class='element-controller ${this.constructorName()}'>${ctx_info}${children_info.join("")}</div>`;
    }

    init()          { this.atoms = this.getOfType(Atom); }
    addChild(child) { this.children.push(child); }

    propogateInfo(info) {
        this.info = deepCopy(info);
        this.info.drawColor = this.info.drawColor != null ? hexToRGBArray(this.info.drawColor) : null;
        for (const c of this.children) c.propogateInfo(info);
    }

    stashInfo() {
        this.old_info = deepCopy(this.info);
        for (const c of this.children) c.stashInfo();
    }

    retrieveStashedInfo() {
        this.info = deepCopy(this.old_info);
        for (const c of this.children) c.retrieveStashedInfo();
    }

    getOfType(type) {
        const ret = [];
        const recursor = children => {
            for (const c of children) {
                if (c instanceof type) ret.push(c);
                else recursor(c.children);
            }
        };
        recursor(this.children);
        return ret;
    }

    draw() {
        if (!supported_draw_methods.includes(this.info.drawMethod)) {
            alert(`drawMethod ${this.info.drawMethod} not supported! Choose: ${supported_draw_methods.join(", ")}`);
        }
        this.drawLines();
        this.drawPoints();
    }

    drawLines() {
        this.bonds.sort(sortBondsByZ);
        for (const b of this.bonds) {
            if (b.a1.info.drawMethod === 'points') continue;
            this.cc.context.beginPath();
            this.cc.context.moveTo(b.a1.x, b.a1.y);
            this.cc.context.lineTo(b.a2.x, b.a2.y);
            this.cc.context.strokeStyle = arrayToRGB(b.a1.depthShadedColor());
            this.cc.context.lineWidth   = 2 / this.cc.zoom;
            this.cc.context.closePath();
            this.cc.context.stroke();
        }
    }

    drawPoints() {
        const sorted = this.atoms.slice().sort(sortByZ);
        for (const a of sorted) {
            if (!['lines', 'cartoon'].includes(a.info.drawMethod)) a.drawPoint();
        }
    }

    rotateAboutZ(theta) { const cos = Math.cos(theta), sin = Math.sin(theta); for (const a of this.atoms) a.rotateAboutZ(sin, cos); }
    rotateAboutY(theta) { const cos = Math.cos(theta), sin = Math.sin(theta); for (const a of this.atoms) a.rotateAboutY(sin, cos); }
    rotateAboutX(theta) { const cos = Math.cos(theta), sin = Math.sin(theta); for (const a of this.atoms) a.rotateAboutX(sin, cos); }
    rotateAboutXYZ(dx, dy, dz) { for (const a of this.atoms) a.rotateAboutXYZ(dx, dy, dz); }
    restoreToOriginal() { for (const a of this.atoms) a.restoreToOriginal(); }

    avgCenter() {
        const avgs = [0.0, 0.0, 0.0];
        for (const a of this.atoms) { avgs[0] += a.x; avgs[1] += a.y; avgs[2] += a.z; }
        return avgs.map(v => v / this.atoms.length);
    }

    translateTo(center) {
        for (const a of this.atoms) { a.x -= center[0]; a.y -= center[1]; a.z -= center[2]; }
    }

    findBonds() {
        this.bonds = [];
        if (this.atoms.length < 2) return;
        for (let i = 0; i <= this.atoms.length - 2; i++) {
            const a1     = this.atoms[i];
            const j_step = a1.info.drawMethod === 'cartoon' ? 30 : 10;
            const jEnd   = Math.min(i + j_step, this.atoms.length - 1);
            for (let j = i + 1; j <= jEnd; j++) {
                if (isBonded(a1, this.atoms[j])) this.bonds.push(new Bond(a1, this.atoms[j]));
            }
        }
    }
}

// ===== Structure =====

class Structure extends Element {
    constructor(parent, name, cc) {
        if (name.includes("/"))     name = name.split("/").at(-1);
        if (name.endswith(".pdb"))  name = name.split(".")[0];
        super(parent, name, cc);
        cc.addElement(this);
    }

    toString() {
        const n = this.title != null ? this.title : this.name;
        return `<Structure ${n} with ${this.children.length} chains>`;
    }

    attachTitle(str) {
        str = str.replace("TITLE ", "");
        if (this.title == null) this.title = str;
        else this.title += str.slice(2);
    }
}

// ===== Chain =====

class Chain extends Element {
    constructor(parent, name) { super(parent, name); }
    toString() { return `<Chain ${this.name} with ${this.children.length} residues>`; }
}

// ===== Residue =====

class Residue extends Element {
    constructor(parent, name, id) {
        super(parent, name);
        this.id = id;
    }

    toString()  { return `<Residue ${this.name} with ${this.children.length} atoms>`; }
    isDNA()     { return nuc_acids.includes(this.name); }
    isProtein() { return !this.isDNA(); }
    typeName()  { if (this.isDNA) return "DNA"; } // checks function truthiness, matching original
}

// ===== Atom =====

class Atom extends Element {
    constructor(parent, name, x, y, z, original_atom_name) {
        super(parent, name);
        this.x = x; this.y = y; this.z = z;
        this.original_atom_name = original_atom_name;
        this.original_position  = [x, y, z];
    }

    toString()  { return `<Atom: ${this.name} [${this.x.toFixed(2)}, ${this.y.toFixed(2)}, ${this.z.toFixed(2)}]>`; }
    cpkColor()  { return this.info.drawColor ?? atom_colors[this.name] ?? atom_colors['_']; }

    depthShadedColor() {
        const base   = this.cpkColor();
        const extent = this.cc.z_extent ?? 1;
        const t      = Math.max(0, Math.min(1, (this.z + extent) / (2 * extent)));
        return base.map(c => Math.round(c * (0.3 + 0.7 * t)));
    }

    drawPoint() {
        const base   = this.cpkColor();
        const relR   = atom_radii[this.name] ?? 1.0;
        const zz     = ATOM_SIZE * relR / this.cc.zoom;
        const extent = this.cc.z_extent ?? 1;
        const t      = Math.max(0, Math.min(1, (this.z + extent) / (2 * extent)));
        const factor = 0.3 + 0.7 * t;

        const shaded    = base.map(c => Math.round(c * factor));
        const highlight = base.map(c => Math.min(255, Math.round(c * 0.4 + 160)));

        const grad = this.cc.context.createRadialGradient(
            this.x - zz * 0.35, this.y - zz * 0.35, 0,
            this.x,              this.y,              zz);
        grad.addColorStop(0, arrayToRGB(highlight));
        grad.addColorStop(1, arrayToRGB(shaded));

        this.cc.context.beginPath();
        this.cc.context.arc(this.x, this.y, zz, 0, 2 * Math.PI, false);
        this.cc.context.fillStyle = grad;
        this.cc.context.fill();
    }

    // sin and cos are pre-computed by Element.rotateAboutX/Y/Z
    rotateAboutY(sin, cos) { const ox = this.x; this.x =  ox * cos + this.z * sin; this.z = -ox * sin + this.z * cos; }
    rotateAboutX(sin, cos) { const oy = this.y; this.y =  oy * cos - this.z * sin; this.z =  oy * sin + this.z * cos; }
    rotateAboutZ(sin, cos) { const ox = this.x; this.x =  ox * cos - this.y * sin; this.y =  ox * sin + this.y * cos; }

    // Probably broken — preserved as-is from original
    rotateAboutXYZ(j, k, l) {
        this.x = this.x * Math.cos(k) * Math.cos(l) + this.z * Math.sin(k) - this.y * Math.cos(k) * Math.sin(l);
        this.y = -this.z * Math.cos(k) * Math.sin(j) + this.x * (Math.cos(l) * Math.sin(j) * Math.sin(k) + Math.cos(j) * Math.sin(l)) + this.y * (Math.cos(j) * Math.cos(l) - Math.sin(j) * Math.sin(k) * Math.sin(l));
        this.z = this.z * Math.cos(j) * Math.cos(k) + this.x * (-Math.cos(j) * Math.cos(l) * Math.sin(k) + Math.sin(j) * Math.sin(l)) + this.y * (Math.cos(l) * Math.sin(j) + Math.cos(j) * Math.sin(k) * Math.sin(l));
    }

    restoreToOriginal() { [this.x, this.y, this.z] = this.original_position; }
    asArray()           { return [this.x, this.y, this.z]; }

    atomInfo(index, oldhtml) {
        let s = this.selector;
        const parents = [this];
        for (let i = 1; i <= 10; i++) {
            s = s.up();
            if (s == null) break;
            parents.push(this.cc.childFromSelector(s));
        }
        try {
            return parents.map(p => encodeHTML(p.toString())).join("<br>");
        } catch (error) {
            console.log(parents);
        }
    }
}

// ===== CanvasContext =====

class CanvasContext {
    constructor(canvas_tag, background_color = "#ffffff") {
        this.canvas_tag       = canvas_tag;
        this.background_color = background_color;
        this.elements         = [];

        for (const method of [
            'init', 'loadNewStructure', 'writeContextInfo', 'addNewStructure', 'loadFromDict',
            'drawAll', 'findBestZoom', 'drawGridLines', 'changeAllDrawMethods', 'resizeToWindow', 'clear',
            'touchstart', 'mousedown', 'mouseup', 'touchend', 'touchmove', 'mousemove',
            'iOSChangeZoom', 'changeZoom', 'restoreToOriginal', 'computeZExtent', 'findBonds',
            'translateOrigin', 'avgCenterOfAllElements', 'timedRotation', 'stopRotation',
            'determinePointGrid', 'showAtomInfo', 'assignSelectors',
            'handleSelectorArg', 'childFromSelector', 'changeInfoFromSelectors',
        ]) { this[method] = this[method].bind(this); }

        try {
            this.canvas  = document.querySelector(this.canvas_tag);
            this.context = this.canvas.getContext('2d');
        } catch (error) {
            alert(error);
        }

        this.canvas.style.userSelect       = 'none';
        this.canvas.style.MozUserSelect    = 'none';
        this.canvas.style.webkitUserSelect = 'none';
        this.canvas.style.backgroundColor  = arrayToRGB(this.background_color);

        this.mouse_x_prev = 0;
        this.mouse_y_prev = 0;

        document.getElementById('reset')?.addEventListener('click', this.restoreToOriginal);
        this.canvas.addEventListener('mousedown',    this.mousedown);
        this.canvas.addEventListener('touchstart',   this.touchstart, { passive: false });
        this.canvas.addEventListener('wheel',        this.changeZoom, { passive: false });
        this.canvas.addEventListener('gesturestart', this.iOSChangeZoom);
        this.canvas.addEventListener('dblclick',     this.translateOrigin);
        this.canvas.addEventListener('mousemove',    this.showAtomInfo);
    }

    // ---- Loading ----

    init() {
        for (const el of this.elements) el.init();
        this.findBonds();
        this.assignSelectors();
        this.restoreToOriginal();
        this.computeZExtent();
        this.determinePointGrid();
        this.writeContextInfo();
    }

    addElement(el) { this.elements.push(el); }

    loadNewStructure(filepath, info = null) {
        this.elements = [];
        this.bonds    = [];
        this.grid     = {};
        this.addNewStructure(filepath, info);
    }

    writeContextInfo() {
        const el = document.getElementById('ctx-info');
        if (el) el.innerHTML = this.elements.map(e => e.writeContextInfo()).join("");
    }

    addNewStructure(filepath, info = null) {
        const handlePDB = (data) => {
            const s = new Structure(null, filepath, this);
            let chain_id_prev, resi_id_prev, c, r;
            for (const a_str of data.split('\n')) {
                if (a_str.startswith("TITLE")) { s.attachTitle(a_str); continue; }
                if (!a_str.startswith("ATOM"))  continue;
                const d = pdbAtomToDict(a_str);
                if (chain_id_prev == null || d.chain_id !== chain_id_prev) c = new Chain(s, d.chain_id);
                if (resi_id_prev  == null || d.resi_id  !== resi_id_prev)  r = new Residue(c, d.resi_name, d.resi_id);
                new Atom(r, d.atom_name, d.x, d.y, d.z, d.original_atom_name);
                chain_id_prev = d.chain_id;
                resi_id_prev  = d.resi_id;
            }
            if (info === null) info = defaultInfo();
            s.propogateInfo(info);
            if (this.structures_left_to_load != null) {
                if (--this.structures_left_to_load === 0) this.init();
            } else {
                this.init();
            }
        };
        fetch(filepath).then(r => r.text()).then(handlePDB);
    }

    loadFromDict(structuresToLoad) {
        this.structures_left_to_load = 0;
        for (const _ in structuresToLoad) this.structures_left_to_load++;
        for (const [filepath, info] of Object.entries(structuresToLoad)) this.addNewStructure(filepath, info);
    }

    // ---- Drawing ----

    drawAll() {
        this.drawGridLines();
        this.context.scale(this.zoom, this.zoom);
        this.elements.sort((e1, e2) => e1.avgCenter()[2] - e2.avgCenter()[2]);
        for (const el of this.elements) el.draw();
    }

    findBestZoom() {
        let max_x = 0, max_y = 0;
        for (const el of this.elements)
            for (const a of el.atoms) {
                if (Math.abs(a.x) > max_x) max_x = Math.abs(a.x);
                if (Math.abs(a.y) > max_y) max_y = Math.abs(a.y);
            }
        return max_x > max_y ? this.canvas.width / (2 * max_x) : this.canvas.width / (2 * max_y);
    }

    drawGridLines() {
        this.context.moveTo(0,               -this.canvas.height);
        this.context.lineTo(0,                this.canvas.height);
        this.context.moveTo(-this.canvas.width, 0);
        this.context.lineTo( this.canvas.width, 0);
        this.context.strokeStyle = "#eee";
        this.context.stroke();
    }

    changeAllDrawMethods(new_method) {
        this.clear();
        for (const el of this.elements) el.info.drawMethod = new_method;
        this.drawAll();
    }

    resizeToWindow() {
        this.canvas.width  = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    clear() {
        this.canvas.width = this.canvas.width; // resets canvas transform
        this.context.translate(this.x_origin, this.y_origin);
    }

    // ---- Events ----

    touchstart(mobile_e) {
        mobile_e.preventDefault();
        this.canvas.addEventListener('touchmove', this.touchmove);
        this.canvas.addEventListener('touchend',  this.touchend);
        this.mousedown(mobile_e.touches[0]);
    }

    mousedown(e) {
        this.mouse_x_prev = e.clientX;
        this.mouse_y_prev = e.clientY;
        this.canvas.removeEventListener('mousemove', this.showAtomInfo);
        this.canvas.addEventListener('mousemove', this.mousemove);
        this.canvas.addEventListener('mouseout',  this.mouseup);
        this.canvas.addEventListener('mouseup',   this.mouseup);
    }

    mouseup() {
        this.clear();
        this.drawAll();
        this.canvas.removeEventListener('mousemove', this.mousemove);
        this.canvas.addEventListener('mousemove', this.showAtomInfo);
        this.determinePointGrid();
    }

    touchend(mobile_e) {
        this.canvas.removeEventListener('touchmove', this.mousemove);
        this.mouseup(mobile_e.touches[0]);
    }

    touchmove(mobile_e) { this.mousemove(mobile_e.touches[0]); }

    mousemove(e) {
        const dx = this.mouse_x_prev - e.clientX;
        const dy = this.mouse_y_prev - e.clientY;
        this.clear();
        for (const el of this.elements) {
            el.rotateAboutX(degToRad(dy));
            el.rotateAboutY(degToRad(-dx));
        }
        this.drawAll();
        this.mouse_x_prev = e.clientX;
        this.mouse_y_prev = e.clientY;
    }

    iOSChangeZoom(gesture) {
        const zoom_at_start = this.zoom;
        let rotation_prev = 0;
        const zoomChanger = (gesture) => {
            gesture.preventDefault();
            this.zoom = zoom_at_start * gesture.scale;
            const dRotation = gesture.rotation - rotation_prev;
            rotation_prev = gesture.rotation;
            for (const el of this.elements) el.rotateAboutZ(degToRad(dRotation));
            this.clear();
            if (this.zoom > 0) { this.drawAll(); this.zoom_prev = this.zoom; }
        };
        zoomChanger(gesture);
        this.canvas.addEventListener('gesturechange', zoomChanger);
    }

    changeZoom(e) {
        e.preventDefault();
        this.zoom = this.zoom_prev * Math.exp(-e.deltaY / 300);
        if (this.zoom > 0) { this.clear(); this.drawAll(); this.zoom_prev = this.zoom; }
    }

    restoreToOriginal() {
        for (const el of this.elements) el.restoreToOriginal();
        const center = this.avgCenterOfAllElements();
        for (const el of this.elements) el.translateTo(center);
        this.zoom      = this.findBestZoom();
        this.zoom_prev = this.zoom;
        this.x_origin  = this.canvas.width  / 2;
        this.y_origin  = this.canvas.height / 2;
        this.clear();
        this.drawAll();
        this.determinePointGrid();
    }

    computeZExtent() {
        let max_z = 0;
        for (const el of this.elements)
            for (const a of el.atoms)
                if (Math.abs(a.z) > max_z) max_z = Math.abs(a.z);
        this.z_extent = max_z > 0 ? max_z : 1;
    }

    findBonds() {
        this.bonds = [];
        for (const el of this.elements) el.findBonds();
    }

    // ---- Motion ----

    translateOrigin(e) {
        const click = mousePosition(e);
        this.x_origin = click.x;
        this.y_origin = click.y;
        this.clear();
        this.drawAll();
    }

    avgCenterOfAllElements() {
        const avgs = [0.0, 0.0, 0.0];
        let total_atoms = 0;
        for (const el of this.elements) {
            const elAvg = el.avgCenter();
            const ela   = el.atoms.length;
            avgs[0] += elAvg[0] * ela;
            avgs[1] += elAvg[1] * ela;
            avgs[2] += elAvg[2] * ela;
            total_atoms += ela;
        }
        return avgs.map(a => a / total_atoms);
    }

    timedRotation(dim, dt) {
        this.delayID = delay(dt, () => {
            this.clear();
            if      (dim === 'X') for (const el of this.elements) el.rotateAboutX(degToRad(1));
            else if (dim === 'Y') for (const el of this.elements) el.rotateAboutY(degToRad(1));
            else if (dim === 'Z') for (const el of this.elements) el.rotateAboutZ(degToRad(1));
            this.drawAll();
        });
    }

    stopRotation() { clearInterval(this.delayID); }

    // ---- Picking ----

    determinePointGrid() {
        this.grid = {};
        const wStart = Math.round(-this.x_origin);
        const wEnd   = Math.round(this.canvas.width  - this.x_origin);
        const hStart = Math.round(-this.y_origin);
        const hEnd   = Math.round(this.canvas.height - this.y_origin);
        for (let w = wStart; w <= wEnd; w++) {
            this.grid[w] = {};
            for (let h = hStart; h <= hEnd; h++) this.grid[w][h] = null;
        }
        const dx = Math.trunc(ATOM_SIZE / this.zoom);
        for (const el of this.elements) {
            for (const a of el.atoms) {
                const w = Math.trunc(a.x);
                const h = Math.trunc(a.y);
                for (let i = -dx; i <= dx; i++) {
                    for (let j = -dx; j <= dx; j++) {
                        try {
                            if (this.grid[w+i][h+j] == null || a.z > this.grid[w+i][h+j].z)
                                this.grid[w+i][h+j] = a;
                        } catch (_) { /* pixel outside grid bounds */ }
                    }
                }
            }
        }
    }

    showAtomInfo(e) {
        if (this.a_prev != null) {
            this.a_prev.info.drawColor   = this.a_prev.info.prevDrawColor;
            this.a_prev.info.borderColor = this.a_prev.info.prevBorderColor;
            this.a_prev.drawPoint();
        }
        const click  = mousePosition(e);
        const grid_x = Math.trunc((click.x - this.x_origin) / this.zoom);
        const grid_y = Math.trunc((click.y - this.y_origin) / this.zoom);
        if (this.grid[grid_x] != null && this.grid[grid_x][grid_y] != null) {
            const a = this.grid[grid_x][grid_y];
            if (['lines', 'cartoon'].includes(a.info.drawMethod)) return;
            a.info.prevDrawColor   = a.info.drawColor;
            a.info.prevBorderColor = a.info.prevBorderColor;
            a.info.drawColor       = [0, 255, 0];
            a.info.borderColor     = [0, 0, 255];
            a.drawPoint();
            this.a_prev = a;
        }
    }

    // ---- Selectors ----

    assignSelectors() {
        for (let ne = 0; ne < this.elements.length; ne++) {
            const el = this.elements[ne];
            el.selector = new Selector([ne]);
            for (let nc = 0; nc < el.children.length; nc++) {
                const c = el.children[nc];
                c.selector = new Selector([ne, nc]);
                for (let nr = 0; nr < c.children.length; nr++) {
                    const r = c.children[nr];
                    r.selector = new Selector([ne, nc, nr]);
                    for (let na = 0; na < r.children.length; na++) {
                        r.children[na].selector = new Selector([ne, nc, nr, na]);
                    }
                }
            }
        }
    }

    handleSelectorArg(s) { return typeof s === "string" ? new Selector(s) : s; }

    childFromSelector(selector) {
        selector = this.handleSelectorArg(selector);
        let c = this;
        for (const i of selector.array) c = c.elements != null ? c.elements[i] : c.children[i];
        return c;
    }

    changeInfoFromSelectors(selectors, info_key, info_value) {
        if (selectors === "all") {
            selectors = this.elements.map(el => el.selector);
        } else if (!(selectors instanceof Array) || typeof selectors === 'string') {
            selectors = [selectors];
        }
        let c;
        for (let selector of selectors) {
            selector = this.handleSelectorArg(selector);
            try { c = this.childFromSelector(selector); }
            catch (_) { alert(`Child from selector ${selector.str} does not exist`); }
            try { c.info[info_key] = info_value.toLowerCase(); }
            catch (error) { alert(`Error: ${error} with ${info_key} to ${info_value}`); }
            c.propogateInfo(c.info);
        }
        this.clear();
        if (c.info.drawMethod !== 'points') this.findBonds();
        this.drawAll();
    }
}

// ===== Debug viewer (only active when #debug-info element is present) =====

if (document.getElementById('debug-info')) {
    document.querySelector('#add-new-structure .submit')?.addEventListener('click', addNewStructure);

    const fitCtxInfo = () => {
        const c = document.getElementById('ctx-info');
        const top = c.getBoundingClientRect().top + window.scrollY;
        c.style.height = (window.innerHeight - top - 100) + 'px';
    };
    fitCtxInfo();
    window.addEventListener('resize', fitCtxInfo);

    let fade = "out";
    document.getElementById('show-ctx-container')?.addEventListener('click', () => {
        const ccSize = document.querySelectorAll('.cc-size');
        if (fade === "in") {
            ccSize.forEach(el => el.style.display = 'block');
            fade = "out";
            document.getElementById('show-ctx-container').textContent = "<< Options";
        } else {
            ccSize.forEach(el => el.style.display = 'none');
            fade = "in";
            document.getElementById('show-ctx-container').textContent = "Options >>";
        }
    });

    document.getElementById('help-area')?.addEventListener('click', function() { this.style.display = 'none'; });

    const structuresToLoad = {
        "PDBs/A1_open_2HU_78bp_1/out-1-16.pdb":                { drawMethod: "cartoon", drawColor: [47,  254, 254] },
        "PDBs/A1_open_2HU_78bp_1/half1_0.pdb":                  { drawMethod: "points",  drawColor: [254, 0,   254] },
        "PDBs/A1_open_2HU_78bp_1/half2-78bp-ID0_B1-16.pdb":    { drawMethod: "both",    drawColor: [254, 0,   254] },
        "PDBs/A1_open_2HU_78bp_1/proteins-78bp-ID0_B1-16.pdb": { drawMethod: "lines",   drawColor: [251, 251, 1]   },
    };

    const dismissWelcomeSplash = () => {
        const showCtx = document.getElementById('show-ctx-container');
        if (showCtx) showCtx.style.display = 'block';
        document.querySelectorAll('.cc-size').forEach(el => el.style.display = 'block');
        const splash = document.getElementById('welcome-splash');
        if (splash) splash.style.display = 'none';
    };

    if (structuresToLoad == null) {
        const showCtx = document.getElementById('show-ctx-container');
        if (showCtx) showCtx.style.display = 'none';
        document.querySelectorAll('.cc-size').forEach(el => el.style.display = 'none');
        const splash = document.getElementById('welcome-splash');
        if (splash) {
            splash.style.left    = (window.innerWidth  / 2 - splash.offsetWidth  / 2) + 'px';
            splash.style.top     = (window.innerHeight / 2 - splash.offsetHeight / 2) + 'px';
            splash.style.display = 'block';
            if (showCtx) showCtx.style.display = 'block';
            document.querySelectorAll('.sample-pdb-link').forEach(el => el.addEventListener('click', dismissWelcomeSplash));
            document.querySelector('#welcome-splash #dismiss')?.addEventListener('click', dismissWelcomeSplash);
        }
    } else {
        coffeemol.loadFromDict(structuresToLoad);
    }

    coffeemol.writeContextInfo();

    document.getElementById('ctx-info')?.addEventListener('click', e => {
        if (e.target.classList.contains('open-dropdown')) {
            const d = e.target.nextElementSibling;
            if (d) {
                const hidden = d.style.display === 'none' || d.style.display === '';
                d.style.top     = e.pageY + 'px';
                d.style.left    = e.pageX + 'px';
                d.style.display = hidden ? 'block' : 'none';
            }
        } else if (e.target.classList.contains('element-desc')) {
            const siblings = Array.from(e.target.parentElement.children);
            const cc = siblings.slice(siblings.indexOf(e.target) + 1)
                .concat(siblings.flatMap(el => Array.from(el.querySelectorAll('.element-desc'))));
            const show = cc[0]?.style.display === 'none' || cc[0]?.style.display === '';
            cc.forEach(el => el.style.display = show ? 'block' : 'none');
        }
    });
}

// ===== Initialization =====

const isDark    = window.matchMedia('(prefers-color-scheme: dark)').matches;
const coffeemol = new CanvasContext("#coffeemolCanvas", isDark ? "#111111" : "#ffffff");
window.coffeemol      = coffeemol;
window.fromSplashLink = fromSplashLink;
