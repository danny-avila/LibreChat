import { r as reactExports, R as React, a as reactDomExports, H as withSelectorExports, G as process$1, I as useFloating, o as offset, s as shift, f as flip, J as inner, b as size, K as useInnerOffset, L as useInteractions, d as autoUpdate, t as t$7, $ as $f7dceffc5ad7768b$export$4e328f61c538687f, M as $6179b936705e76d3$export$ae780daf29e6d456 } from "./vendor.BvsoAGbO.js";
var i$5 = Object.defineProperty;
var d$3 = (t2, e2, n2) => e2 in t2 ? i$5(t2, e2, { enumerable: true, configurable: true, writable: true, value: n2 }) : t2[e2] = n2;
var r$4 = (t2, e2, n2) => (d$3(t2, typeof e2 != "symbol" ? e2 + "" : e2, n2), n2);
let o$a = class o {
  constructor() {
    r$4(this, "current", this.detect());
    r$4(this, "handoffState", "pending");
    r$4(this, "currentId", 0);
  }
  set(e2) {
    this.current !== e2 && (this.handoffState = "pending", this.currentId = 0, this.current = e2);
  }
  reset() {
    this.set(this.detect());
  }
  nextId() {
    return ++this.currentId;
  }
  get isServer() {
    return this.current === "server";
  }
  get isClient() {
    return this.current === "client";
  }
  detect() {
    return typeof window == "undefined" || typeof document == "undefined" ? "server" : "client";
  }
  handoff() {
    this.handoffState === "pending" && (this.handoffState = "complete");
  }
  get isHandoffComplete() {
    return this.handoffState === "complete";
  }
};
let s$a = new o$a();
function o$9(n2) {
  var e2, r2;
  return s$a.isServer ? null : n2 ? "ownerDocument" in n2 ? n2.ownerDocument : "current" in n2 ? (r2 = (e2 = n2.current) == null ? void 0 : e2.ownerDocument) != null ? r2 : document : null : document;
}
function t$6(e2) {
  typeof queueMicrotask == "function" ? queueMicrotask(e2) : Promise.resolve().then(e2).catch((o4) => setTimeout(() => {
    throw o4;
  }));
}
function o$8() {
  let s2 = [], r2 = { addEventListener(e2, t2, n2, i2) {
    return e2.addEventListener(t2, n2, i2), r2.add(() => e2.removeEventListener(t2, n2, i2));
  }, requestAnimationFrame(...e2) {
    let t2 = requestAnimationFrame(...e2);
    return r2.add(() => cancelAnimationFrame(t2));
  }, nextFrame(...e2) {
    return r2.requestAnimationFrame(() => r2.requestAnimationFrame(...e2));
  }, setTimeout(...e2) {
    let t2 = setTimeout(...e2);
    return r2.add(() => clearTimeout(t2));
  }, microTask(...e2) {
    let t2 = { current: true };
    return t$6(() => {
      t2.current && e2[0]();
    }), r2.add(() => {
      t2.current = false;
    });
  }, style(e2, t2, n2) {
    let i2 = e2.style.getPropertyValue(t2);
    return Object.assign(e2.style, { [t2]: n2 }), this.add(() => {
      Object.assign(e2.style, { [t2]: i2 });
    });
  }, group(e2) {
    let t2 = o$8();
    return e2(t2), this.add(() => t2.dispose());
  }, add(e2) {
    return s2.includes(e2) || s2.push(e2), () => {
      let t2 = s2.indexOf(e2);
      if (t2 >= 0) for (let n2 of s2.splice(t2, 1)) n2();
    };
  }, dispose() {
    for (let e2 of s2.splice(0)) e2();
  } };
  return r2;
}
function p$6() {
  let [e2] = reactExports.useState(o$8);
  return reactExports.useEffect(() => () => e2.dispose(), [e2]), e2;
}
let n$6 = (e2, t2) => {
  s$a.isServer ? reactExports.useEffect(e2, t2) : reactExports.useLayoutEffect(e2, t2);
};
function s$9(e2) {
  let r2 = reactExports.useRef(e2);
  return n$6(() => {
    r2.current = e2;
  }, [e2]), r2;
}
let o$7 = function(t2) {
  let e2 = s$9(t2);
  return React.useCallback((...r2) => e2.current(...r2), [e2]);
};
function E$6(e2) {
  let t2 = e2.width / 2, n2 = e2.height / 2;
  return { top: e2.clientY - n2, right: e2.clientX + t2, bottom: e2.clientY + n2, left: e2.clientX - t2 };
}
function P$3(e2, t2) {
  return !(!e2 || !t2 || e2.right < t2.left || e2.left > t2.right || e2.bottom < t2.top || e2.top > t2.bottom);
}
function w$6({ disabled: e2 = false } = {}) {
  let t2 = reactExports.useRef(null), [n2, l2] = reactExports.useState(false), r2 = p$6(), o4 = o$7(() => {
    t2.current = null, l2(false), r2.dispose();
  }), f2 = o$7((s2) => {
    if (r2.dispose(), t2.current === null) {
      t2.current = s2.currentTarget, l2(true);
      {
        let i2 = o$9(s2.currentTarget);
        r2.addEventListener(i2, "pointerup", o4, false), r2.addEventListener(i2, "pointermove", (c2) => {
          if (t2.current) {
            let p2 = E$6(c2);
            l2(P$3(p2, t2.current.getBoundingClientRect()));
          }
        }, false), r2.addEventListener(i2, "pointercancel", o4, false);
      }
    }
  });
  return { pressed: n2, pressProps: e2 ? {} : { onPointerDown: f2, onPointerUp: o4, onClick: o4 } };
}
let e$5 = reactExports.createContext(void 0);
function a$g() {
  return reactExports.useContext(e$5);
}
function t$5(...r2) {
  return Array.from(new Set(r2.flatMap((n2) => typeof n2 == "string" ? n2.split(" ") : []))).filter(Boolean).join(" ");
}
function u$b(r2, n2, ...a3) {
  if (r2 in n2) {
    let e2 = n2[r2];
    return typeof e2 == "function" ? e2(...a3) : e2;
  }
  let t2 = new Error(`Tried to handle "${r2}" but there is no handler defined. Only defined handlers are: ${Object.keys(n2).map((e2) => `"${e2}"`).join(", ")}.`);
  throw Error.captureStackTrace && Error.captureStackTrace(t2, u$b), t2;
}
var O$4 = ((a3) => (a3[a3.None = 0] = "None", a3[a3.RenderStrategy = 1] = "RenderStrategy", a3[a3.Static = 2] = "Static", a3))(O$4 || {}), A$1 = ((e2) => (e2[e2.Unmount = 0] = "Unmount", e2[e2.Hidden = 1] = "Hidden", e2))(A$1 || {});
function L$4() {
  let n2 = U$3();
  return reactExports.useCallback((r2) => C$7({ mergeRefs: n2, ...r2 }), [n2]);
}
function C$7({ ourProps: n2, theirProps: r2, slot: e2, defaultTag: a3, features: s2, visible: t2 = true, name: l2, mergeRefs: i2 }) {
  i2 = i2 != null ? i2 : $$2;
  let o4 = P$2(r2, n2);
  if (t2) return F$6(o4, e2, a3, l2, i2);
  let y2 = s2 != null ? s2 : 0;
  if (y2 & 2) {
    let { static: f2 = false, ...u2 } = o4;
    if (f2) return F$6(u2, e2, a3, l2, i2);
  }
  if (y2 & 1) {
    let { unmount: f2 = true, ...u2 } = o4;
    return u$b(f2 ? 0 : 1, { [0]() {
      return null;
    }, [1]() {
      return F$6({ ...u2, hidden: true, style: { display: "none" } }, e2, a3, l2, i2);
    } });
  }
  return F$6(o4, e2, a3, l2, i2);
}
function F$6(n2, r2 = {}, e2, a3, s2) {
  let { as: t2 = e2, children: l2, refName: i2 = "ref", ...o4 } = h$5(n2, ["unmount", "static"]), y2 = n2.ref !== void 0 ? { [i2]: n2.ref } : {}, f2 = typeof l2 == "function" ? l2(r2) : l2;
  "className" in o4 && o4.className && typeof o4.className == "function" && (o4.className = o4.className(r2)), o4["aria-labelledby"] && o4["aria-labelledby"] === o4.id && (o4["aria-labelledby"] = void 0);
  let u2 = {};
  if (r2) {
    let d2 = false, p2 = [];
    for (let [c2, T2] of Object.entries(r2)) typeof T2 == "boolean" && (d2 = true), T2 === true && p2.push(c2.replace(/([A-Z])/g, (g2) => `-${g2.toLowerCase()}`));
    if (d2) {
      u2["data-headlessui-state"] = p2.join(" ");
      for (let c2 of p2) u2[`data-${c2}`] = "";
    }
  }
  if (t2 === reactExports.Fragment && (Object.keys(m$6(o4)).length > 0 || Object.keys(m$6(u2)).length > 0)) if (!reactExports.isValidElement(f2) || Array.isArray(f2) && f2.length > 1) {
    if (Object.keys(m$6(o4)).length > 0) throw new Error(['Passing props on "Fragment"!', "", `The current component <${a3} /> is rendering a "Fragment".`, "However we need to passthrough the following props:", Object.keys(m$6(o4)).concat(Object.keys(m$6(u2))).map((d2) => `  - ${d2}`).join(`
`), "", "You can apply a few solutions:", ['Add an `as="..."` prop, to ensure that we render an actual element instead of a "Fragment".', "Render a single element as the child so that we can forward the props onto that element."].map((d2) => `  - ${d2}`).join(`
`)].join(`
`));
  } else {
    let d2 = f2.props, p2 = d2 == null ? void 0 : d2.className, c2 = typeof p2 == "function" ? (...R2) => t$5(p2(...R2), o4.className) : t$5(p2, o4.className), T2 = c2 ? { className: c2 } : {}, g2 = P$2(f2.props, m$6(h$5(o4, ["ref"])));
    for (let R2 in u2) R2 in g2 && delete u2[R2];
    return reactExports.cloneElement(f2, Object.assign({}, g2, u2, y2, { ref: s2(H$5(f2), y2.ref) }, T2));
  }
  return reactExports.createElement(t2, Object.assign({}, h$5(o4, ["ref"]), t2 !== reactExports.Fragment && y2, t2 !== reactExports.Fragment && u2), f2);
}
function U$3() {
  let n2 = reactExports.useRef([]), r2 = reactExports.useCallback((e2) => {
    for (let a3 of n2.current) a3 != null && (typeof a3 == "function" ? a3(e2) : a3.current = e2);
  }, []);
  return (...e2) => {
    if (!e2.every((a3) => a3 == null)) return n2.current = e2, r2;
  };
}
function $$2(...n2) {
  return n2.every((r2) => r2 == null) ? void 0 : (r2) => {
    for (let e2 of n2) e2 != null && (typeof e2 == "function" ? e2(r2) : e2.current = r2);
  };
}
function P$2(...n2) {
  if (n2.length === 0) return {};
  if (n2.length === 1) return n2[0];
  let r2 = {}, e2 = {};
  for (let s2 of n2) for (let t2 in s2) t2.startsWith("on") && typeof s2[t2] == "function" ? (e2[t2] != null || (e2[t2] = []), e2[t2].push(s2[t2])) : r2[t2] = s2[t2];
  if (r2.disabled || r2["aria-disabled"]) for (let s2 in e2) /^(on(?:Click|Pointer|Mouse|Key)(?:Down|Up|Press)?)$/.test(s2) && (e2[s2] = [(t2) => {
    var l2;
    return (l2 = t2 == null ? void 0 : t2.preventDefault) == null ? void 0 : l2.call(t2);
  }]);
  for (let s2 in e2) Object.assign(r2, { [s2](t2, ...l2) {
    let i2 = e2[s2];
    for (let o4 of i2) {
      if ((t2 instanceof Event || (t2 == null ? void 0 : t2.nativeEvent) instanceof Event) && t2.defaultPrevented) return;
      o4(t2, ...l2);
    }
  } });
  return r2;
}
function _$3(...n2) {
  if (n2.length === 0) return {};
  if (n2.length === 1) return n2[0];
  let r2 = {}, e2 = {};
  for (let s2 of n2) for (let t2 in s2) t2.startsWith("on") && typeof s2[t2] == "function" ? (e2[t2] != null || (e2[t2] = []), e2[t2].push(s2[t2])) : r2[t2] = s2[t2];
  for (let s2 in e2) Object.assign(r2, { [s2](...t2) {
    let l2 = e2[s2];
    for (let i2 of l2) i2 == null || i2(...t2);
  } });
  return r2;
}
function K(n2) {
  var r2;
  return Object.assign(reactExports.forwardRef(n2), { displayName: (r2 = n2.displayName) != null ? r2 : n2.name });
}
function m$6(n2) {
  let r2 = Object.assign({}, n2);
  for (let e2 in r2) r2[e2] === void 0 && delete r2[e2];
  return r2;
}
function h$5(n2, r2 = []) {
  let e2 = Object.assign({}, n2);
  for (let a3 of r2) a3 in e2 && delete e2[a3];
  return e2;
}
function H$5(n2) {
  return React.version.split(".")[0] >= "19" ? n2.props.ref : n2.ref;
}
function T$4(l2, r2, c2) {
  let [i2, s2] = reactExports.useState(c2), e2 = l2 !== void 0, t2 = reactExports.useRef(e2), u2 = reactExports.useRef(false), d2 = reactExports.useRef(false);
  return e2 && !t2.current && !u2.current ? (u2.current = true, t2.current = e2, console.error("A component is changing from uncontrolled to controlled. This may be caused by the value changing from undefined to a defined value, which should not happen.")) : !e2 && t2.current && !d2.current && (d2.current = true, t2.current = e2, console.error("A component is changing from controlled to uncontrolled. This may be caused by the value changing from a defined value to undefined, which should not happen.")), [e2 ? l2 : i2, o$7((n2) => (e2 || s2(n2), r2 == null ? void 0 : r2(n2)))];
}
function l$6(e2) {
  let [t2] = reactExports.useState(e2);
  return t2;
}
function e$4(i2 = {}, s2 = null, t2 = []) {
  for (let [r2, n2] of Object.entries(i2)) o$6(t2, f$b(s2, r2), n2);
  return t2;
}
function f$b(i2, s2) {
  return i2 ? i2 + "[" + s2 + "]" : s2;
}
function o$6(i2, s2, t2) {
  if (Array.isArray(t2)) for (let [r2, n2] of t2.entries()) o$6(i2, f$b(s2, r2.toString()), n2);
  else t2 instanceof Date ? i2.push([s2, t2.toISOString()]) : typeof t2 == "boolean" ? i2.push([s2, t2 ? "1" : "0"]) : typeof t2 == "string" ? i2.push([s2, t2]) : typeof t2 == "number" ? i2.push([s2, `${t2}`]) : t2 == null ? i2.push([s2, ""]) : e$4(t2, s2, i2);
}
function p$5(i2) {
  var t2, r2;
  let s2 = (t2 = i2 == null ? void 0 : i2.form) != null ? t2 : i2.closest("form");
  if (s2) {
    for (let n2 of s2.elements) if (n2 !== i2 && (n2.tagName === "INPUT" && n2.type === "submit" || n2.tagName === "BUTTON" && n2.type === "submit" || n2.nodeName === "INPUT" && n2.type === "image")) {
      n2.click();
      return;
    }
    (r2 = s2.requestSubmit) == null || r2.call(s2);
  }
}
let a$f = "span";
var s$8 = ((e2) => (e2[e2.None = 1] = "None", e2[e2.Focusable = 2] = "Focusable", e2[e2.Hidden = 4] = "Hidden", e2))(s$8 || {});
function l$5(t2, r2) {
  var n2;
  let { features: d2 = 1, ...e2 } = t2, o4 = { ref: r2, "aria-hidden": (d2 & 2) === 2 ? true : (n2 = e2["aria-hidden"]) != null ? n2 : void 0, hidden: (d2 & 4) === 4 ? true : void 0, style: { position: "fixed", top: 1, left: 1, width: 1, height: 0, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", borderWidth: "0", ...(d2 & 4) === 4 && (d2 & 2) !== 2 && { display: "none" } } };
  return L$4()({ ourProps: o4, theirProps: e2, slot: {}, defaultTag: a$f, name: "Hidden" });
}
let f$a = K(l$5);
let f$9 = reactExports.createContext(null);
function c$6({ children: t2 }) {
  let e2 = reactExports.useContext(f$9);
  if (!e2) return React.createElement(React.Fragment, null, t2);
  let { target: r2 } = e2;
  return r2 ? reactDomExports.createPortal(React.createElement(React.Fragment, null, t2), r2) : null;
}
function j$4({ data: t2, form: e2, disabled: r2, onReset: n2, overrides: F2 }) {
  let [i2, a3] = reactExports.useState(null), p2 = p$6();
  return reactExports.useEffect(() => {
    if (n2 && i2) return p2.addEventListener(i2, "reset", n2);
  }, [i2, e2, n2]), React.createElement(c$6, null, React.createElement(C$6, { setForm: a3, formId: e2 }), e$4(t2).map(([s2, v2]) => React.createElement(f$a, { features: s$8.Hidden, ...m$6({ key: s2, as: "input", type: "hidden", hidden: true, readOnly: true, form: e2, disabled: r2, name: s2, value: v2, ...F2 }) })));
}
function C$6({ setForm: t2, formId: e2 }) {
  return reactExports.useEffect(() => {
    if (e2) {
      let r2 = document.getElementById(e2);
      r2 && t2(r2);
    }
  }, [t2, e2]), e2 ? null : React.createElement(f$a, { features: s$8.Hidden, as: "input", type: "hidden", hidden: true, readOnly: true, ref: (r2) => {
    if (!r2) return;
    let n2 = r2.closest("form");
    n2 && t2(n2);
  } });
}
let e$3 = reactExports.createContext(void 0);
function u$a() {
  return reactExports.useContext(e$3);
}
function o$5(e2) {
  return typeof e2 != "object" || e2 === null ? false : "nodeType" in e2;
}
function t$4(e2) {
  return o$5(e2) && "tagName" in e2;
}
function n$5(e2) {
  return t$4(e2) && "accessKey" in e2;
}
function i$4(e2) {
  return t$4(e2) && "tabIndex" in e2;
}
function r$3(e2) {
  return t$4(e2) && "style" in e2;
}
function u$9(e2) {
  return n$5(e2) && e2.nodeName === "IFRAME";
}
function l$4(e2) {
  return n$5(e2) && e2.nodeName === "INPUT";
}
function m$5(e2) {
  return n$5(e2) && e2.nodeName === "LABEL";
}
function a$e(e2) {
  return n$5(e2) && e2.nodeName === "FIELDSET";
}
function E$5(e2) {
  return n$5(e2) && e2.nodeName === "LEGEND";
}
function L$3(e2) {
  return t$4(e2) ? e2.matches('a[href],audio[controls],button,details,embed,iframe,img[usemap],input:not([type="hidden"]),label,select,textarea,video[controls]') : false;
}
function s$7(l2) {
  let e2 = l2.parentElement, t2 = null;
  for (; e2 && !a$e(e2); ) E$5(e2) && (t2 = e2), e2 = e2.parentElement;
  let i2 = (e2 == null ? void 0 : e2.getAttribute("disabled")) === "";
  return i2 && r$2(t2) ? false : i2;
}
function r$2(l2) {
  if (!l2) return false;
  let e2 = l2.previousElementSibling;
  for (; e2 !== null; ) {
    if (E$5(e2)) return false;
    e2 = e2.previousElementSibling;
  }
  return true;
}
let u$8 = Symbol();
function T$3(t2, n2 = true) {
  return Object.assign(t2, { [u$8]: n2 });
}
function y$7(...t2) {
  let n2 = reactExports.useRef(t2);
  reactExports.useEffect(() => {
    n2.current = t2;
  }, [t2]);
  let c2 = o$7((e2) => {
    for (let o4 of n2.current) o4 != null && (typeof o4 == "function" ? o4(e2) : o4.current = e2);
  });
  return t2.every((e2) => e2 == null || (e2 == null ? void 0 : e2[u$8])) ? void 0 : c2;
}
let a$d = reactExports.createContext(null);
a$d.displayName = "DescriptionContext";
function f$8() {
  let r2 = reactExports.useContext(a$d);
  if (r2 === null) {
    let e2 = new Error("You used a <Description /> component, but it is not inside a relevant parent.");
    throw Error.captureStackTrace && Error.captureStackTrace(e2, f$8), e2;
  }
  return r2;
}
function U$2() {
  var r2, e2;
  return (e2 = (r2 = reactExports.useContext(a$d)) == null ? void 0 : r2.value) != null ? e2 : void 0;
}
function w$5() {
  let [r2, e2] = reactExports.useState([]);
  return [r2.length > 0 ? r2.join(" ") : void 0, reactExports.useMemo(() => function(t2) {
    let i2 = o$7((n2) => (e2((s2) => [...s2, n2]), () => e2((s2) => {
      let o4 = s2.slice(), p2 = o4.indexOf(n2);
      return p2 !== -1 && o4.splice(p2, 1), o4;
    }))), l2 = reactExports.useMemo(() => ({ register: i2, slot: t2.slot, name: t2.name, props: t2.props, value: t2.value }), [i2, t2.slot, t2.name, t2.props, t2.value]);
    return React.createElement(a$d.Provider, { value: l2 }, t2.children);
  }, [e2])];
}
let S$3 = "p";
function C$5(r2, e2) {
  let d2 = reactExports.useId(), t2 = a$g(), { id: i2 = `headlessui-description-${d2}`, ...l2 } = r2, n2 = f$8(), s2 = y$7(e2);
  n$6(() => n2.register(i2), [i2, n2.register]);
  let o4 = t2 || false, p2 = reactExports.useMemo(() => ({ ...n2.slot, disabled: o4 }), [n2.slot, o4]), D2 = { ref: s2, ...n2.props, id: i2 };
  return L$4()({ ourProps: D2, theirProps: l2, slot: p2, defaultTag: S$3, name: n2.name || "Description" });
}
let _$2 = K(C$5), H$4 = Object.assign(_$2, {});
var o$4 = ((r2) => (r2.Space = " ", r2.Enter = "Enter", r2.Escape = "Escape", r2.Backspace = "Backspace", r2.Delete = "Delete", r2.ArrowLeft = "ArrowLeft", r2.ArrowUp = "ArrowUp", r2.ArrowRight = "ArrowRight", r2.ArrowDown = "ArrowDown", r2.Home = "Home", r2.End = "End", r2.PageUp = "PageUp", r2.PageDown = "PageDown", r2.Tab = "Tab", r2))(o$4 || {});
let L$2 = reactExports.createContext(null);
L$2.displayName = "LabelContext";
function C$4() {
  let n2 = reactExports.useContext(L$2);
  if (n2 === null) {
    let l2 = new Error("You used a <Label /> component, but it is not inside a relevant parent.");
    throw Error.captureStackTrace && Error.captureStackTrace(l2, C$4), l2;
  }
  return n2;
}
function N(n2) {
  var a3, e2, o4;
  let l2 = (e2 = (a3 = reactExports.useContext(L$2)) == null ? void 0 : a3.value) != null ? e2 : void 0;
  return ((o4 = n2 == null ? void 0 : n2.length) != null ? o4 : 0) > 0 ? [l2, ...n2].filter(Boolean).join(" ") : l2;
}
function Q({ inherit: n2 = false } = {}) {
  let l2 = N(), [a3, e2] = reactExports.useState([]), o4 = n2 ? [l2, ...a3].filter(Boolean) : a3;
  return [o4.length > 0 ? o4.join(" ") : void 0, reactExports.useMemo(() => function(t2) {
    let p2 = o$7((i2) => (e2((u2) => [...u2, i2]), () => e2((u2) => {
      let d2 = u2.slice(), f2 = d2.indexOf(i2);
      return f2 !== -1 && d2.splice(f2, 1), d2;
    }))), b2 = reactExports.useMemo(() => ({ register: p2, slot: t2.slot, name: t2.name, props: t2.props, value: t2.value }), [p2, t2.slot, t2.name, t2.props, t2.value]);
    return React.createElement(L$2.Provider, { value: b2 }, t2.children);
  }, [e2])];
}
let G$1 = "label";
function U$1(n2, l2) {
  var E3;
  let a3 = reactExports.useId(), e2 = C$4(), o4 = u$a(), y2 = a$g(), { id: t2 = `headlessui-label-${a3}`, htmlFor: p2 = o4 != null ? o4 : (E3 = e2.props) == null ? void 0 : E3.htmlFor, passive: b2 = false, ...i2 } = n2, u2 = y$7(l2);
  n$6(() => e2.register(t2), [t2, e2.register]);
  let d2 = o$7((s2) => {
    let g2 = s2.currentTarget;
    if (!(s2.target !== s2.currentTarget && L$3(s2.target)) && (m$5(g2) && s2.preventDefault(), e2.props && "onClick" in e2.props && typeof e2.props.onClick == "function" && e2.props.onClick(s2), m$5(g2))) {
      let r2 = document.getElementById(g2.htmlFor);
      if (r2) {
        let x2 = r2.getAttribute("disabled");
        if (x2 === "true" || x2 === "") return;
        let h3 = r2.getAttribute("aria-disabled");
        if (h3 === "true" || h3 === "") return;
        (l$4(r2) && (r2.type === "file" || r2.type === "radio" || r2.type === "checkbox") || r2.role === "radio" || r2.role === "checkbox" || r2.role === "switch") && r2.click(), r2.focus({ preventScroll: true });
      }
    }
  }), f2 = y2 || false, R2 = reactExports.useMemo(() => ({ ...e2.slot, disabled: f2 }), [e2.slot, f2]), c2 = { ref: u2, ...e2.props, id: t2, htmlFor: p2, onClick: d2 };
  return b2 && ("onClick" in c2 && (delete c2.htmlFor, delete c2.onClick), "onClick" in i2 && delete i2.onClick), L$4()({ ourProps: c2, theirProps: i2, slot: R2, defaultTag: p2 ? G$1 : "div", name: e2.name || "Label" });
}
let j$3 = K(U$1), V$1 = Object.assign(j$3, {});
let e$2 = reactExports.createContext(() => {
});
function C$3({ value: t2, children: o4 }) {
  return React.createElement(e$2.Provider, { value: t2 }, o4);
}
function l$3(e2, r2) {
  return e2 !== null && r2 !== null && typeof e2 == "object" && typeof r2 == "object" && "id" in e2 && "id" in r2 ? e2.id === r2.id : e2 === r2;
}
function u$7(e2 = l$3) {
  return reactExports.useCallback((r2, t2) => {
    if (typeof e2 == "string") {
      let o4 = e2;
      return (r2 == null ? void 0 : r2[o4]) === (t2 == null ? void 0 : t2[o4]);
    }
    return e2(r2, t2);
  }, [e2]);
}
function f$7(e2) {
  if (e2 === null) return { width: 0, height: 0 };
  let { width: t2, height: r2 } = e2.getBoundingClientRect();
  return { width: t2, height: r2 };
}
function d$2(e2, t2 = false) {
  let [r2, u2] = reactExports.useReducer(() => ({}), {}), i2 = reactExports.useMemo(() => f$7(e2), [e2, r2]);
  return n$6(() => {
    if (!e2) return;
    let n2 = new ResizeObserver(u2);
    return n2.observe(e2), () => {
      n2.disconnect();
    };
  }, [e2]), t2 ? { width: `${i2.width}px`, height: `${i2.height}px` } : i2;
}
let a$c = class a extends Map {
  constructor(t2) {
    super();
    this.factory = t2;
  }
  get(t2) {
    let e2 = super.get(t2);
    return e2 === void 0 && (e2 = this.factory(t2), this.set(t2, e2)), e2;
  }
};
var p$4 = Object.defineProperty;
var h$4 = (t2, e2, r2) => e2 in t2 ? p$4(t2, e2, { enumerable: true, configurable: true, writable: true, value: r2 }) : t2[e2] = r2;
var f$6 = (t2, e2, r2) => (h$4(t2, e2 + "", r2), r2), b$3 = (t2, e2, r2) => {
  if (!e2.has(t2)) throw TypeError("Cannot " + r2);
};
var n$4 = (t2, e2, r2) => (b$3(t2, e2, "read from private field"), r2 ? r2.call(t2) : e2.get(t2)), c$5 = (t2, e2, r2) => {
  if (e2.has(t2)) throw TypeError("Cannot add the same private member more than once");
  e2 instanceof WeakSet ? e2.add(t2) : e2.set(t2, r2);
}, u$6 = (t2, e2, r2, s2) => (b$3(t2, e2, "write to private field"), e2.set(t2, r2), r2);
var i$3, a$b, o$3;
let E$4 = class E {
  constructor(e2) {
    c$5(this, i$3, {});
    c$5(this, a$b, new a$c(() => /* @__PURE__ */ new Set()));
    c$5(this, o$3, /* @__PURE__ */ new Set());
    f$6(this, "disposables", o$8());
    u$6(this, i$3, e2);
  }
  dispose() {
    this.disposables.dispose();
  }
  get state() {
    return n$4(this, i$3);
  }
  subscribe(e2, r2) {
    let s2 = { selector: e2, callback: r2, current: e2(n$4(this, i$3)) };
    return n$4(this, o$3).add(s2), this.disposables.add(() => {
      n$4(this, o$3).delete(s2);
    });
  }
  on(e2, r2) {
    return n$4(this, a$b).get(e2).add(r2), this.disposables.add(() => {
      n$4(this, a$b).get(e2).delete(r2);
    });
  }
  send(e2) {
    let r2 = this.reduce(n$4(this, i$3), e2);
    if (r2 !== n$4(this, i$3)) {
      u$6(this, i$3, r2);
      for (let s2 of n$4(this, o$3)) {
        let l2 = s2.selector(n$4(this, i$3));
        j$2(s2.current, l2) || (s2.current = l2, s2.callback(l2));
      }
      for (let s2 of n$4(this, a$b).get(e2.type)) s2(n$4(this, i$3), e2);
    }
  }
};
i$3 = /* @__PURE__ */ new WeakMap(), a$b = /* @__PURE__ */ new WeakMap(), o$3 = /* @__PURE__ */ new WeakMap();
function j$2(t2, e2) {
  return Object.is(t2, e2) ? true : typeof t2 != "object" || t2 === null || typeof e2 != "object" || e2 === null ? false : Array.isArray(t2) && Array.isArray(e2) ? t2.length !== e2.length ? false : d$1(t2[Symbol.iterator](), e2[Symbol.iterator]()) : t2 instanceof Map && e2 instanceof Map || t2 instanceof Set && e2 instanceof Set ? t2.size !== e2.size ? false : d$1(t2.entries(), e2.entries()) : y$6(t2) && y$6(e2) ? d$1(Object.entries(t2)[Symbol.iterator](), Object.entries(e2)[Symbol.iterator]()) : false;
}
function d$1(t2, e2) {
  do {
    let r2 = t2.next(), s2 = e2.next();
    if (r2.done && s2.done) return true;
    if (r2.done || s2.done || !Object.is(r2.value, s2.value)) return false;
  } while (true);
}
function y$6(t2) {
  if (Object.prototype.toString.call(t2) !== "[object Object]") return false;
  let e2 = Object.getPrototypeOf(t2);
  return e2 === null || Object.getPrototypeOf(e2) === null;
}
function x$4(t2) {
  let [e2, r2] = t2(), s2 = o$8();
  return (...l2) => {
    e2(...l2), s2.dispose(), s2.microTask(r2);
  };
}
var a$a = Object.defineProperty;
var r$1 = (e2, c2, t2) => c2 in e2 ? a$a(e2, c2, { enumerable: true, configurable: true, writable: true, value: t2 }) : e2[c2] = t2;
var p$3 = (e2, c2, t2) => (r$1(e2, typeof c2 != "symbol" ? c2 + "" : c2, t2), t2);
var k$3 = ((t2) => (t2[t2.Push = 0] = "Push", t2[t2.Pop = 1] = "Pop", t2))(k$3 || {});
let y$5 = { [0](e2, c2) {
  let t2 = c2.id, s2 = e2.stack, i2 = e2.stack.indexOf(t2);
  if (i2 !== -1) {
    let n2 = e2.stack.slice();
    return n2.splice(i2, 1), n2.push(t2), s2 = n2, { ...e2, stack: s2 };
  }
  return { ...e2, stack: [...e2.stack, t2] };
}, [1](e2, c2) {
  let t2 = c2.id, s2 = e2.stack.indexOf(t2);
  if (s2 === -1) return e2;
  let i2 = e2.stack.slice();
  return i2.splice(s2, 1), { ...e2, stack: i2 };
} };
let o$2 = class o2 extends E$4 {
  constructor() {
    super(...arguments);
    p$3(this, "actions", { push: (t2) => this.send({ type: 0, id: t2 }), pop: (t2) => this.send({ type: 1, id: t2 }) });
    p$3(this, "selectors", { isTop: (t2, s2) => t2.stack[t2.stack.length - 1] === s2, inStack: (t2, s2) => t2.stack.includes(s2) });
  }
  static new() {
    return new o2({ stack: [] });
  }
  reduce(t2, s2) {
    return u$b(s2.type, y$5, t2, s2);
  }
};
const x$3 = new a$c(() => o$2.new());
function S$2(e2, n2, r2 = j$2) {
  return withSelectorExports.useSyncExternalStoreWithSelector(o$7((i2) => e2.subscribe(s$6, i2)), o$7(() => e2.state), o$7(() => e2.state), o$7(n2), r2);
}
function s$6(e2) {
  return e2;
}
function I$3(o4, s2) {
  let t2 = reactExports.useId(), r2 = x$3.get(s2), [i2, c2] = S$2(r2, reactExports.useCallback((e2) => [r2.selectors.isTop(e2, t2), r2.selectors.inStack(e2, t2)], [r2, t2]));
  return n$6(() => {
    if (o4) return r2.actions.push(t2), () => r2.actions.pop(t2);
  }, [r2, o4, t2]), o4 ? c2 ? i2 : true : false;
}
let f$5 = /* @__PURE__ */ new Map(), u$5 = /* @__PURE__ */ new Map();
function h$3(t2) {
  var e2;
  let r2 = (e2 = u$5.get(t2)) != null ? e2 : 0;
  return u$5.set(t2, r2 + 1), r2 !== 0 ? () => m$4(t2) : (f$5.set(t2, { "aria-hidden": t2.getAttribute("aria-hidden"), inert: t2.inert }), t2.setAttribute("aria-hidden", "true"), t2.inert = true, () => m$4(t2));
}
function m$4(t2) {
  var i2;
  let r2 = (i2 = u$5.get(t2)) != null ? i2 : 1;
  if (r2 === 1 ? u$5.delete(t2) : u$5.set(t2, r2 - 1), r2 !== 1) return;
  let e2 = f$5.get(t2);
  e2 && (e2["aria-hidden"] === null ? t2.removeAttribute("aria-hidden") : t2.setAttribute("aria-hidden", e2["aria-hidden"]), t2.inert = e2.inert, f$5.delete(t2));
}
function y$4(t2, { allowed: r2, disallowed: e2 } = {}) {
  let i2 = I$3(t2, "inert-others");
  n$6(() => {
    var d2, c2;
    if (!i2) return;
    let a3 = o$8();
    for (let n2 of (d2 = e2 == null ? void 0 : e2()) != null ? d2 : []) n2 && a3.add(h$3(n2));
    let s2 = (c2 = r2 == null ? void 0 : r2()) != null ? c2 : [];
    for (let n2 of s2) {
      if (!n2) continue;
      let l2 = o$9(n2);
      if (!l2) continue;
      let o4 = n2.parentElement;
      for (; o4 && o4 !== l2.body; ) {
        for (let p2 of o4.children) s2.some((E3) => p2.contains(E3)) || a3.add(h$3(p2));
        o4 = o4.parentElement;
      }
    }
    return a3.dispose;
  }, [i2, r2, e2]);
}
function p$2(s2, n2, o4) {
  let i2 = s$9((t2) => {
    let e2 = t2.getBoundingClientRect();
    e2.x === 0 && e2.y === 0 && e2.width === 0 && e2.height === 0 && o4();
  });
  reactExports.useEffect(() => {
    if (!s2) return;
    let t2 = n2 === null ? null : n$5(n2) ? n2 : n2.current;
    if (!t2) return;
    let e2 = o$8();
    if (typeof ResizeObserver != "undefined") {
      let r2 = new ResizeObserver(() => i2.current(t2));
      r2.observe(t2), e2.add(() => r2.disconnect());
    }
    if (typeof IntersectionObserver != "undefined") {
      let r2 = new IntersectionObserver(() => i2.current(t2));
      r2.observe(t2), e2.add(() => r2.disconnect());
    }
    return () => e2.dispose();
  }, [n2, i2, s2]);
}
let f$4 = ["[contentEditable=true]", "[tabindex]", "a[href]", "area[href]", "button:not([disabled])", "iframe", "input:not([disabled])", "select:not([disabled])", "textarea:not([disabled])"].map((e2) => `${e2}:not([tabindex='-1'])`).join(","), F$5 = ["[data-autofocus]"].map((e2) => `${e2}:not([tabindex='-1'])`).join(",");
var T$2 = ((n2) => (n2[n2.First = 1] = "First", n2[n2.Previous = 2] = "Previous", n2[n2.Next = 4] = "Next", n2[n2.Last = 8] = "Last", n2[n2.WrapAround = 16] = "WrapAround", n2[n2.NoScroll = 32] = "NoScroll", n2[n2.AutoFocus = 64] = "AutoFocus", n2))(T$2 || {}), y$3 = ((o4) => (o4[o4.Error = 0] = "Error", o4[o4.Overflow = 1] = "Overflow", o4[o4.Success = 2] = "Success", o4[o4.Underflow = 3] = "Underflow", o4))(y$3 || {}), S$1 = ((t2) => (t2[t2.Previous = -1] = "Previous", t2[t2.Next = 1] = "Next", t2))(S$1 || {});
function b$2(e2 = document.body) {
  return e2 == null ? [] : Array.from(e2.querySelectorAll(f$4)).sort((r2, t2) => Math.sign((r2.tabIndex || Number.MAX_SAFE_INTEGER) - (t2.tabIndex || Number.MAX_SAFE_INTEGER)));
}
function O$3(e2 = document.body) {
  return e2 == null ? [] : Array.from(e2.querySelectorAll(F$5)).sort((r2, t2) => Math.sign((r2.tabIndex || Number.MAX_SAFE_INTEGER) - (t2.tabIndex || Number.MAX_SAFE_INTEGER)));
}
var h$2 = ((t2) => (t2[t2.Strict = 0] = "Strict", t2[t2.Loose = 1] = "Loose", t2))(h$2 || {});
function A(e2, r2 = 0) {
  var t2;
  return e2 === ((t2 = o$9(e2)) == null ? void 0 : t2.body) ? false : u$b(r2, { [0]() {
    return e2.matches(f$4);
  }, [1]() {
    let l2 = e2;
    for (; l2 !== null; ) {
      if (l2.matches(f$4)) return true;
      l2 = l2.parentElement;
    }
    return false;
  } });
}
function V(e2) {
  let r2 = o$9(e2);
  o$8().nextFrame(() => {
    r2 && i$4(r2.activeElement) && !A(r2.activeElement, 0) && I$2(e2);
  });
}
var H$3 = ((t2) => (t2[t2.Keyboard = 0] = "Keyboard", t2[t2.Mouse = 1] = "Mouse", t2))(H$3 || {});
typeof window != "undefined" && typeof document != "undefined" && (document.addEventListener("keydown", (e2) => {
  e2.metaKey || e2.altKey || e2.ctrlKey || (document.documentElement.dataset.headlessuiFocusVisible = "");
}, true), document.addEventListener("click", (e2) => {
  e2.detail === 1 ? delete document.documentElement.dataset.headlessuiFocusVisible : e2.detail === 0 && (document.documentElement.dataset.headlessuiFocusVisible = "");
}, true));
function I$2(e2) {
  e2 == null || e2.focus({ preventScroll: true });
}
let w$4 = ["textarea", "input"].join(",");
function _$1(e2) {
  var r2, t2;
  return (t2 = (r2 = e2 == null ? void 0 : e2.matches) == null ? void 0 : r2.call(e2, w$4)) != null ? t2 : false;
}
function P$1(e2, r2 = (t2) => t2) {
  return e2.slice().sort((t2, l2) => {
    let o4 = r2(t2), c2 = r2(l2);
    if (o4 === null || c2 === null) return 0;
    let u2 = o4.compareDocumentPosition(c2);
    return u2 & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : u2 & Node.DOCUMENT_POSITION_PRECEDING ? 1 : 0;
  });
}
function j$1(e2, r2) {
  return g$3(b$2(), r2, { relativeTo: e2 });
}
function g$3(e2, r2, { sorted: t2 = true, relativeTo: l2 = null, skipElements: o4 = [] } = {}) {
  let c2 = Array.isArray(e2) ? e2.length > 0 ? e2[0].ownerDocument : document : e2.ownerDocument, u2 = Array.isArray(e2) ? t2 ? P$1(e2) : e2 : r2 & 64 ? O$3(e2) : b$2(e2);
  o4.length > 0 && u2.length > 1 && (u2 = u2.filter((s2) => !o4.some((a3) => a3 != null && "current" in a3 ? (a3 == null ? void 0 : a3.current) === s2 : a3 === s2))), l2 = l2 != null ? l2 : c2.activeElement;
  let n2 = (() => {
    if (r2 & 5) return 1;
    if (r2 & 10) return -1;
    throw new Error("Missing Focus.First, Focus.Previous, Focus.Next or Focus.Last");
  })(), x2 = (() => {
    if (r2 & 1) return 0;
    if (r2 & 2) return Math.max(0, u2.indexOf(l2)) - 1;
    if (r2 & 4) return Math.max(0, u2.indexOf(l2)) + 1;
    if (r2 & 8) return u2.length - 1;
    throw new Error("Missing Focus.First, Focus.Previous, Focus.Next or Focus.Last");
  })(), M2 = r2 & 32 ? { preventScroll: true } : {}, m2 = 0, d2 = u2.length, i2;
  do {
    if (m2 >= d2 || m2 + d2 <= 0) return 0;
    let s2 = x2 + m2;
    if (r2 & 16) s2 = (s2 + d2) % d2;
    else {
      if (s2 < 0) return 3;
      if (s2 >= d2) return 1;
    }
    i2 = u2[s2], i2 == null || i2.focus(M2), m2 += n2;
  } while (i2 !== c2.activeElement);
  return r2 & 6 && _$1(i2) && i2.select(), 2;
}
function t$3() {
  return /iPhone/gi.test(window.navigator.platform) || /Mac/gi.test(window.navigator.platform) && window.navigator.maxTouchPoints > 0;
}
function i$2() {
  return /Android/gi.test(window.navigator.userAgent);
}
function n$3() {
  return t$3() || i$2();
}
function i$1(t2, e2, o4, n2) {
  let u2 = s$9(o4);
  reactExports.useEffect(() => {
    if (!t2) return;
    function r2(m2) {
      u2.current(m2);
    }
    return document.addEventListener(e2, r2, n2), () => document.removeEventListener(e2, r2, n2);
  }, [t2, e2, n2]);
}
function s$5(t2, e2, o4, n2) {
  let i2 = s$9(o4);
  reactExports.useEffect(() => {
    if (!t2) return;
    function r2(d2) {
      i2.current(d2);
    }
    return window.addEventListener(e2, r2, n2), () => window.removeEventListener(e2, r2, n2);
  }, [t2, e2, n2]);
}
const C$2 = 30;
function k$2(o4, f2, h3) {
  let m2 = s$9(h3), s2 = reactExports.useCallback(function(e2, c2) {
    if (e2.defaultPrevented) return;
    let r2 = c2(e2);
    if (r2 === null || !r2.getRootNode().contains(r2) || !r2.isConnected) return;
    let M2 = function u2(n2) {
      return typeof n2 == "function" ? u2(n2()) : Array.isArray(n2) || n2 instanceof Set ? n2 : [n2];
    }(f2);
    for (let u2 of M2) if (u2 !== null && (u2.contains(r2) || e2.composed && e2.composedPath().includes(u2))) return;
    return !A(r2, h$2.Loose) && r2.tabIndex !== -1 && e2.preventDefault(), m2.current(e2, r2);
  }, [m2, f2]), i2 = reactExports.useRef(null);
  i$1(o4, "pointerdown", (t2) => {
    var e2, c2;
    n$3() || (i2.current = ((c2 = (e2 = t2.composedPath) == null ? void 0 : e2.call(t2)) == null ? void 0 : c2[0]) || t2.target);
  }, true), i$1(o4, "pointerup", (t2) => {
    if (n$3() || !i2.current) return;
    let e2 = i2.current;
    return i2.current = null, s2(t2, () => e2);
  }, true);
  let l2 = reactExports.useRef({ x: 0, y: 0 });
  i$1(o4, "touchstart", (t2) => {
    l2.current.x = t2.touches[0].clientX, l2.current.y = t2.touches[0].clientY;
  }, true), i$1(o4, "touchend", (t2) => {
    let e2 = { x: t2.changedTouches[0].clientX, y: t2.changedTouches[0].clientY };
    if (!(Math.abs(e2.x - l2.current.x) >= C$2 || Math.abs(e2.y - l2.current.y) >= C$2)) return s2(t2, () => i$4(t2.target) ? t2.target : null);
  }, true), s$5(o4, "blur", (t2) => s2(t2, () => u$9(window.document.activeElement) ? window.document.activeElement : null), true);
}
function n$2(...e2) {
  return reactExports.useMemo(() => o$9(...e2), [...e2]);
}
var m$3 = ((e2) => (e2[e2.Ignore = 0] = "Ignore", e2[e2.Select = 1] = "Select", e2[e2.Close = 2] = "Close", e2))(m$3 || {});
const g$2 = { Ignore: { kind: 0 }, Select: (r2) => ({ kind: 1, target: r2 }), Close: { kind: 2 } }, E$3 = 200;
function k$1(r2, { trigger: n2, action: s2, close: e2, select: a3 }) {
  let o4 = reactExports.useRef(null);
  i$1(r2 && n2 !== null, "pointerdown", (t2) => {
    o$5(t2 == null ? void 0 : t2.target) && n2 != null && n2.contains(t2.target) && (o4.current = /* @__PURE__ */ new Date());
  }), i$1(r2 && n2 !== null, "pointerup", (t2) => {
    if (o4.current === null || !i$4(t2.target)) return;
    let i2 = s2(t2), u2 = (/* @__PURE__ */ new Date()).getTime() - o4.current.getTime();
    switch (o4.current = null, i2.kind) {
      case 0:
        return;
      case 1: {
        u2 > E$3 && (a3(i2.target), e2());
        break;
      }
      case 2: {
        e2();
        break;
      }
    }
  }, { capture: true });
}
function E$2(n2, e2, a3, t2) {
  let i2 = s$9(a3);
  reactExports.useEffect(() => {
    n2 = n2 != null ? n2 : window;
    function r2(o4) {
      i2.current(o4);
    }
    return n2.addEventListener(e2, r2, t2), () => n2.removeEventListener(e2, r2, t2);
  }, [n2, e2, t2]);
}
function e$1(t2, u2) {
  return reactExports.useMemo(() => {
    var n2;
    if (t2.type) return t2.type;
    let r2 = (n2 = t2.as) != null ? n2 : "button";
    if (typeof r2 == "string" && r2.toLowerCase() === "button" || (u2 == null ? void 0 : u2.tagName) === "BUTTON" && !u2.hasAttribute("type")) return "button";
  }, [t2.type, t2.as, u2]);
}
function o$1(t2) {
  return reactExports.useSyncExternalStore(t2.subscribe, t2.getSnapshot, t2.getSnapshot);
}
function a$9(o4, r2) {
  let t2 = o4(), n2 = /* @__PURE__ */ new Set();
  return { getSnapshot() {
    return t2;
  }, subscribe(e2) {
    return n2.add(e2), () => n2.delete(e2);
  }, dispatch(e2, ...s2) {
    let i2 = r2[e2].call(t2, ...s2);
    i2 && (t2 = i2, n2.forEach((c2) => c2()));
  } };
}
function d() {
  let r2;
  return { before({ doc: e2 }) {
    var l2;
    let o4 = e2.documentElement, t2 = (l2 = e2.defaultView) != null ? l2 : window;
    r2 = Math.max(0, t2.innerWidth - o4.clientWidth);
  }, after({ doc: e2, d: o4 }) {
    let t2 = e2.documentElement, l2 = Math.max(0, t2.clientWidth - t2.offsetWidth), n2 = Math.max(0, r2 - l2);
    o4.style(t2, "paddingRight", `${n2}px`);
  } };
}
function w$3() {
  return t$3() ? { before({ doc: n2, d: l2, meta: f2 }) {
    function i2(a3) {
      return f2.containers.flatMap((r2) => r2()).some((r2) => r2.contains(a3));
    }
    l2.microTask(() => {
      var c2;
      if (window.getComputedStyle(n2.documentElement).scrollBehavior !== "auto") {
        let t2 = o$8();
        t2.style(n2.documentElement, "scrollBehavior", "auto"), l2.add(() => l2.microTask(() => t2.dispose()));
      }
      let a3 = (c2 = window.scrollY) != null ? c2 : window.pageYOffset, r2 = null;
      l2.addEventListener(n2, "click", (t2) => {
        if (i$4(t2.target)) try {
          let e2 = t2.target.closest("a");
          if (!e2) return;
          let { hash: m2 } = new URL(e2.href), s2 = n2.querySelector(m2);
          i$4(s2) && !i2(s2) && (r2 = s2);
        } catch {
        }
      }, true), l2.addEventListener(n2, "touchstart", (t2) => {
        if (i$4(t2.target) && r$3(t2.target)) if (i2(t2.target)) {
          let e2 = t2.target;
          for (; e2.parentElement && i2(e2.parentElement); ) e2 = e2.parentElement;
          l2.style(e2, "overscrollBehavior", "contain");
        } else l2.style(t2.target, "touchAction", "none");
      }), l2.addEventListener(n2, "touchmove", (t2) => {
        if (i$4(t2.target)) {
          if (l$4(t2.target)) return;
          if (i2(t2.target)) {
            let e2 = t2.target;
            for (; e2.parentElement && e2.dataset.headlessuiPortal !== "" && !(e2.scrollHeight > e2.clientHeight || e2.scrollWidth > e2.clientWidth); ) e2 = e2.parentElement;
            e2.dataset.headlessuiPortal === "" && t2.preventDefault();
          } else t2.preventDefault();
        }
      }, { passive: false }), l2.add(() => {
        var e2;
        let t2 = (e2 = window.scrollY) != null ? e2 : window.pageYOffset;
        a3 !== t2 && window.scrollTo(0, a3), r2 && r2.isConnected && (r2.scrollIntoView({ block: "nearest" }), r2 = null);
      });
    });
  } } : {};
}
function r() {
  return { before({ doc: e2, d: o4 }) {
    o4.style(e2.documentElement, "overflow", "hidden");
  } };
}
function m$2(e2) {
  let n2 = {};
  for (let t2 of e2) Object.assign(n2, t2(n2));
  return n2;
}
let a$8 = a$9(() => /* @__PURE__ */ new Map(), { PUSH(e2, n2) {
  var o4;
  let t2 = (o4 = this.get(e2)) != null ? o4 : { doc: e2, count: 0, d: o$8(), meta: /* @__PURE__ */ new Set() };
  return t2.count++, t2.meta.add(n2), this.set(e2, t2), this;
}, POP(e2, n2) {
  let t2 = this.get(e2);
  return t2 && (t2.count--, t2.meta.delete(n2)), this;
}, SCROLL_PREVENT({ doc: e2, d: n2, meta: t2 }) {
  let o4 = { doc: e2, d: n2, meta: m$2(t2) }, c2 = [w$3(), d(), r()];
  c2.forEach(({ before: r2 }) => r2 == null ? void 0 : r2(o4)), c2.forEach(({ after: r2 }) => r2 == null ? void 0 : r2(o4));
}, SCROLL_ALLOW({ d: e2 }) {
  e2.dispose();
}, TEARDOWN({ doc: e2 }) {
  this.delete(e2);
} });
a$8.subscribe(() => {
  let e2 = a$8.getSnapshot(), n2 = /* @__PURE__ */ new Map();
  for (let [t2] of e2) n2.set(t2, t2.documentElement.style.overflow);
  for (let t2 of e2.values()) {
    let o4 = n2.get(t2.doc) === "hidden", c2 = t2.count !== 0;
    (c2 && !o4 || !c2 && o4) && a$8.dispatch(t2.count > 0 ? "SCROLL_PREVENT" : "SCROLL_ALLOW", t2), t2.count === 0 && a$8.dispatch("TEARDOWN", t2);
  }
});
function a$7(r2, e2, n2 = () => ({ containers: [] })) {
  let f2 = o$1(a$8), o4 = e2 ? f2.get(e2) : void 0, i2 = o4 ? o4.count > 0 : false;
  return n$6(() => {
    if (!(!e2 || !r2)) return a$8.dispatch("PUSH", e2, n2), () => a$8.dispatch("POP", e2, n2);
  }, [r2, e2]), i2;
}
function f$3(e2, c2, n2 = () => [document.body]) {
  let r2 = I$3(e2, "scroll-lock");
  a$7(r2, c2, (t2) => {
    var o4;
    return { containers: [...(o4 = t2.containers) != null ? o4 : [], n2] };
  });
}
function t$2(e2) {
  return [e2.screenX, e2.screenY];
}
function u$4() {
  let e2 = reactExports.useRef([-1, -1]);
  return { wasMoved(r2) {
    let n2 = t$2(r2);
    return e2.current[0] === n2[0] && e2.current[1] === n2[1] ? false : (e2.current = n2, true);
  }, update(r2) {
    e2.current = t$2(r2);
  } };
}
function c$4(u2 = 0) {
  let [t2, l2] = reactExports.useState(u2), g2 = reactExports.useCallback((e2) => l2(e2), [t2]), s2 = reactExports.useCallback((e2) => l2((a3) => a3 | e2), [t2]), m2 = reactExports.useCallback((e2) => (t2 & e2) === e2, [t2]), n2 = reactExports.useCallback((e2) => l2((a3) => a3 & ~e2), [l2]), F2 = reactExports.useCallback((e2) => l2((a3) => a3 ^ e2), [l2]);
  return { flags: t2, setFlag: g2, addFlag: s2, hasFlag: m2, removeFlag: n2, toggleFlag: F2 };
}
var define_process_env_default = {};
var T$1, b$1;
typeof process$1 != "undefined" && typeof globalThis != "undefined" && typeof Element != "undefined" && ((T$1 = process$1 == null ? void 0 : define_process_env_default) == null ? void 0 : T$1["NODE_ENV"]) === "test" && typeof ((b$1 = Element == null ? void 0 : Element.prototype) == null ? void 0 : b$1.getAnimations) == "undefined" && (Element.prototype.getAnimations = function() {
  return console.warn(["Headless UI has polyfilled `Element.prototype.getAnimations` for your tests.", "Please install a proper polyfill e.g. `jsdom-testing-mocks`, to silence these warnings.", "", "Example usage:", "```js", "import { mockAnimationsApi } from 'jsdom-testing-mocks'", "mockAnimationsApi()", "```"].join(`
`)), [];
});
var L$1 = ((r2) => (r2[r2.None = 0] = "None", r2[r2.Closed = 1] = "Closed", r2[r2.Enter = 2] = "Enter", r2[r2.Leave = 4] = "Leave", r2))(L$1 || {});
function R(t2) {
  let n2 = {};
  for (let e2 in t2) t2[e2] === true && (n2[`data-${e2}`] = "");
  return n2;
}
function x$2(t2, n2, e2, i2) {
  let [r2, o4] = reactExports.useState(e2), { hasFlag: s2, addFlag: a3, removeFlag: l2 } = c$4(t2 && r2 ? 3 : 0), u2 = reactExports.useRef(false), f2 = reactExports.useRef(false), E3 = p$6();
  return n$6(() => {
    var d2;
    if (t2) {
      if (e2 && o4(true), !n2) {
        e2 && a3(3);
        return;
      }
      return (d2 = i2 == null ? void 0 : i2.start) == null || d2.call(i2, e2), C$1(n2, { inFlight: u2, prepare() {
        f2.current ? f2.current = false : f2.current = u2.current, u2.current = true, !f2.current && (e2 ? (a3(3), l2(4)) : (a3(4), l2(2)));
      }, run() {
        f2.current ? e2 ? (l2(3), a3(4)) : (l2(4), a3(3)) : e2 ? l2(1) : a3(1);
      }, done() {
        var p2;
        f2.current && typeof n2.getAnimations == "function" && n2.getAnimations().length > 0 || (u2.current = false, l2(7), e2 || o4(false), (p2 = i2 == null ? void 0 : i2.end) == null || p2.call(i2, e2));
      } });
    }
  }, [t2, e2, n2, E3]), t2 ? [r2, { closed: s2(1), enter: s2(2), leave: s2(4), transition: s2(2) || s2(4) }] : [e2, { closed: void 0, enter: void 0, leave: void 0, transition: void 0 }];
}
function C$1(t2, { prepare: n2, run: e2, done: i2, inFlight: r2 }) {
  let o4 = o$8();
  return j(t2, { prepare: n2, inFlight: r2 }), o4.nextFrame(() => {
    e2(), o4.requestAnimationFrame(() => {
      o4.add(M$4(t2, i2));
    });
  }), o4.dispose;
}
function M$4(t2, n2) {
  var o4, s2;
  let e2 = o$8();
  if (!t2) return e2.dispose;
  let i2 = false;
  e2.add(() => {
    i2 = true;
  });
  let r2 = (s2 = (o4 = t2.getAnimations) == null ? void 0 : o4.call(t2).filter((a3) => a3 instanceof CSSTransition)) != null ? s2 : [];
  return r2.length === 0 ? (n2(), e2.dispose) : (Promise.allSettled(r2.map((a3) => a3.finished)).then(() => {
    i2 || n2();
  }), e2.dispose);
}
function j(t2, { inFlight: n2, prepare: e2 }) {
  if (n2 != null && n2.current) {
    e2();
    return;
  }
  let i2 = t2.style.transition;
  t2.style.transition = "none", e2(), t2.offsetHeight, t2.style.transition = i2;
}
function F$4(c2, { container: e2, accept: t2, walk: r2 }) {
  let o4 = reactExports.useRef(t2), l2 = reactExports.useRef(r2);
  reactExports.useEffect(() => {
    o4.current = t2, l2.current = r2;
  }, [t2, r2]), n$6(() => {
    if (!e2 || !c2) return;
    let n2 = o$9(e2);
    if (!n2) return;
    let f2 = o4.current, p2 = l2.current, i2 = Object.assign((m2) => f2(m2), { acceptNode: f2 }), u2 = n2.createTreeWalker(e2, NodeFilter.SHOW_ELEMENT, i2, false);
    for (; u2.nextNode(); ) p2(u2.currentNode);
  }, [e2, c2, o4, l2]);
}
function m$1(u2, t2) {
  let e2 = reactExports.useRef([]), r2 = o$7(u2);
  reactExports.useEffect(() => {
    let o4 = [...e2.current];
    for (let [a3, l2] of t2.entries()) if (e2.current[a3] !== l2) {
      let n2 = r2(t2, o4);
      return e2.current = t2, n2;
    }
  }, [r2, ...t2]);
}
let y$2 = reactExports.createContext({ styles: void 0, setReference: () => {
}, setFloating: () => {
}, getReferenceProps: () => ({}), getFloatingProps: () => ({}), slot: {} });
y$2.displayName = "FloatingContext";
let $$1 = reactExports.createContext(null);
$$1.displayName = "PlacementContext";
function ye$1(e2) {
  return reactExports.useMemo(() => e2 ? typeof e2 == "string" ? { to: e2 } : e2 : null, [e2]);
}
function Fe$1() {
  return reactExports.useContext(y$2).setReference;
}
function be$1() {
  return reactExports.useContext(y$2).getReferenceProps;
}
function Te$2() {
  let { getFloatingProps: e2, slot: t2 } = reactExports.useContext(y$2);
  return reactExports.useCallback((...n2) => Object.assign({}, e2(...n2), { "data-anchor": t2.anchor }), [e2, t2]);
}
function Re$2(e2 = null) {
  e2 === false && (e2 = null), typeof e2 == "string" && (e2 = { to: e2 });
  let t2 = reactExports.useContext($$1), n2 = reactExports.useMemo(() => e2, [JSON.stringify(e2, (l2, o4) => {
    var u2;
    return (u2 = o4 == null ? void 0 : o4.outerHTML) != null ? u2 : o4;
  })]);
  n$6(() => {
    t2 == null || t2(n2 != null ? n2 : null);
  }, [t2, n2]);
  let r2 = reactExports.useContext(y$2);
  return reactExports.useMemo(() => [r2.setFloating, e2 ? r2.styles : {}], [r2.setFloating, e2, r2.styles]);
}
let D$3 = 4;
function Ae$2({ children: e2, enabled: t2 = true }) {
  let [n2, r2] = reactExports.useState(null), [l2, o4] = reactExports.useState(0), u2 = reactExports.useRef(null), [f2, s2] = reactExports.useState(null);
  ce(f2);
  let i2 = t2 && n2 !== null && f2 !== null, { to: F2 = "bottom", gap: E3 = 0, offset: A2 = 0, padding: c2 = 0, inner: h3 } = ge$1(n2, f2), [a3, p2 = "center"] = F2.split(" ");
  n$6(() => {
    i2 && o4(0);
  }, [i2]);
  let { refs: b2, floatingStyles: S2, context: g2 } = useFloating({ open: i2, placement: a3 === "selection" ? p2 === "center" ? "bottom" : `bottom-${p2}` : p2 === "center" ? `${a3}` : `${a3}-${p2}`, strategy: "absolute", transform: false, middleware: [offset({ mainAxis: a3 === "selection" ? 0 : E3, crossAxis: A2 }), shift({ padding: c2 }), a3 !== "selection" && flip({ padding: c2 }), a3 === "selection" && h3 ? inner({ ...h3, padding: c2, overflowRef: u2, offset: l2, minItemsVisible: D$3, referenceOverflowThreshold: c2, onFallbackChange(P2) {
    var L2, N2;
    if (!P2) return;
    let d2 = g2.elements.floating;
    if (!d2) return;
    let M2 = parseFloat(getComputedStyle(d2).scrollPaddingBottom) || 0, I2 = Math.min(D$3, d2.childElementCount), W = 0, B2 = 0;
    for (let m2 of (N2 = (L2 = g2.elements.floating) == null ? void 0 : L2.childNodes) != null ? N2 : []) if (n$5(m2)) {
      let x2 = m2.offsetTop, k2 = x2 + m2.clientHeight + M2, H2 = d2.scrollTop, U2 = H2 + d2.clientHeight;
      if (x2 >= H2 && k2 <= U2) I2--;
      else {
        B2 = Math.max(0, Math.min(k2, U2) - Math.max(x2, H2)), W = m2.clientHeight;
        break;
      }
    }
    I2 >= 1 && o4((m2) => {
      let x2 = W * I2 - B2 + M2;
      return m2 >= x2 ? m2 : x2;
    });
  } }) : null, size({ padding: c2, apply({ availableWidth: P2, availableHeight: d2, elements: M2 }) {
    Object.assign(M2.floating.style, { overflow: "auto", maxWidth: `${P2}px`, maxHeight: `min(var(--anchor-max-height, 100vh), ${d2}px)` });
  } })].filter(Boolean), whileElementsMounted: autoUpdate }), [w2 = a3, V2 = p2] = g2.placement.split("-");
  a3 === "selection" && (w2 = "selection");
  let G2 = reactExports.useMemo(() => ({ anchor: [w2, V2].filter(Boolean).join(" ") }), [w2, V2]), K2 = useInnerOffset(g2, { overflowRef: u2, onChange: o4 }), { getReferenceProps: Q2, getFloatingProps: X2 } = useInteractions([K2]), Y2 = o$7((P2) => {
    s2(P2), b2.setFloating(P2);
  });
  return reactExports.createElement($$1.Provider, { value: r2 }, reactExports.createElement(y$2.Provider, { value: { setFloating: Y2, setReference: b2.setReference, styles: S2, getReferenceProps: Q2, getFloatingProps: X2, slot: G2 } }, e2));
}
function ce(e2) {
  n$6(() => {
    if (!e2) return;
    let t2 = new MutationObserver(() => {
      let n2 = window.getComputedStyle(e2).maxHeight, r2 = parseFloat(n2);
      if (isNaN(r2)) return;
      let l2 = parseInt(n2);
      isNaN(l2) || r2 !== l2 && (e2.style.maxHeight = `${Math.ceil(r2)}px`);
    });
    return t2.observe(e2, { attributes: true, attributeFilter: ["style"] }), () => {
      t2.disconnect();
    };
  }, [e2]);
}
function ge$1(e2, t2) {
  var o4, u2, f2;
  let n2 = O$2((o4 = e2 == null ? void 0 : e2.gap) != null ? o4 : "var(--anchor-gap, 0)", t2), r2 = O$2((u2 = e2 == null ? void 0 : e2.offset) != null ? u2 : "var(--anchor-offset, 0)", t2), l2 = O$2((f2 = e2 == null ? void 0 : e2.padding) != null ? f2 : "var(--anchor-padding, 0)", t2);
  return { ...e2, gap: n2, offset: r2, padding: l2 };
}
function O$2(e2, t2, n2 = void 0) {
  let r2 = p$6(), l2 = o$7((s2, i2) => {
    if (s2 == null) return [n2, null];
    if (typeof s2 == "number") return [s2, null];
    if (typeof s2 == "string") {
      if (!i2) return [n2, null];
      let F2 = J$2(s2, i2);
      return [F2, (E3) => {
        let A2 = q$1(s2);
        {
          let c2 = A2.map((h3) => window.getComputedStyle(i2).getPropertyValue(h3));
          r2.requestAnimationFrame(function h3() {
            r2.nextFrame(h3);
            let a3 = false;
            for (let [b2, S2] of A2.entries()) {
              let g2 = window.getComputedStyle(i2).getPropertyValue(S2);
              if (c2[b2] !== g2) {
                c2[b2] = g2, a3 = true;
                break;
              }
            }
            if (!a3) return;
            let p2 = J$2(s2, i2);
            F2 !== p2 && (E3(p2), F2 = p2);
          });
        }
        return r2.dispose;
      }];
    }
    return [n2, null];
  }), o4 = reactExports.useMemo(() => l2(e2, t2)[0], [e2, t2]), [u2 = o4, f2] = reactExports.useState();
  return n$6(() => {
    let [s2, i2] = l2(e2, t2);
    if (f2(s2), !!i2) return i2(f2);
  }, [e2, t2]), u2;
}
function q$1(e2) {
  let t2 = /var\((.*)\)/.exec(e2);
  if (t2) {
    let n2 = t2[1].indexOf(",");
    if (n2 === -1) return [t2[1]];
    let r2 = t2[1].slice(0, n2).trim(), l2 = t2[1].slice(n2 + 1).trim();
    return l2 ? [r2, ...q$1(l2)] : [r2];
  }
  return [];
}
function J$2(e2, t2) {
  let n2 = document.createElement("div");
  t2.appendChild(n2), n2.style.setProperty("margin-top", "0px", "important"), n2.style.setProperty("margin-top", e2, "important");
  let r2 = parseFloat(window.getComputedStyle(n2).marginTop) || 0;
  return t2.removeChild(n2), r2;
}
function l$2(o4, e2) {
  let [n2, t2] = reactExports.useState(e2);
  return !o4 && n2 !== e2 && t2(e2), o4 ? n2 : e2;
}
let n$1 = reactExports.createContext(null);
n$1.displayName = "OpenClosedContext";
var i = ((e2) => (e2[e2.Open = 1] = "Open", e2[e2.Closed = 2] = "Closed", e2[e2.Closing = 4] = "Closing", e2[e2.Opening = 8] = "Opening", e2))(i || {});
function u$3() {
  return reactExports.useContext(n$1);
}
function c$3({ value: o4, children: t2 }) {
  return React.createElement(n$1.Provider, { value: o4 }, t2);
}
function s$4({ children: o4 }) {
  return React.createElement(n$1.Provider, { value: null }, o4);
}
function t$1(n2) {
  function e2() {
    document.readyState !== "loading" && (n2(), document.removeEventListener("DOMContentLoaded", e2));
  }
  typeof window != "undefined" && typeof document != "undefined" && (document.addEventListener("DOMContentLoaded", e2), e2());
}
let n = [];
t$1(() => {
  function e2(t2) {
    if (!i$4(t2.target) || t2.target === document.body || n[0] === t2.target) return;
    let r2 = t2.target;
    r2 = r2.closest(f$4), n.unshift(r2 != null ? r2 : t2.target), n = n.filter((o4) => o4 != null && o4.isConnected), n.splice(10);
  }
  window.addEventListener("click", e2, { capture: true }), window.addEventListener("mousedown", e2, { capture: true }), window.addEventListener("focus", e2, { capture: true }), document.body.addEventListener("click", e2, { capture: true }), document.body.addEventListener("mousedown", e2, { capture: true }), document.body.addEventListener("focus", e2, { capture: true });
});
function u$2(l2) {
  throw new Error("Unexpected object: " + l2);
}
var c$2 = ((i2) => (i2[i2.First = 0] = "First", i2[i2.Previous = 1] = "Previous", i2[i2.Next = 2] = "Next", i2[i2.Last = 3] = "Last", i2[i2.Specific = 4] = "Specific", i2[i2.Nothing = 5] = "Nothing", i2))(c$2 || {});
function f$2(l2, n2) {
  let t2 = n2.resolveItems();
  if (t2.length <= 0) return null;
  let r2 = n2.resolveActiveIndex(), s2 = r2 != null ? r2 : -1;
  switch (l2.focus) {
    case 0: {
      for (let e2 = 0; e2 < t2.length; ++e2) if (!n2.resolveDisabled(t2[e2], e2, t2)) return e2;
      return r2;
    }
    case 1: {
      s2 === -1 && (s2 = t2.length);
      for (let e2 = s2 - 1; e2 >= 0; --e2) if (!n2.resolveDisabled(t2[e2], e2, t2)) return e2;
      return r2;
    }
    case 2: {
      for (let e2 = s2 + 1; e2 < t2.length; ++e2) if (!n2.resolveDisabled(t2[e2], e2, t2)) return e2;
      return r2;
    }
    case 3: {
      for (let e2 = t2.length - 1; e2 >= 0; --e2) if (!n2.resolveDisabled(t2[e2], e2, t2)) return e2;
      return r2;
    }
    case 4: {
      for (let e2 = 0; e2 < t2.length; ++e2) if (n2.resolveId(t2[e2], e2, t2) === l2.id) return e2;
      return r2;
    }
    case 5:
      return null;
    default:
      u$2(l2);
  }
}
function c$1(t2) {
  let r2 = o$7(t2), e2 = reactExports.useRef(false);
  reactExports.useEffect(() => (e2.current = false, () => {
    e2.current = true, t$6(() => {
      e2.current && r2();
    });
  }), [r2]);
}
function s$3() {
  let r2 = typeof document == "undefined";
  return "useSyncExternalStore" in t$7 ? ((o4) => o4.useSyncExternalStore)(t$7)(() => () => {
  }, () => false, () => !r2) : false;
}
function l$1() {
  let r2 = s$3(), [e2, n2] = reactExports.useState(s$a.isHandoffComplete);
  return e2 && s$a.isHandoffComplete === false && n2(false), reactExports.useEffect(() => {
    e2 !== true && n2(true);
  }, [e2]), reactExports.useEffect(() => s$a.handoff(), []), r2 ? false : e2;
}
let e = reactExports.createContext(false);
function a$6() {
  return reactExports.useContext(e);
}
function l(o4) {
  return React.createElement(e.Provider, { value: o4.force }, o4.children);
}
function I$1(e2) {
  let l2 = a$6(), o4 = reactExports.useContext(H$2), [r2, u2] = reactExports.useState(() => {
    var i2;
    if (!l2 && o4 !== null) return (i2 = o4.current) != null ? i2 : null;
    if (s$a.isServer) return null;
    let t2 = e2 == null ? void 0 : e2.getElementById("headlessui-portal-root");
    if (t2) return t2;
    if (e2 === null) return null;
    let a3 = e2.createElement("div");
    return a3.setAttribute("id", "headlessui-portal-root"), e2.body.appendChild(a3);
  });
  return reactExports.useEffect(() => {
    r2 !== null && (e2 != null && e2.body.contains(r2) || e2 == null || e2.body.appendChild(r2));
  }, [r2, e2]), reactExports.useEffect(() => {
    l2 || o4 !== null && u2(o4.current);
  }, [o4, u2, l2]), r2;
}
let M$3 = reactExports.Fragment, D$2 = K(function(l2, o4) {
  let { ownerDocument: r2 = null, ...u2 } = l2, t2 = reactExports.useRef(null), a3 = y$7(T$3((s2) => {
    t2.current = s2;
  }), o4), i2 = n$2(t2), f2 = r2 != null ? r2 : i2, p2 = I$1(f2), [n2] = reactExports.useState(() => {
    var s2;
    return s$a.isServer ? null : (s2 = f2 == null ? void 0 : f2.createElement("div")) != null ? s2 : null;
  }), P2 = reactExports.useContext(g$1), O2 = l$1();
  n$6(() => {
    !p2 || !n2 || p2.contains(n2) || (n2.setAttribute("data-headlessui-portal", ""), p2.appendChild(n2));
  }, [p2, n2]), n$6(() => {
    if (n2 && P2) return P2.register(n2);
  }, [P2, n2]), c$1(() => {
    var s2;
    !p2 || !n2 || (o$5(n2) && p2.contains(n2) && p2.removeChild(n2), p2.childNodes.length <= 0 && ((s2 = p2.parentElement) == null || s2.removeChild(p2)));
  });
  let b2 = L$4();
  return O2 ? !p2 || !n2 ? null : reactDomExports.createPortal(b2({ ourProps: { ref: a3 }, theirProps: u2, slot: {}, defaultTag: M$3, name: "Portal" }), n2) : null;
});
function J$1(e2, l2) {
  let o4 = y$7(l2), { enabled: r2 = true, ownerDocument: u2, ...t2 } = e2, a3 = L$4();
  return r2 ? React.createElement(D$2, { ...t2, ownerDocument: u2, ref: o4 }) : a3({ ourProps: { ref: o4 }, theirProps: t2, slot: {}, defaultTag: M$3, name: "Portal" });
}
let X$1 = reactExports.Fragment, H$2 = reactExports.createContext(null);
function k(e2, l2) {
  let { target: o4, ...r2 } = e2, t2 = { ref: y$7(l2) }, a3 = L$4();
  return React.createElement(H$2.Provider, { value: o4 }, a3({ ourProps: t2, theirProps: r2, defaultTag: X$1, name: "Popover.Group" }));
}
let g$1 = reactExports.createContext(null);
function oe() {
  let e2 = reactExports.useContext(g$1), l2 = reactExports.useRef([]), o4 = o$7((t2) => (l2.current.push(t2), e2 && e2.register(t2), () => r2(t2))), r2 = o$7((t2) => {
    let a3 = l2.current.indexOf(t2);
    a3 !== -1 && l2.current.splice(a3, 1), e2 && e2.unregister(t2);
  }), u2 = reactExports.useMemo(() => ({ register: o4, unregister: r2, portals: l2 }), [o4, r2, l2]);
  return [l2, reactExports.useMemo(() => function({ children: a3 }) {
    return React.createElement(g$1.Provider, { value: u2 }, a3);
  }, [u2])];
}
let B = K(J$1), q = K(k), ne$1 = Object.assign(B, { Group: q });
function a$5(o4, r2 = typeof document != "undefined" ? document.defaultView : null, t2) {
  let n2 = I$3(o4, "escape");
  E$2(r2, "keydown", (e2) => {
    n2 && (e2.defaultPrevented || e2.key === o$4.Escape && t2(e2));
  });
}
function f$1() {
  var t2;
  let [e2] = reactExports.useState(() => typeof window != "undefined" && typeof window.matchMedia == "function" ? window.matchMedia("(pointer: coarse)") : null), [o4, c2] = reactExports.useState((t2 = e2 == null ? void 0 : e2.matches) != null ? t2 : false);
  return n$6(() => {
    if (!e2) return;
    function n2(r2) {
      c2(r2.matches);
    }
    return e2.addEventListener("change", n2), () => e2.removeEventListener("change", n2);
  }, [e2]), o4;
}
function H$1({ defaultContainers: r2 = [], portals: n2, mainTreeNode: o4 } = {}) {
  let l2 = n$2(o4), u2 = o$7(() => {
    var i2, c2;
    let t2 = [];
    for (let e2 of r2) e2 !== null && (t$4(e2) ? t2.push(e2) : "current" in e2 && t$4(e2.current) && t2.push(e2.current));
    if (n2 != null && n2.current) for (let e2 of n2.current) t2.push(e2);
    for (let e2 of (i2 = l2 == null ? void 0 : l2.querySelectorAll("html > *, body > *")) != null ? i2 : []) e2 !== document.body && e2 !== document.head && t$4(e2) && e2.id !== "headlessui-portal-root" && (o4 && (e2.contains(o4) || e2.contains((c2 = o4 == null ? void 0 : o4.getRootNode()) == null ? void 0 : c2.host)) || t2.some((d2) => e2.contains(d2)) || t2.push(e2));
    return t2;
  });
  return { resolveContainers: u2, contains: o$7((t2) => u2().some((i2) => i2.contains(t2))) };
}
let a$4 = reactExports.createContext(null);
function P({ children: r2, node: n2 }) {
  let [o4, l2] = reactExports.useState(null), u2 = y$1(n2 != null ? n2 : o4);
  return React.createElement(a$4.Provider, { value: u2 }, r2, u2 === null && React.createElement(f$a, { features: s$8.Hidden, ref: (t2) => {
    var i2, c2;
    if (t2) {
      for (let e2 of (c2 = (i2 = o$9(t2)) == null ? void 0 : i2.querySelectorAll("html > *, body > *")) != null ? c2 : []) if (e2 !== document.body && e2 !== document.head && t$4(e2) && e2 != null && e2.contains(t2)) {
        l2(e2);
        break;
      }
    }
  } }));
}
function y$1(r2 = null) {
  var n2;
  return (n2 = reactExports.useContext(a$4)) != null ? n2 : r2;
}
function f() {
  let e2 = reactExports.useRef(false);
  return n$6(() => (e2.current = true, () => {
    e2.current = false;
  }), []), e2;
}
var a$3 = ((r2) => (r2[r2.Forwards = 0] = "Forwards", r2[r2.Backwards = 1] = "Backwards", r2))(a$3 || {});
function u$1() {
  let e2 = reactExports.useRef(0);
  return s$5(true, "keydown", (r2) => {
    r2.key === "Tab" && (e2.current = r2.shiftKey ? 1 : 0);
  }, true), e2;
}
function x$1(s2) {
  if (!s2) return /* @__PURE__ */ new Set();
  if (typeof s2 == "function") return new Set(s2());
  let e2 = /* @__PURE__ */ new Set();
  for (let t2 of s2.current) t$4(t2.current) && e2.add(t2.current);
  return e2;
}
let $ = "div";
var G = ((n2) => (n2[n2.None = 0] = "None", n2[n2.InitialFocus = 1] = "InitialFocus", n2[n2.TabLock = 2] = "TabLock", n2[n2.FocusLock = 4] = "FocusLock", n2[n2.RestoreFocus = 8] = "RestoreFocus", n2[n2.AutoFocus = 16] = "AutoFocus", n2))(G || {});
function D$1(s2, e2) {
  let t2 = reactExports.useRef(null), r2 = y$7(t2, e2), { initialFocus: o4, initialFocusFallback: a3, containers: n2, features: u2 = 15, ...f2 } = s2;
  l$1() || (u2 = 0);
  let l2 = n$2(t2);
  te(u2, { ownerDocument: l2 });
  let m2 = re$1(u2, { ownerDocument: l2, container: t2, initialFocus: o4, initialFocusFallback: a3 });
  ne(u2, { ownerDocument: l2, container: t2, containers: n2, previousActiveElement: m2 });
  let g2 = u$1(), v2 = o$7((c2) => {
    if (!n$5(t2.current)) return;
    let E3 = t2.current;
    ((V2) => V2())(() => {
      u$b(g2.current, { [a$3.Forwards]: () => {
        g$3(E3, T$2.First, { skipElements: [c2.relatedTarget, a3] });
      }, [a$3.Backwards]: () => {
        g$3(E3, T$2.Last, { skipElements: [c2.relatedTarget, a3] });
      } });
    });
  }), A2 = I$3(!!(u2 & 2), "focus-trap#tab-lock"), N2 = p$6(), b2 = reactExports.useRef(false), k2 = { ref: r2, onKeyDown(c2) {
    c2.key == "Tab" && (b2.current = true, N2.requestAnimationFrame(() => {
      b2.current = false;
    }));
  }, onBlur(c2) {
    if (!(u2 & 4)) return;
    let E3 = x$1(n2);
    n$5(t2.current) && E3.add(t2.current);
    let L2 = c2.relatedTarget;
    i$4(L2) && L2.dataset.headlessuiFocusGuard !== "true" && (I(E3, L2) || (b2.current ? g$3(t2.current, u$b(g2.current, { [a$3.Forwards]: () => T$2.Next, [a$3.Backwards]: () => T$2.Previous }) | T$2.WrapAround, { relativeTo: c2.target }) : i$4(c2.target) && I$2(c2.target)));
  } }, B2 = L$4();
  return React.createElement(React.Fragment, null, A2 && React.createElement(f$a, { as: "button", type: "button", "data-headlessui-focus-guard": true, onFocus: v2, features: s$8.Focusable }), B2({ ourProps: k2, theirProps: f2, defaultTag: $, name: "FocusTrap" }), A2 && React.createElement(f$a, { as: "button", type: "button", "data-headlessui-focus-guard": true, onFocus: v2, features: s$8.Focusable }));
}
let w$2 = K(D$1), Re$1 = Object.assign(w$2, { features: G });
function ee(s2 = true) {
  let e2 = reactExports.useRef(n.slice());
  return m$1(([t2], [r2]) => {
    r2 === true && t2 === false && t$6(() => {
      e2.current.splice(0);
    }), r2 === false && t2 === true && (e2.current = n.slice());
  }, [s2, n, e2]), o$7(() => {
    var t2;
    return (t2 = e2.current.find((r2) => r2 != null && r2.isConnected)) != null ? t2 : null;
  });
}
function te(s2, { ownerDocument: e2 }) {
  let t2 = !!(s2 & 8), r2 = ee(t2);
  m$1(() => {
    t2 || (e2 == null ? void 0 : e2.activeElement) === (e2 == null ? void 0 : e2.body) && I$2(r2());
  }, [t2]), c$1(() => {
    t2 && I$2(r2());
  });
}
function re$1(s2, { ownerDocument: e2, container: t2, initialFocus: r2, initialFocusFallback: o4 }) {
  let a3 = reactExports.useRef(null), n2 = I$3(!!(s2 & 1), "focus-trap#initial-focus"), u2 = f();
  return m$1(() => {
    if (s2 === 0) return;
    if (!n2) {
      o4 != null && o4.current && I$2(o4.current);
      return;
    }
    let f2 = t2.current;
    f2 && t$6(() => {
      if (!u2.current) return;
      let l2 = e2 == null ? void 0 : e2.activeElement;
      if (r2 != null && r2.current) {
        if ((r2 == null ? void 0 : r2.current) === l2) {
          a3.current = l2;
          return;
        }
      } else if (f2.contains(l2)) {
        a3.current = l2;
        return;
      }
      if (r2 != null && r2.current) I$2(r2.current);
      else {
        if (s2 & 16) {
          if (g$3(f2, T$2.First | T$2.AutoFocus) !== y$3.Error) return;
        } else if (g$3(f2, T$2.First) !== y$3.Error) return;
        if (o4 != null && o4.current && (I$2(o4.current), (e2 == null ? void 0 : e2.activeElement) === o4.current)) return;
        console.warn("There are no focusable elements inside the <FocusTrap />");
      }
      a3.current = e2 == null ? void 0 : e2.activeElement;
    });
  }, [o4, n2, s2]), a3;
}
function ne(s2, { ownerDocument: e2, container: t2, containers: r2, previousActiveElement: o4 }) {
  let a3 = f(), n2 = !!(s2 & 4);
  E$2(e2 == null ? void 0 : e2.defaultView, "focus", (u2) => {
    if (!n2 || !a3.current) return;
    let f2 = x$1(r2);
    n$5(t2.current) && f2.add(t2.current);
    let l2 = o4.current;
    if (!l2) return;
    let m2 = u2.target;
    n$5(m2) ? I(f2, m2) ? (o4.current = m2, I$2(m2)) : (u2.preventDefault(), u2.stopPropagation(), I$2(l2)) : I$2(o4.current);
  }, true);
}
function I(s2, e2) {
  for (let t2 of s2) if (t2.contains(e2)) return true;
  return false;
}
function ue(e2) {
  var t2;
  return !!(e2.enter || e2.enterFrom || e2.enterTo || e2.leave || e2.leaveFrom || e2.leaveTo) || ((t2 = e2.as) != null ? t2 : de$1) !== reactExports.Fragment || React.Children.count(e2.children) === 1;
}
let w$1 = reactExports.createContext(null);
w$1.displayName = "TransitionContext";
var _e = ((n2) => (n2.Visible = "visible", n2.Hidden = "hidden", n2))(_e || {});
function De$1() {
  let e2 = reactExports.useContext(w$1);
  if (e2 === null) throw new Error("A <Transition.Child /> is used but it is missing a parent <Transition /> or <Transition.Root />.");
  return e2;
}
function He$1() {
  let e2 = reactExports.useContext(M$2);
  if (e2 === null) throw new Error("A <Transition.Child /> is used but it is missing a parent <Transition /> or <Transition.Root />.");
  return e2;
}
let M$2 = reactExports.createContext(null);
M$2.displayName = "NestingContext";
function U(e2) {
  return "children" in e2 ? U(e2.children) : e2.current.filter(({ el: t2 }) => t2.current !== null).filter(({ state: t2 }) => t2 === "visible").length > 0;
}
function Te$1(e2, t2) {
  let n2 = s$9(e2), l2 = reactExports.useRef([]), S2 = f(), R2 = p$6(), d2 = o$7((o4, i2 = A$1.Hidden) => {
    let a3 = l2.current.findIndex(({ el: s2 }) => s2 === o4);
    a3 !== -1 && (u$b(i2, { [A$1.Unmount]() {
      l2.current.splice(a3, 1);
    }, [A$1.Hidden]() {
      l2.current[a3].state = "hidden";
    } }), R2.microTask(() => {
      var s2;
      !U(l2) && S2.current && ((s2 = n2.current) == null || s2.call(n2));
    }));
  }), y2 = o$7((o4) => {
    let i2 = l2.current.find(({ el: a3 }) => a3 === o4);
    return i2 ? i2.state !== "visible" && (i2.state = "visible") : l2.current.push({ el: o4, state: "visible" }), () => d2(o4, A$1.Unmount);
  }), C2 = reactExports.useRef([]), p2 = reactExports.useRef(Promise.resolve()), h3 = reactExports.useRef({ enter: [], leave: [] }), g2 = o$7((o4, i2, a3) => {
    C2.current.splice(0), t2 && (t2.chains.current[i2] = t2.chains.current[i2].filter(([s2]) => s2 !== o4)), t2 == null || t2.chains.current[i2].push([o4, new Promise((s2) => {
      C2.current.push(s2);
    })]), t2 == null || t2.chains.current[i2].push([o4, new Promise((s2) => {
      Promise.all(h3.current[i2].map(([r2, f2]) => f2)).then(() => s2());
    })]), i2 === "enter" ? p2.current = p2.current.then(() => t2 == null ? void 0 : t2.wait.current).then(() => a3(i2)) : a3(i2);
  }), v2 = o$7((o4, i2, a3) => {
    Promise.all(h3.current[i2].splice(0).map(([s2, r2]) => r2)).then(() => {
      var s2;
      (s2 = C2.current.shift()) == null || s2();
    }).then(() => a3(i2));
  });
  return reactExports.useMemo(() => ({ children: l2, register: y2, unregister: d2, onStart: g2, onStop: v2, wait: p2, chains: h3 }), [y2, d2, l2, g2, v2, h3, p2]);
}
let de$1 = reactExports.Fragment, fe$1 = O$4.RenderStrategy;
function Ae$1(e2, t2) {
  var ee2, te2;
  let { transition: n2 = true, beforeEnter: l2, afterEnter: S2, beforeLeave: R$1, afterLeave: d2, enter: y2, enterFrom: C2, enterTo: p2, entered: h3, leave: g2, leaveFrom: v2, leaveTo: o4, ...i$12 } = e2, [a3, s2] = reactExports.useState(null), r2 = reactExports.useRef(null), f2 = ue(e2), j2 = y$7(...f2 ? [r2, t2, s2] : t2 === null ? [] : [t2]), H2 = (ee2 = i$12.unmount) == null || ee2 ? A$1.Unmount : A$1.Hidden, { show: u2, appear: z2, initial: K2 } = De$1(), [m2, G2] = reactExports.useState(u2 ? "visible" : "hidden"), Q2 = He$1(), { register: A2, unregister: I2 } = Q2;
  n$6(() => A2(r2), [A2, r2]), n$6(() => {
    if (H2 === A$1.Hidden && r2.current) {
      if (u2 && m2 !== "visible") {
        G2("visible");
        return;
      }
      return u$b(m2, { ["hidden"]: () => I2(r2), ["visible"]: () => A2(r2) });
    }
  }, [m2, r2, A2, I2, u2, H2]);
  let B2 = l$1();
  n$6(() => {
    if (f2 && B2 && m2 === "visible" && r2.current === null) throw new Error("Did you forget to passthrough the `ref` to the actual DOM node?");
  }, [r2, m2, B2, f2]);
  let ce2 = K2 && !z2, Y2 = z2 && u2 && K2, W = reactExports.useRef(false), L2 = Te$1(() => {
    W.current || (G2("hidden"), I2(r2));
  }, Q2), Z = o$7((k2) => {
    W.current = true;
    let F2 = k2 ? "enter" : "leave";
    L2.onStart(r2, F2, (_2) => {
      _2 === "enter" ? l2 == null || l2() : _2 === "leave" && (R$1 == null || R$1());
    });
  }), $2 = o$7((k2) => {
    let F2 = k2 ? "enter" : "leave";
    W.current = false, L2.onStop(r2, F2, (_2) => {
      _2 === "enter" ? S2 == null || S2() : _2 === "leave" && (d2 == null || d2());
    }), F2 === "leave" && !U(L2) && (G2("hidden"), I2(r2));
  });
  reactExports.useEffect(() => {
    f2 && n2 || (Z(u2), $2(u2));
  }, [u2, f2, n2]);
  let pe = /* @__PURE__ */ (() => !(!n2 || !f2 || !B2 || ce2))(), [, T2] = x$2(pe, a3, u2, { start: Z, end: $2 }), Ce2 = m$6({ ref: j2, className: ((te2 = t$5(i$12.className, Y2 && y2, Y2 && C2, T2.enter && y2, T2.enter && T2.closed && C2, T2.enter && !T2.closed && p2, T2.leave && g2, T2.leave && !T2.closed && v2, T2.leave && T2.closed && o4, !T2.transition && u2 && h3)) == null ? void 0 : te2.trim()) || void 0, ...R(T2) }), N2 = 0;
  m2 === "visible" && (N2 |= i.Open), m2 === "hidden" && (N2 |= i.Closed), u2 && m2 === "hidden" && (N2 |= i.Opening), !u2 && m2 === "visible" && (N2 |= i.Closing);
  let he = L$4();
  return React.createElement(M$2.Provider, { value: L2 }, React.createElement(c$3, { value: N2 }, he({ ourProps: Ce2, theirProps: i$12, defaultTag: de$1, features: fe$1, visible: m2 === "visible", name: "Transition.Child" })));
}
function Ie$1(e2, t2) {
  let { show: n2, appear: l2 = false, unmount: S2 = true, ...R2 } = e2, d2 = reactExports.useRef(null), y2 = ue(e2), C2 = y$7(...y2 ? [d2, t2] : t2 === null ? [] : [t2]);
  l$1();
  let p2 = u$3();
  if (n2 === void 0 && p2 !== null && (n2 = (p2 & i.Open) === i.Open), n2 === void 0) throw new Error("A <Transition /> is used but it is missing a `show={true | false}` prop.");
  let [h3, g2] = reactExports.useState(n2 ? "visible" : "hidden"), v2 = Te$1(() => {
    n2 || g2("hidden");
  }), [o4, i$12] = reactExports.useState(true), a3 = reactExports.useRef([n2]);
  n$6(() => {
    o4 !== false && a3.current[a3.current.length - 1] !== n2 && (a3.current.push(n2), i$12(false));
  }, [a3, n2]);
  let s2 = reactExports.useMemo(() => ({ show: n2, appear: l2, initial: o4 }), [n2, l2, o4]);
  n$6(() => {
    n2 ? g2("visible") : !U(v2) && d2.current !== null && g2("hidden");
  }, [n2, v2]);
  let r2 = { unmount: S2 }, f2 = o$7(() => {
    var u2;
    o4 && i$12(false), (u2 = e2.beforeEnter) == null || u2.call(e2);
  }), j2 = o$7(() => {
    var u2;
    o4 && i$12(false), (u2 = e2.beforeLeave) == null || u2.call(e2);
  }), H2 = L$4();
  return React.createElement(M$2.Provider, { value: v2 }, React.createElement(w$1.Provider, { value: s2 }, H2({ ourProps: { ...r2, as: reactExports.Fragment, children: React.createElement(me$1, { ref: C2, ...r2, ...R2, beforeEnter: f2, beforeLeave: j2 }) }, theirProps: {}, defaultTag: reactExports.Fragment, features: fe$1, visible: h3 === "visible", name: "Transition" })));
}
function Le$1(e2, t2) {
  let n2 = reactExports.useContext(w$1) !== null, l2 = u$3() !== null;
  return React.createElement(React.Fragment, null, !n2 && l2 ? React.createElement(X, { ref: t2, ...e2 }) : React.createElement(me$1, { ref: t2, ...e2 }));
}
let X = K(Ie$1), me$1 = K(Ae$1), Fe = K(Le$1), ze$1 = Object.assign(X, { Child: Fe, Root: X });
var Ge = ((o4) => (o4[o4.Open = 0] = "Open", o4[o4.Closed = 1] = "Closed", o4))(Ge || {}), we = ((t2) => (t2[t2.SetTitleId = 0] = "SetTitleId", t2))(we || {});
let Be = { [0](e2, t2) {
  return e2.titleId === t2.id ? e2 : { ...e2, titleId: t2.id };
} }, w = reactExports.createContext(null);
w.displayName = "DialogContext";
function O$1(e2) {
  let t2 = reactExports.useContext(w);
  if (t2 === null) {
    let o4 = new Error(`<${e2} /> is missing a parent <Dialog /> component.`);
    throw Error.captureStackTrace && Error.captureStackTrace(o4, O$1), o4;
  }
  return t2;
}
function Ue(e2, t2) {
  return u$b(t2.type, Be, e2, t2);
}
let z = K(function(t2, o4) {
  let a3 = reactExports.useId(), { id: n2 = `headlessui-dialog-${a3}`, open: i$12, onClose: s2, initialFocus: d2, role: p2 = "dialog", autoFocus: T2 = true, __demoMode: u2 = false, unmount: y2 = false, ...S2 } = t2, F2 = reactExports.useRef(false);
  p2 = function() {
    return p2 === "dialog" || p2 === "alertdialog" ? p2 : (F2.current || (F2.current = true, console.warn(`Invalid role [${p2}] passed to <Dialog />. Only \`dialog\` and and \`alertdialog\` are supported. Using \`dialog\` instead.`)), "dialog");
  }();
  let c2 = u$3();
  i$12 === void 0 && c2 !== null && (i$12 = (c2 & i.Open) === i.Open);
  let f2 = reactExports.useRef(null), I2 = y$7(f2, o4), b2 = n$2(f2), g2 = i$12 ? 0 : 1, [v2, Q2] = reactExports.useReducer(Ue, { titleId: null, descriptionId: null, panelRef: reactExports.createRef() }), m2 = o$7(() => s2(false)), B2 = o$7((r2) => Q2({ type: 0, id: r2 })), D2 = l$1() ? g2 === 0 : false, [Z, ee2] = oe(), te2 = { get current() {
    var r2;
    return (r2 = v2.panelRef.current) != null ? r2 : f2.current;
  } }, L2 = y$1(), { resolveContainers: M2 } = H$1({ mainTreeNode: L2, portals: Z, defaultContainers: [te2] }), U2 = c2 !== null ? (c2 & i.Closing) === i.Closing : false;
  y$4(u2 || U2 ? false : D2, { allowed: o$7(() => {
    var r2, W;
    return [(W = (r2 = f2.current) == null ? void 0 : r2.closest("[data-headlessui-portal]")) != null ? W : null];
  }), disallowed: o$7(() => {
    var r2;
    return [(r2 = L2 == null ? void 0 : L2.closest("body > *:not(#headlessui-portal-root)")) != null ? r2 : null];
  }) });
  let P2 = x$3.get(null);
  n$6(() => {
    if (D2) return P2.actions.push(n2), () => P2.actions.pop(n2);
  }, [P2, n2, D2]);
  let H2 = S$2(P2, reactExports.useCallback((r2) => P2.selectors.isTop(r2, n2), [P2, n2]));
  k$2(H2, M2, (r2) => {
    r2.preventDefault(), m2();
  }), a$5(H2, b2 == null ? void 0 : b2.defaultView, (r2) => {
    r2.preventDefault(), r2.stopPropagation(), document.activeElement && "blur" in document.activeElement && typeof document.activeElement.blur == "function" && document.activeElement.blur(), m2();
  }), f$3(u2 || U2 ? false : D2, b2, M2), p$2(D2, f2, m2);
  let [oe$1, ne2] = w$5(), re2 = reactExports.useMemo(() => [{ dialogState: g2, close: m2, setTitleId: B2, unmount: y2 }, v2], [g2, v2, m2, B2, y2]), N2 = reactExports.useMemo(() => ({ open: g2 === 0 }), [g2]), le = { ref: I2, id: n2, role: p2, tabIndex: -1, "aria-modal": u2 ? void 0 : g2 === 0 ? true : void 0, "aria-labelledby": v2.titleId, "aria-describedby": oe$1, unmount: y2 }, ae = !f$1(), E3 = G.None;
  D2 && !u2 && (E3 |= G.RestoreFocus, E3 |= G.TabLock, T2 && (E3 |= G.AutoFocus), ae && (E3 |= G.InitialFocus));
  let ie = L$4();
  return React.createElement(s$4, null, React.createElement(l, { force: true }, React.createElement(ne$1, null, React.createElement(w.Provider, { value: re2 }, React.createElement(q, { target: f2 }, React.createElement(l, { force: false }, React.createElement(ne2, { slot: N2 }, React.createElement(ee2, null, React.createElement(Re$1, { initialFocus: d2, initialFocusFallback: f2, containers: M2, features: E3 }, React.createElement(C$3, { value: m2 }, ie({ ourProps: le, theirProps: S2, slot: N2, defaultTag: He, features: Ne, visible: g2 === 0, name: "Dialog" })))))))))));
}), He = "div", Ne = O$4.RenderStrategy | O$4.Static;
function We(e2, t2) {
  let { transition: o4 = false, open: a3, ...n2 } = e2, i2 = u$3(), s2 = e2.hasOwnProperty("open") || i2 !== null, d2 = e2.hasOwnProperty("onClose");
  if (!s2 && !d2) throw new Error("You have to provide an `open` and an `onClose` prop to the `Dialog` component.");
  if (!s2) throw new Error("You provided an `onClose` prop to the `Dialog`, but forgot an `open` prop.");
  if (!d2) throw new Error("You provided an `open` prop to the `Dialog`, but forgot an `onClose` prop.");
  if (!i2 && typeof e2.open != "boolean") throw new Error(`You provided an \`open\` prop to the \`Dialog\`, but the value is not a boolean. Received: ${e2.open}`);
  if (typeof e2.onClose != "function") throw new Error(`You provided an \`onClose\` prop to the \`Dialog\`, but the value is not a function. Received: ${e2.onClose}`);
  return (a3 !== void 0 || o4) && !n2.static ? React.createElement(P, null, React.createElement(ze$1, { show: a3, transition: o4, unmount: n2.unmount }, React.createElement(z, { ref: t2, ...n2 }))) : React.createElement(P, null, React.createElement(z, { ref: t2, open: a3, ...n2 }));
}
let $e = "div";
function je(e2, t2) {
  let o4 = reactExports.useId(), { id: a3 = `headlessui-dialog-panel-${o4}`, transition: n2 = false, ...i2 } = e2, [{ dialogState: s2, unmount: d2 }, p2] = O$1("Dialog.Panel"), T2 = y$7(t2, p2.panelRef), u2 = reactExports.useMemo(() => ({ open: s2 === 0 }), [s2]), y2 = o$7((I2) => {
    I2.stopPropagation();
  }), S2 = { ref: T2, id: a3, onClick: y2 }, F2 = n2 ? Fe : reactExports.Fragment, c2 = n2 ? { unmount: d2 } : {}, f2 = L$4();
  return React.createElement(F2, { ...c2 }, f2({ ourProps: S2, theirProps: i2, slot: u2, defaultTag: $e, name: "Dialog.Panel" }));
}
let Ye = "div";
function Je(e2, t2) {
  let { transition: o4 = false, ...a3 } = e2, [{ dialogState: n2, unmount: i2 }] = O$1("Dialog.Backdrop"), s2 = reactExports.useMemo(() => ({ open: n2 === 0 }), [n2]), d2 = { ref: t2, "aria-hidden": true }, p2 = o4 ? Fe : reactExports.Fragment, T2 = o4 ? { unmount: i2 } : {}, u2 = L$4();
  return React.createElement(p2, { ...T2 }, u2({ ourProps: d2, theirProps: a3, slot: s2, defaultTag: Ye, name: "Dialog.Backdrop" }));
}
let Ke = "h2";
function Xe(e2, t2) {
  let o4 = reactExports.useId(), { id: a3 = `headlessui-dialog-title-${o4}`, ...n2 } = e2, [{ dialogState: i2, setTitleId: s2 }] = O$1("Dialog.Title"), d2 = y$7(t2);
  reactExports.useEffect(() => (s2(a3), () => s2(null)), [a3, s2]);
  let p2 = reactExports.useMemo(() => ({ open: i2 === 0 }), [i2]), T2 = { ref: d2, id: a3 };
  return L$4()({ ourProps: T2, theirProps: n2, slot: p2, defaultTag: Ke, name: "Dialog.Title" });
}
let Ve$1 = K(We), qe = K(je);
K(Je);
let ze = K(Xe), Lt = Object.assign(Ve$1, { Panel: qe, Title: ze, Description: H$4 });
var t;
let a$2 = (t = React.startTransition) != null ? t : function(i2) {
  i2();
};
var de = ((l2) => (l2[l2.Open = 0] = "Open", l2[l2.Closed = 1] = "Closed", l2))(de || {}), Te = ((n2) => (n2[n2.ToggleDisclosure = 0] = "ToggleDisclosure", n2[n2.CloseDisclosure = 1] = "CloseDisclosure", n2[n2.SetButtonId = 2] = "SetButtonId", n2[n2.SetPanelId = 3] = "SetPanelId", n2[n2.SetButtonElement = 4] = "SetButtonElement", n2[n2.SetPanelElement = 5] = "SetPanelElement", n2))(Te || {});
let me = { [0]: (e2) => ({ ...e2, disclosureState: u$b(e2.disclosureState, { [0]: 1, [1]: 0 }) }), [1]: (e2) => e2.disclosureState === 1 ? e2 : { ...e2, disclosureState: 1 }, [2](e2, t2) {
  return e2.buttonId === t2.buttonId ? e2 : { ...e2, buttonId: t2.buttonId };
}, [3](e2, t2) {
  return e2.panelId === t2.panelId ? e2 : { ...e2, panelId: t2.panelId };
}, [4](e2, t2) {
  return e2.buttonElement === t2.element ? e2 : { ...e2, buttonElement: t2.element };
}, [5](e2, t2) {
  return e2.panelElement === t2.element ? e2 : { ...e2, panelElement: t2.element };
} }, _ = reactExports.createContext(null);
_.displayName = "DisclosureContext";
function M$1(e2) {
  let t2 = reactExports.useContext(_);
  if (t2 === null) {
    let l2 = new Error(`<${e2} /> is missing a parent <Disclosure /> component.`);
    throw Error.captureStackTrace && Error.captureStackTrace(l2, M$1), l2;
  }
  return t2;
}
let F$3 = reactExports.createContext(null);
F$3.displayName = "DisclosureAPIContext";
function J(e2) {
  let t2 = reactExports.useContext(F$3);
  if (t2 === null) {
    let l2 = new Error(`<${e2} /> is missing a parent <Disclosure /> component.`);
    throw Error.captureStackTrace && Error.captureStackTrace(l2, J), l2;
  }
  return t2;
}
let H = reactExports.createContext(null);
H.displayName = "DisclosurePanelContext";
function fe() {
  return reactExports.useContext(H);
}
function De(e2, t2) {
  return u$b(t2.type, me, e2, t2);
}
let ye = reactExports.Fragment;
function Pe(e2, t2) {
  let { defaultOpen: l2 = false, ...p2 } = e2, a3 = reactExports.useRef(null), c2 = y$7(t2, T$3((u2) => {
    a3.current = u2;
  }, e2.as === void 0 || e2.as === reactExports.Fragment)), n2 = reactExports.useReducer(De, { disclosureState: l2 ? 0 : 1, buttonElement: null, panelElement: null, buttonId: null, panelId: null }), [{ disclosureState: o4, buttonId: r2 }, f2] = n2, s2 = o$7((u2) => {
    f2({ type: 1 });
    let d2 = o$9(a3);
    if (!d2 || !r2) return;
    let T2 = (() => u2 ? i$4(u2) ? u2 : "current" in u2 && i$4(u2.current) ? u2.current : d2.getElementById(r2) : d2.getElementById(r2))();
    T2 == null || T2.focus();
  }), E3 = reactExports.useMemo(() => ({ close: s2 }), [s2]), m2 = reactExports.useMemo(() => ({ open: o4 === 0, close: s2 }), [o4, s2]), D2 = { ref: c2 }, S2 = L$4();
  return React.createElement(_.Provider, { value: n2 }, React.createElement(F$3.Provider, { value: E3 }, React.createElement(C$3, { value: s2 }, React.createElement(c$3, { value: u$b(o4, { [0]: i.Open, [1]: i.Closed }) }, S2({ ourProps: D2, theirProps: p2, slot: m2, defaultTag: ye, name: "Disclosure" })))));
}
let Ee = "button";
function Se(e2, t2) {
  let l2 = reactExports.useId(), { id: p2 = `headlessui-disclosure-button-${l2}`, disabled: a3 = false, autoFocus: c2 = false, ...n2 } = e2, [o4, r2] = M$1("Disclosure.Button"), f2 = fe(), s2 = f2 === null ? false : f2 === o4.panelId, E3 = reactExports.useRef(null), m2 = y$7(E3, t2, o$7((i2) => {
    if (!s2) return r2({ type: 4, element: i2 });
  }));
  reactExports.useEffect(() => {
    if (!s2) return r2({ type: 2, buttonId: p2 }), () => {
      r2({ type: 2, buttonId: null });
    };
  }, [p2, r2, s2]);
  let D2 = o$7((i2) => {
    var g2;
    if (s2) {
      if (o4.disclosureState === 1) return;
      switch (i2.key) {
        case o$4.Space:
        case o$4.Enter:
          i2.preventDefault(), i2.stopPropagation(), r2({ type: 0 }), (g2 = o4.buttonElement) == null || g2.focus();
          break;
      }
    } else switch (i2.key) {
      case o$4.Space:
      case o$4.Enter:
        i2.preventDefault(), i2.stopPropagation(), r2({ type: 0 });
        break;
    }
  }), S2 = o$7((i2) => {
    switch (i2.key) {
      case o$4.Space:
        i2.preventDefault();
        break;
    }
  }), u2 = o$7((i2) => {
    var g2;
    s$7(i2.currentTarget) || a3 || (s2 ? (r2({ type: 0 }), (g2 = o4.buttonElement) == null || g2.focus()) : r2({ type: 0 }));
  }), { isFocusVisible: d2, focusProps: T2 } = $f7dceffc5ad7768b$export$4e328f61c538687f({ autoFocus: c2 }), { isHovered: b2, hoverProps: h3 } = $6179b936705e76d3$export$ae780daf29e6d456({ isDisabled: a3 }), { pressed: U2, pressProps: G2 } = w$6({ disabled: a3 }), X2 = reactExports.useMemo(() => ({ open: o4.disclosureState === 0, hover: b2, active: U2, disabled: a3, focus: d2, autofocus: c2 }), [o4, b2, U2, d2, a3, c2]), N2 = e$1(e2, o4.buttonElement), q2 = s2 ? _$3({ ref: m2, type: N2, disabled: a3 || void 0, autoFocus: c2, onKeyDown: D2, onClick: u2 }, T2, h3, G2) : _$3({ ref: m2, id: p2, type: N2, "aria-expanded": o4.disclosureState === 0, "aria-controls": o4.panelElement ? o4.panelId : void 0, disabled: a3 || void 0, autoFocus: c2, onKeyDown: D2, onKeyUp: S2, onClick: u2 }, T2, h3, G2);
  return L$4()({ ourProps: q2, theirProps: n2, slot: X2, defaultTag: Ee, name: "Disclosure.Button" });
}
let ge = "div", Ae = O$4.RenderStrategy | O$4.Static;
function be(e2, t2) {
  let l2 = reactExports.useId(), { id: p2 = `headlessui-disclosure-panel-${l2}`, transition: a3 = false, ...c2 } = e2, [n2, o4] = M$1("Disclosure.Panel"), { close: r2 } = J("Disclosure.Panel"), [f2, s2] = reactExports.useState(null), E3 = y$7(t2, o$7((b2) => {
    a$2(() => o4({ type: 5, element: b2 }));
  }), s2);
  reactExports.useEffect(() => (o4({ type: 3, panelId: p2 }), () => {
    o4({ type: 3, panelId: null });
  }), [p2, o4]);
  let m2 = u$3(), [D2, S2] = x$2(a3, f2, m2 !== null ? (m2 & i.Open) === i.Open : n2.disclosureState === 0), u2 = reactExports.useMemo(() => ({ open: n2.disclosureState === 0, close: r2 }), [n2.disclosureState, r2]), d2 = { ref: E3, id: p2, ...R(S2) }, T2 = L$4();
  return React.createElement(s$4, null, React.createElement(H.Provider, { value: n2.panelId }, T2({ ourProps: d2, theirProps: c2, slot: u2, defaultTag: ge, features: Ae, visible: D2, name: "Disclosure.Panel" })));
}
let Ce = K(Pe), Re = K(Se), Ie = K(be), Ve = Object.assign(Ce, { Button: Re, Panel: Ie });
function s$2(n2, t2) {
  let e2 = reactExports.useRef({ left: 0, top: 0 });
  if (n$6(() => {
    if (!t2) return;
    let r2 = t2.getBoundingClientRect();
    r2 && (e2.current = r2);
  }, [n2, t2]), t2 == null || !n2 || t2 === document.activeElement) return false;
  let o4 = t2.getBoundingClientRect();
  return o4.top !== e2.current.top || o4.left !== e2.current.left;
}
let a$1 = /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g;
function o3(e2) {
  var l2, n2;
  let i2 = (l2 = e2.innerText) != null ? l2 : "", t2 = e2.cloneNode(true);
  if (!n$5(t2)) return i2;
  let u2 = false;
  for (let f2 of t2.querySelectorAll('[hidden],[aria-hidden],[role="img"]')) f2.remove(), u2 = true;
  let r2 = u2 ? (n2 = t2.innerText) != null ? n2 : "" : i2;
  return a$1.test(r2) && (r2 = r2.replace(a$1, "")), r2;
}
function F$2(e2) {
  let i2 = e2.getAttribute("aria-label");
  if (typeof i2 == "string") return i2.trim();
  let t2 = e2.getAttribute("aria-labelledby");
  if (t2) {
    let u2 = t2.split(" ").map((r2) => {
      let l2 = document.getElementById(r2);
      if (l2) {
        let n2 = l2.getAttribute("aria-label");
        return typeof n2 == "string" ? n2.trim() : o3(l2).trim();
      }
      return null;
    }).filter(Boolean);
    if (u2.length > 0) return u2.join(", ");
  }
  return o3(e2).trim();
}
function s$1(c2) {
  let t2 = reactExports.useRef(""), r2 = reactExports.useRef("");
  return o$7(() => {
    let e2 = c2.current;
    if (!e2) return "";
    let u2 = e2.innerText;
    if (t2.current === u2) return r2.current;
    let n2 = F$2(e2).trim().toLowerCase();
    return t2.current = u2, r2.current = n2, n2;
  });
}
var T = Object.defineProperty;
var m = (e2, o4, t2) => o4 in e2 ? T(e2, o4, { enumerable: true, configurable: true, writable: true, value: t2 }) : e2[o4] = t2;
var v = (e2, o4, t2) => (m(e2, typeof o4 != "symbol" ? o4 + "" : o4, t2), t2);
var E$1 = ((t2) => (t2[t2.Open = 0] = "Open", t2[t2.Closed = 1] = "Closed", t2))(E$1 || {}), L = ((t2) => (t2[t2.Single = 0] = "Single", t2[t2.Multi = 1] = "Multi", t2))(L || {}), F$1 = ((t2) => (t2[t2.Pointer = 0] = "Pointer", t2[t2.Other = 1] = "Other", t2))(F$1 || {}), M = ((r2) => (r2[r2.OpenListbox = 0] = "OpenListbox", r2[r2.CloseListbox = 1] = "CloseListbox", r2[r2.GoToOption = 2] = "GoToOption", r2[r2.Search = 3] = "Search", r2[r2.ClearSearch = 4] = "ClearSearch", r2[r2.RegisterOptions = 5] = "RegisterOptions", r2[r2.UnregisterOptions = 6] = "UnregisterOptions", r2[r2.SetButtonElement = 7] = "SetButtonElement", r2[r2.SetOptionsElement = 8] = "SetOptionsElement", r2[r2.SortOptions = 9] = "SortOptions", r2))(M || {});
function b(e2, o4 = (t2) => t2) {
  let t2 = e2.activeOptionIndex !== null ? e2.options[e2.activeOptionIndex] : null, n2 = P$1(o4(e2.options.slice()), (s2) => s2.dataRef.current.domRef.current), i2 = t2 ? n2.indexOf(t2) : null;
  return i2 === -1 && (i2 = null), { options: n2, activeOptionIndex: i2 };
}
let C = { [1](e2) {
  return e2.dataRef.current.disabled || e2.listboxState === 1 ? e2 : { ...e2, activeOptionIndex: null, pendingFocus: { focus: c$2.Nothing }, listboxState: 1, __demoMode: false };
}, [0](e2, o4) {
  if (e2.dataRef.current.disabled || e2.listboxState === 0) return e2;
  let t2 = e2.activeOptionIndex, { isSelected: n2 } = e2.dataRef.current, i2 = e2.options.findIndex((s2) => n2(s2.dataRef.current.value));
  return i2 !== -1 && (t2 = i2), { ...e2, pendingFocus: o4.focus, listboxState: 0, activeOptionIndex: t2, __demoMode: false };
}, [2](e2, o4) {
  var s2, l2, u2, d2, a3;
  if (e2.dataRef.current.disabled || e2.listboxState === 1) return e2;
  let t2 = { ...e2, searchQuery: "", activationTrigger: (s2 = o4.trigger) != null ? s2 : 1, __demoMode: false };
  if (o4.focus === c$2.Nothing) return { ...t2, activeOptionIndex: null };
  if (o4.focus === c$2.Specific) return { ...t2, activeOptionIndex: e2.options.findIndex((r2) => r2.id === o4.id) };
  if (o4.focus === c$2.Previous) {
    let r2 = e2.activeOptionIndex;
    if (r2 !== null) {
      let O2 = e2.options[r2].dataRef.current.domRef, f2 = f$2(o4, { resolveItems: () => e2.options, resolveActiveIndex: () => e2.activeOptionIndex, resolveId: (c2) => c2.id, resolveDisabled: (c2) => c2.dataRef.current.disabled });
      if (f2 !== null) {
        let c2 = e2.options[f2].dataRef.current.domRef;
        if (((l2 = O2.current) == null ? void 0 : l2.previousElementSibling) === c2.current || ((u2 = c2.current) == null ? void 0 : u2.previousElementSibling) === null) return { ...t2, activeOptionIndex: f2 };
      }
    }
  } else if (o4.focus === c$2.Next) {
    let r2 = e2.activeOptionIndex;
    if (r2 !== null) {
      let O2 = e2.options[r2].dataRef.current.domRef, f2 = f$2(o4, { resolveItems: () => e2.options, resolveActiveIndex: () => e2.activeOptionIndex, resolveId: (c2) => c2.id, resolveDisabled: (c2) => c2.dataRef.current.disabled });
      if (f2 !== null) {
        let c2 = e2.options[f2].dataRef.current.domRef;
        if (((d2 = O2.current) == null ? void 0 : d2.nextElementSibling) === c2.current || ((a3 = c2.current) == null ? void 0 : a3.nextElementSibling) === null) return { ...t2, activeOptionIndex: f2 };
      }
    }
  }
  let n2 = b(e2), i2 = f$2(o4, { resolveItems: () => n2.options, resolveActiveIndex: () => n2.activeOptionIndex, resolveId: (r2) => r2.id, resolveDisabled: (r2) => r2.dataRef.current.disabled });
  return { ...t2, ...n2, activeOptionIndex: i2 };
}, [3]: (e2, o4) => {
  if (e2.dataRef.current.disabled || e2.listboxState === 1) return e2;
  let n2 = e2.searchQuery !== "" ? 0 : 1, i2 = e2.searchQuery + o4.value.toLowerCase(), l2 = (e2.activeOptionIndex !== null ? e2.options.slice(e2.activeOptionIndex + n2).concat(e2.options.slice(0, e2.activeOptionIndex + n2)) : e2.options).find((d2) => {
    var a3;
    return !d2.dataRef.current.disabled && ((a3 = d2.dataRef.current.textValue) == null ? void 0 : a3.startsWith(i2));
  }), u2 = l2 ? e2.options.indexOf(l2) : -1;
  return u2 === -1 || u2 === e2.activeOptionIndex ? { ...e2, searchQuery: i2 } : { ...e2, searchQuery: i2, activeOptionIndex: u2, activationTrigger: 1 };
}, [4](e2) {
  return e2.dataRef.current.disabled || e2.listboxState === 1 || e2.searchQuery === "" ? e2 : { ...e2, searchQuery: "" };
}, [5]: (e2, o4) => {
  let t2 = e2.options.concat(o4.options), n2 = e2.activeOptionIndex;
  if (e2.pendingFocus.focus !== c$2.Nothing && (n2 = f$2(e2.pendingFocus, { resolveItems: () => t2, resolveActiveIndex: () => e2.activeOptionIndex, resolveId: (i2) => i2.id, resolveDisabled: (i2) => i2.dataRef.current.disabled })), e2.activeOptionIndex === null) {
    let { isSelected: i2 } = e2.dataRef.current;
    if (i2) {
      let s2 = t2.findIndex((l2) => i2 == null ? void 0 : i2(l2.dataRef.current.value));
      s2 !== -1 && (n2 = s2);
    }
  }
  return { ...e2, options: t2, activeOptionIndex: n2, pendingFocus: { focus: c$2.Nothing }, pendingShouldSort: true };
}, [6]: (e2, o4) => {
  let t2 = e2.options, n2 = [], i2 = new Set(o4.options);
  for (let [s2, l2] of t2.entries()) if (i2.has(l2.id) && (n2.push(s2), i2.delete(l2.id), i2.size === 0)) break;
  if (n2.length > 0) {
    t2 = t2.slice();
    for (let s2 of n2.reverse()) t2.splice(s2, 1);
  }
  return { ...e2, options: t2, activationTrigger: 1 };
}, [7]: (e2, o4) => e2.buttonElement === o4.element ? e2 : { ...e2, buttonElement: o4.element }, [8]: (e2, o4) => e2.optionsElement === o4.element ? e2 : { ...e2, optionsElement: o4.element }, [9]: (e2) => e2.pendingShouldSort ? { ...e2, ...b(e2), pendingShouldSort: false } : e2 };
let h$1 = class h extends E$4 {
  constructor(t2) {
    super(t2);
    v(this, "actions", { onChange: (t3) => {
      let { onChange: n2, compare: i2, mode: s2, value: l2 } = this.state.dataRef.current;
      return u$b(s2, { [0]: () => n2 == null ? void 0 : n2(t3), [1]: () => {
        let u2 = l2.slice(), d2 = u2.findIndex((a3) => i2(a3, t3));
        return d2 === -1 ? u2.push(t3) : u2.splice(d2, 1), n2 == null ? void 0 : n2(u2);
      } });
    }, registerOption: x$4(() => {
      let t3 = [], n2 = /* @__PURE__ */ new Set();
      return [(i2, s2) => {
        n2.has(s2) || (n2.add(s2), t3.push({ id: i2, dataRef: s2 }));
      }, () => (n2.clear(), this.send({ type: 5, options: t3.splice(0) }))];
    }), unregisterOption: x$4(() => {
      let t3 = [];
      return [(n2) => t3.push(n2), () => {
        this.send({ type: 6, options: t3.splice(0) });
      }];
    }), goToOption: x$4(() => {
      let t3 = null;
      return [(n2, i2) => {
        t3 = { type: 2, ...n2, trigger: i2 };
      }, () => t3 && this.send(t3)];
    }), closeListbox: () => {
      this.send({ type: 1 });
    }, openListbox: (t3) => {
      this.send({ type: 0, focus: t3 });
    }, selectActiveOption: () => {
      if (this.state.activeOptionIndex !== null) {
        let { dataRef: t3, id: n2 } = this.state.options[this.state.activeOptionIndex];
        this.actions.onChange(t3.current.value), this.send({ type: 2, focus: c$2.Specific, id: n2 });
      }
    }, selectOption: (t3) => {
      let n2 = this.state.options.find((i2) => i2.id === t3);
      n2 && this.actions.onChange(n2.dataRef.current.value);
    }, search: (t3) => {
      this.send({ type: 3, value: t3 });
    }, clearSearch: () => {
      this.send({ type: 4 });
    }, setButtonElement: (t3) => {
      this.send({ type: 7, element: t3 });
    }, setOptionsElement: (t3) => {
      this.send({ type: 8, element: t3 });
    } });
    v(this, "selectors", { activeDescendantId(t3) {
      var s2;
      let n2 = t3.activeOptionIndex, i2 = t3.options;
      return n2 === null || (s2 = i2[n2]) == null ? void 0 : s2.id;
    }, isActive(t3, n2) {
      var l2;
      let i2 = t3.activeOptionIndex, s2 = t3.options;
      return i2 !== null ? ((l2 = s2[i2]) == null ? void 0 : l2.id) === n2 : false;
    }, shouldScrollIntoView(t3, n2) {
      return t3.__demoMode || t3.listboxState !== 0 || t3.activationTrigger === 0 ? false : this.isActive(t3, n2);
    } });
    this.on(5, () => {
      requestAnimationFrame(() => {
        this.send({ type: 9 });
      });
    });
    {
      let n2 = this.state.id, i2 = x$3.get(null);
      this.disposables.add(i2.on(k$3.Push, (s2) => {
        !i2.selectors.isTop(s2, n2) && this.state.listboxState === 0 && this.actions.closeListbox();
      })), this.on(0, () => i2.actions.push(n2)), this.on(1, () => i2.actions.pop(n2));
    }
  }
  static new({ id: t2, __demoMode: n2 = false }) {
    return new h({ id: t2, dataRef: { current: {} }, listboxState: n2 ? 0 : 1, options: [], searchQuery: "", activeOptionIndex: null, activationTrigger: 1, buttonElement: null, optionsElement: null, pendingShouldSort: false, pendingFocus: { focus: c$2.Nothing }, __demoMode: n2 });
  }
  reduce(t2, n2) {
    return u$b(n2.type, C, t2, n2);
  }
};
const c = reactExports.createContext(null);
function p$1(o4) {
  let e2 = reactExports.useContext(c);
  if (e2 === null) {
    let t2 = new Error(`<${o4} /> is missing a parent <Listbox /> component.`);
    throw Error.captureStackTrace && Error.captureStackTrace(t2, u), t2;
  }
  return e2;
}
function u({ id: o4, __demoMode: e2 = false }) {
  let t2 = reactExports.useMemo(() => h$1.new({ id: o4, __demoMode: e2 }), []);
  return c$1(() => t2.dispose()), t2;
}
let re = reactExports.createContext(null);
re.displayName = "ListboxDataContext";
function Y(g2) {
  let D2 = reactExports.useContext(re);
  if (D2 === null) {
    let x2 = new Error(`<${g2} /> is missing a parent <Listbox /> component.`);
    throw Error.captureStackTrace && Error.captureStackTrace(x2, Y), x2;
  }
  return D2;
}
let gt$1 = reactExports.Fragment;
function vt(g2, D2) {
  let x2 = reactExports.useId(), u$12 = a$g(), { value: l2, defaultValue: p2, form: R2, name: i$12, onChange: b2, by: o4, invalid: d2 = false, disabled: m2 = u$12 || false, horizontal: a3 = false, multiple: t2 = false, __demoMode: s2 = false, ...A$12 } = g2;
  const v2 = a3 ? "horizontal" : "vertical";
  let U2 = y$7(D2), w2 = l$6(p2), [c$12 = t2 ? [] : void 0, O2] = T$4(l2, b2, w2), y2 = u({ id: x2, __demoMode: s2 }), I2 = reactExports.useRef({ static: false, hold: false }), N2 = reactExports.useRef(/* @__PURE__ */ new Map()), _2 = u$7(o4), H2 = reactExports.useCallback((h3) => u$b(n2.mode, { [L.Multi]: () => c$12.some((W) => _2(W, h3)), [L.Single]: () => _2(c$12, h3) }), [c$12]), n2 = reactExports.useMemo(() => ({ value: c$12, disabled: m2, invalid: d2, mode: t2 ? L.Multi : L.Single, orientation: v2, onChange: O2, compare: _2, isSelected: H2, optionsPropsRef: I2, listRef: N2 }), [c$12, m2, d2, t2, v2, O2, _2, H2, I2, N2]);
  n$6(() => {
    y2.state.dataRef.current = n2;
  }, [n2]);
  let L$12 = S$2(y2, (h3) => h3.listboxState), G2 = x$3.get(null), K2 = S$2(G2, reactExports.useCallback((h3) => G2.selectors.isTop(h3, x2), [G2, x2])), [E3, z2] = S$2(y2, (h3) => [h3.buttonElement, h3.optionsElement]);
  k$2(K2, [E3, z2], (h3, W) => {
    y2.send({ type: M.CloseListbox }), A(W, h$2.Loose) || (h3.preventDefault(), E3 == null || E3.focus());
  });
  let r2 = reactExports.useMemo(() => ({ open: L$12 === E$1.Open, disabled: m2, invalid: d2, value: c$12 }), [L$12, m2, d2, c$12]), [B2, ae] = Q({ inherit: true }), le = { ref: U2 }, ie = reactExports.useCallback(() => {
    if (w2 !== void 0) return O2 == null ? void 0 : O2(w2);
  }, [O2, w2]), Z = L$4();
  return React.createElement(ae, { value: B2, props: { htmlFor: E3 == null ? void 0 : E3.id }, slot: { open: L$12 === E$1.Open, disabled: m2 } }, React.createElement(Ae$2, null, React.createElement(c.Provider, { value: y2 }, React.createElement(re.Provider, { value: n2 }, React.createElement(c$3, { value: u$b(L$12, { [E$1.Open]: i.Open, [E$1.Closed]: i.Closed }) }, i$12 != null && c$12 != null && React.createElement(j$4, { disabled: m2, data: { [i$12]: c$12 }, form: R2, onReset: ie }), Z({ ourProps: le, theirProps: A$12, slot: r2, defaultTag: gt$1, name: "Listbox" }))))));
}
let Et$1 = "button";
function ht(g2, D2) {
  let x2 = reactExports.useId(), u2 = u$a(), l2 = Y("Listbox.Button"), p2 = p$1("Listbox.Button"), { id: R2 = u2 || `headlessui-listbox-button-${x2}`, disabled: i2 = l2.disabled || false, autoFocus: b2 = false, ...o4 } = g2, d2 = y$7(D2, Fe$1(), p2.actions.setButtonElement), m2 = be$1(), [a3, t2, s2] = S$2(p2, (r2) => [r2.listboxState, r2.buttonElement, r2.optionsElement]), A2 = a3 === E$1.Open;
  k$1(A2, { trigger: t2, action: reactExports.useCallback((r2) => {
    if (t2 != null && t2.contains(r2.target)) return g$2.Ignore;
    let B2 = r2.target.closest('[role="option"]:not([data-disabled])');
    return n$5(B2) ? g$2.Select(B2) : s2 != null && s2.contains(r2.target) ? g$2.Ignore : g$2.Close;
  }, [t2, s2]), close: p2.actions.closeListbox, select: p2.actions.selectActiveOption });
  let v2 = o$7((r2) => {
    switch (r2.key) {
      case o$4.Enter:
        p$5(r2.currentTarget);
        break;
      case o$4.Space:
      case o$4.ArrowDown:
        r2.preventDefault(), p2.actions.openListbox({ focus: l2.value ? c$2.Nothing : c$2.First });
        break;
      case o$4.ArrowUp:
        r2.preventDefault(), p2.actions.openListbox({ focus: l2.value ? c$2.Nothing : c$2.Last });
        break;
    }
  }), U2 = o$7((r2) => {
    switch (r2.key) {
      case o$4.Space:
        r2.preventDefault();
        break;
    }
  }), w2 = o$7((r2) => {
    var B2;
    if (r2.button === 0) {
      if (s$7(r2.currentTarget)) return r2.preventDefault();
      p2.state.listboxState === E$1.Open ? (reactDomExports.flushSync(() => p2.actions.closeListbox()), (B2 = p2.state.buttonElement) == null || B2.focus({ preventScroll: true })) : (r2.preventDefault(), p2.actions.openListbox({ focus: c$2.Nothing }));
    }
  }), c2 = o$7((r2) => r2.preventDefault()), O2 = N([R2]), y2 = U$2(), { isFocusVisible: I2, focusProps: N$1 } = $f7dceffc5ad7768b$export$4e328f61c538687f({ autoFocus: b2 }), { isHovered: _2, hoverProps: H2 } = $6179b936705e76d3$export$ae780daf29e6d456({ isDisabled: i2 }), { pressed: n2, pressProps: L2 } = w$6({ disabled: i2 }), G2 = reactExports.useMemo(() => ({ open: a3 === E$1.Open, active: n2 || a3 === E$1.Open, disabled: i2, invalid: l2.invalid, value: l2.value, hover: _2, focus: I2, autofocus: b2 }), [a3, l2.value, i2, _2, I2, n2, l2.invalid, b2]), K2 = S$2(p2, (r2) => r2.listboxState === E$1.Open), E3 = _$3(m2(), { ref: d2, id: R2, type: e$1(g2, t2), "aria-haspopup": "listbox", "aria-controls": s2 == null ? void 0 : s2.id, "aria-expanded": K2, "aria-labelledby": O2, "aria-describedby": y2, disabled: i2 || void 0, autoFocus: b2, onKeyDown: v2, onKeyUp: U2, onKeyPress: c2, onPointerDown: w2 }, N$1, H2, L2);
  return L$4()({ ourProps: E3, theirProps: o4, slot: G2, defaultTag: Et$1, name: "Listbox.Button" });
}
let Le = reactExports.createContext(false), Dt = "div", At = O$4.RenderStrategy | O$4.Static;
function St(g2, D2) {
  let x2 = reactExports.useId(), { id: u2 = `headlessui-listbox-options-${x2}`, anchor: l2, portal: p2 = false, modal: R$1 = true, transition: i$12 = false, ...b2 } = g2, o4 = ye$1(l2), [d2, m2] = reactExports.useState(null);
  o4 && (p2 = true);
  let a3 = Y("Listbox.Options"), t2 = p$1("Listbox.Options"), [s2, A2, v2, U2] = S$2(t2, (e2) => [e2.listboxState, e2.buttonElement, e2.optionsElement, e2.__demoMode]), w2 = n$2(A2), c2 = n$2(v2), O2 = u$3(), [y2, I2] = x$2(i$12, d2, O2 !== null ? (O2 & i.Open) === i.Open : s2 === E$1.Open);
  p$2(y2, A2, t2.actions.closeListbox);
  let N2 = U2 ? false : R$1 && s2 === E$1.Open;
  f$3(N2, c2);
  let _2 = U2 ? false : R$1 && s2 === E$1.Open;
  y$4(_2, { allowed: reactExports.useCallback(() => [A2, v2], [A2, v2]) });
  let H2 = s2 !== E$1.Open, L$12 = s$2(H2, A2) ? false : y2, G2 = y2 && s2 === E$1.Closed, K2 = l$2(G2, a3.value), E3 = o$7((e2) => a3.compare(K2, e2)), z2 = S$2(t2, (e2) => {
    var X2;
    if (o4 == null || !((X2 = o4 == null ? void 0 : o4.to) != null && X2.includes("selection"))) return null;
    let S2 = e2.options.findIndex((se) => E3(se.dataRef.current.value));
    return S2 === -1 && (S2 = 0), S2;
  }), r2 = (() => {
    if (o4 == null) return;
    if (z2 === null) return { ...o4, inner: void 0 };
    let e2 = Array.from(a3.listRef.current.values());
    return { ...o4, inner: { listRef: { current: e2 }, index: z2 } };
  })(), [B2, ae] = Re$2(r2), le = Te$2(), ie = y$7(D2, o4 ? B2 : null, t2.actions.setOptionsElement, m2), Z = p$6();
  reactExports.useEffect(() => {
    var S2;
    let e2 = v2;
    e2 && s2 === E$1.Open && e2 !== ((S2 = o$9(e2)) == null ? void 0 : S2.activeElement) && (e2 == null || e2.focus({ preventScroll: true }));
  }, [s2, v2]);
  let h3 = o$7((e2) => {
    var S2, X2;
    switch (Z.dispose(), e2.key) {
      case o$4.Space:
        if (t2.state.searchQuery !== "") return e2.preventDefault(), e2.stopPropagation(), t2.actions.search(e2.key);
      case o$4.Enter:
        if (e2.preventDefault(), e2.stopPropagation(), t2.state.activeOptionIndex !== null) {
          let { dataRef: se } = t2.state.options[t2.state.activeOptionIndex];
          t2.actions.onChange(se.current.value);
        }
        a3.mode === L.Single && (reactDomExports.flushSync(() => t2.actions.closeListbox()), (S2 = t2.state.buttonElement) == null || S2.focus({ preventScroll: true }));
        break;
      case u$b(a3.orientation, { vertical: o$4.ArrowDown, horizontal: o$4.ArrowRight }):
        return e2.preventDefault(), e2.stopPropagation(), t2.actions.goToOption({ focus: c$2.Next });
      case u$b(a3.orientation, { vertical: o$4.ArrowUp, horizontal: o$4.ArrowLeft }):
        return e2.preventDefault(), e2.stopPropagation(), t2.actions.goToOption({ focus: c$2.Previous });
      case o$4.Home:
      case o$4.PageUp:
        return e2.preventDefault(), e2.stopPropagation(), t2.actions.goToOption({ focus: c$2.First });
      case o$4.End:
      case o$4.PageDown:
        return e2.preventDefault(), e2.stopPropagation(), t2.actions.goToOption({ focus: c$2.Last });
      case o$4.Escape:
        e2.preventDefault(), e2.stopPropagation(), reactDomExports.flushSync(() => t2.actions.closeListbox()), (X2 = t2.state.buttonElement) == null || X2.focus({ preventScroll: true });
        return;
      case o$4.Tab:
        e2.preventDefault(), e2.stopPropagation(), reactDomExports.flushSync(() => t2.actions.closeListbox()), j$1(t2.state.buttonElement, e2.shiftKey ? T$2.Previous : T$2.Next);
        break;
      default:
        e2.key.length === 1 && (t2.actions.search(e2.key), Z.setTimeout(() => t2.actions.clearSearch(), 350));
        break;
    }
  }), W = S$2(t2, (e2) => {
    var S2;
    return (S2 = e2.buttonElement) == null ? void 0 : S2.id;
  }), Pe2 = reactExports.useMemo(() => ({ open: s2 === E$1.Open }), [s2]), ge2 = _$3(o4 ? le() : {}, { id: u2, ref: ie, "aria-activedescendant": S$2(t2, t2.selectors.activeDescendantId), "aria-multiselectable": a3.mode === L.Multi ? true : void 0, "aria-labelledby": W, "aria-orientation": a3.orientation, onKeyDown: h3, role: "listbox", tabIndex: s2 === E$1.Open ? 0 : void 0, style: { ...b2.style, ...ae, "--button-width": d$2(A2, true).width }, ...R(I2) }), ve = L$4(), Ee2 = reactExports.useMemo(() => a3.mode === L.Multi ? a3 : { ...a3, isSelected: E3 }, [a3, E3]);
  return React.createElement(ne$1, { enabled: p2 ? g2.static || y2 : false, ownerDocument: w2 }, React.createElement(re.Provider, { value: Ee2 }, ve({ ourProps: ge2, theirProps: b2, slot: Pe2, defaultTag: Dt, features: At, visible: L$12, name: "Listbox.Options" })));
}
let Rt = "div";
function _t(g2, D2) {
  let x2 = reactExports.useId(), { id: u2 = `headlessui-listbox-option-${x2}`, disabled: l2 = false, value: p2, ...R2 } = g2, i2 = reactExports.useContext(Le) === true, b2 = Y("Listbox.Option"), o4 = p$1("Listbox.Option"), d2 = S$2(o4, (n2) => o4.selectors.isActive(n2, u2)), m2 = b2.isSelected(p2), a3 = reactExports.useRef(null), t2 = s$1(a3), s2 = s$9({ disabled: l2, value: p2, domRef: a3, get textValue() {
    return t2();
  } }), A2 = y$7(D2, a3, (n2) => {
    n2 ? b2.listRef.current.set(u2, n2) : b2.listRef.current.delete(u2);
  }), v2 = S$2(o4, (n2) => o4.selectors.shouldScrollIntoView(n2, u2));
  n$6(() => {
    if (v2) return o$8().requestAnimationFrame(() => {
      var n2, L2;
      (L2 = (n2 = a3.current) == null ? void 0 : n2.scrollIntoView) == null || L2.call(n2, { block: "nearest" });
    });
  }, [v2, a3]), n$6(() => {
    if (!i2) return o4.actions.registerOption(u2, s2), () => o4.actions.unregisterOption(u2);
  }, [s2, u2, i2]);
  let U2 = o$7((n2) => {
    var L$12;
    if (l2) return n2.preventDefault();
    o4.actions.onChange(p2), b2.mode === L.Single && (reactDomExports.flushSync(() => o4.actions.closeListbox()), (L$12 = o4.state.buttonElement) == null || L$12.focus({ preventScroll: true }));
  }), w2 = o$7(() => {
    if (l2) return o4.actions.goToOption({ focus: c$2.Nothing });
    o4.actions.goToOption({ focus: c$2.Specific, id: u2 });
  }), c2 = u$4(), O2 = o$7((n2) => {
    c2.update(n2), !l2 && (d2 || o4.actions.goToOption({ focus: c$2.Specific, id: u2 }, F$1.Pointer));
  }), y2 = o$7((n2) => {
    c2.wasMoved(n2) && (l2 || d2 || o4.actions.goToOption({ focus: c$2.Specific, id: u2 }, F$1.Pointer));
  }), I2 = o$7((n2) => {
    c2.wasMoved(n2) && (l2 || d2 && o4.actions.goToOption({ focus: c$2.Nothing }));
  }), N2 = reactExports.useMemo(() => ({ active: d2, focus: d2, selected: m2, disabled: l2, selectedOption: m2 && i2 }), [d2, m2, l2, i2]), _2 = i2 ? {} : { id: u2, ref: A2, role: "option", tabIndex: l2 === true ? void 0 : -1, "aria-disabled": l2 === true ? true : void 0, "aria-selected": m2, disabled: void 0, onClick: U2, onFocus: w2, onPointerEnter: O2, onMouseEnter: O2, onPointerMove: y2, onMouseMove: y2, onPointerLeave: I2, onMouseLeave: I2 }, H2 = L$4();
  return !m2 && i2 ? null : H2({ ourProps: _2, theirProps: R2, slot: N2, defaultTag: Rt, name: "Listbox.Option" });
}
let Ft = reactExports.Fragment;
function Ct(g2, D2) {
  let { options: x2, placeholder: u2, ...l2 } = g2, R2 = { ref: y$7(D2) }, i2 = Y("ListboxSelectedOption"), b2 = reactExports.useMemo(() => ({}), []), o4 = i2.value === void 0 || i2.value === null || i2.mode === L.Multi && Array.isArray(i2.value) && i2.value.length === 0, d2 = L$4();
  return React.createElement(Le.Provider, { value: true }, d2({ ourProps: R2, theirProps: { ...l2, children: React.createElement(React.Fragment, null, u2 && o4 ? u2 : x2) }, slot: b2, defaultTag: Ft, name: "ListboxSelectedOption" }));
}
let Mt$1 = K(vt), wt = K(ht), It = V$1, Bt = K(St), kt = K(_t), Ut = K(Ct), wo = Object.assign(Mt$1, { Button: wt, Label: It, Options: Bt, Option: kt, SelectedOption: Ut });
var h2 = Object.defineProperty;
var y = (e2, i2, t2) => i2 in e2 ? h2(e2, i2, { enumerable: true, configurable: true, writable: true, value: t2 }) : e2[i2] = t2;
var g = (e2, i2, t2) => (y(e2, typeof i2 != "symbol" ? i2 + "" : i2, t2), t2);
var E2 = ((t2) => (t2[t2.Open = 0] = "Open", t2[t2.Closed = 1] = "Closed", t2))(E2 || {}), O = ((t2) => (t2[t2.Pointer = 0] = "Pointer", t2[t2.Other = 1] = "Other", t2))(O || {}), F = ((r2) => (r2[r2.OpenMenu = 0] = "OpenMenu", r2[r2.CloseMenu = 1] = "CloseMenu", r2[r2.GoToItem = 2] = "GoToItem", r2[r2.Search = 3] = "Search", r2[r2.ClearSearch = 4] = "ClearSearch", r2[r2.RegisterItems = 5] = "RegisterItems", r2[r2.UnregisterItems = 6] = "UnregisterItems", r2[r2.SetButtonElement = 7] = "SetButtonElement", r2[r2.SetItemsElement = 8] = "SetItemsElement", r2[r2.SortItems = 9] = "SortItems", r2))(F || {});
function S(e2, i2 = (t2) => t2) {
  let t2 = e2.activeItemIndex !== null ? e2.items[e2.activeItemIndex] : null, n2 = P$1(i2(e2.items.slice()), (l2) => l2.dataRef.current.domRef.current), s2 = t2 ? n2.indexOf(t2) : null;
  return s2 === -1 && (s2 = null), { items: n2, activeItemIndex: s2 };
}
let D = { [1](e2) {
  return e2.menuState === 1 ? e2 : { ...e2, activeItemIndex: null, pendingFocus: { focus: c$2.Nothing }, menuState: 1 };
}, [0](e2, i2) {
  return e2.menuState === 0 ? e2 : { ...e2, __demoMode: false, pendingFocus: i2.focus, menuState: 0 };
}, [2]: (e2, i2) => {
  var l2, o4, d2, a3, I2;
  if (e2.menuState === 1) return e2;
  let t2 = { ...e2, searchQuery: "", activationTrigger: (l2 = i2.trigger) != null ? l2 : 1, __demoMode: false };
  if (i2.focus === c$2.Nothing) return { ...t2, activeItemIndex: null };
  if (i2.focus === c$2.Specific) return { ...t2, activeItemIndex: e2.items.findIndex((r2) => r2.id === i2.id) };
  if (i2.focus === c$2.Previous) {
    let r2 = e2.activeItemIndex;
    if (r2 !== null) {
      let p2 = e2.items[r2].dataRef.current.domRef, m2 = f$2(i2, { resolveItems: () => e2.items, resolveActiveIndex: () => e2.activeItemIndex, resolveId: (u2) => u2.id, resolveDisabled: (u2) => u2.dataRef.current.disabled });
      if (m2 !== null) {
        let u2 = e2.items[m2].dataRef.current.domRef;
        if (((o4 = p2.current) == null ? void 0 : o4.previousElementSibling) === u2.current || ((d2 = u2.current) == null ? void 0 : d2.previousElementSibling) === null) return { ...t2, activeItemIndex: m2 };
      }
    }
  } else if (i2.focus === c$2.Next) {
    let r2 = e2.activeItemIndex;
    if (r2 !== null) {
      let p2 = e2.items[r2].dataRef.current.domRef, m2 = f$2(i2, { resolveItems: () => e2.items, resolveActiveIndex: () => e2.activeItemIndex, resolveId: (u2) => u2.id, resolveDisabled: (u2) => u2.dataRef.current.disabled });
      if (m2 !== null) {
        let u2 = e2.items[m2].dataRef.current.domRef;
        if (((a3 = p2.current) == null ? void 0 : a3.nextElementSibling) === u2.current || ((I2 = u2.current) == null ? void 0 : I2.nextElementSibling) === null) return { ...t2, activeItemIndex: m2 };
      }
    }
  }
  let n2 = S(e2), s2 = f$2(i2, { resolveItems: () => n2.items, resolveActiveIndex: () => n2.activeItemIndex, resolveId: (r2) => r2.id, resolveDisabled: (r2) => r2.dataRef.current.disabled });
  return { ...t2, ...n2, activeItemIndex: s2 };
}, [3]: (e2, i2) => {
  let n2 = e2.searchQuery !== "" ? 0 : 1, s2 = e2.searchQuery + i2.value.toLowerCase(), o4 = (e2.activeItemIndex !== null ? e2.items.slice(e2.activeItemIndex + n2).concat(e2.items.slice(0, e2.activeItemIndex + n2)) : e2.items).find((a3) => {
    var I2;
    return ((I2 = a3.dataRef.current.textValue) == null ? void 0 : I2.startsWith(s2)) && !a3.dataRef.current.disabled;
  }), d2 = o4 ? e2.items.indexOf(o4) : -1;
  return d2 === -1 || d2 === e2.activeItemIndex ? { ...e2, searchQuery: s2 } : { ...e2, searchQuery: s2, activeItemIndex: d2, activationTrigger: 1 };
}, [4](e2) {
  return e2.searchQuery === "" ? e2 : { ...e2, searchQuery: "", searchActiveItemIndex: null };
}, [5]: (e2, i2) => {
  let t2 = e2.items.concat(i2.items.map((s2) => s2)), n2 = e2.activeItemIndex;
  return e2.pendingFocus.focus !== c$2.Nothing && (n2 = f$2(e2.pendingFocus, { resolveItems: () => t2, resolveActiveIndex: () => e2.activeItemIndex, resolveId: (s2) => s2.id, resolveDisabled: (s2) => s2.dataRef.current.disabled })), { ...e2, items: t2, activeItemIndex: n2, pendingFocus: { focus: c$2.Nothing }, pendingShouldSort: true };
}, [6]: (e2, i2) => {
  let t2 = e2.items, n2 = [], s2 = new Set(i2.items);
  for (let [l2, o4] of t2.entries()) if (s2.has(o4.id) && (n2.push(l2), s2.delete(o4.id), s2.size === 0)) break;
  if (n2.length > 0) {
    t2 = t2.slice();
    for (let l2 of n2.reverse()) t2.splice(l2, 1);
  }
  return { ...e2, items: t2, activationTrigger: 1 };
}, [7]: (e2, i2) => e2.buttonElement === i2.element ? e2 : { ...e2, buttonElement: i2.element }, [8]: (e2, i2) => e2.itemsElement === i2.element ? e2 : { ...e2, itemsElement: i2.element }, [9]: (e2) => e2.pendingShouldSort ? { ...e2, ...S(e2), pendingShouldSort: false } : e2 };
class x extends E$4 {
  constructor(t2) {
    super(t2);
    g(this, "actions", { registerItem: x$4(() => {
      let t3 = [], n2 = /* @__PURE__ */ new Set();
      return [(s2, l2) => {
        n2.has(l2) || (n2.add(l2), t3.push({ id: s2, dataRef: l2 }));
      }, () => (n2.clear(), this.send({ type: 5, items: t3.splice(0) }))];
    }), unregisterItem: x$4(() => {
      let t3 = [];
      return [(n2) => t3.push(n2), () => this.send({ type: 6, items: t3.splice(0) })];
    }) });
    g(this, "selectors", { activeDescendantId(t3) {
      var l2;
      let n2 = t3.activeItemIndex, s2 = t3.items;
      return n2 === null || (l2 = s2[n2]) == null ? void 0 : l2.id;
    }, isActive(t3, n2) {
      var o4;
      let s2 = t3.activeItemIndex, l2 = t3.items;
      return s2 !== null ? ((o4 = l2[s2]) == null ? void 0 : o4.id) === n2 : false;
    }, shouldScrollIntoView(t3, n2) {
      return t3.__demoMode || t3.menuState !== 0 || t3.activationTrigger === 0 ? false : this.isActive(t3, n2);
    } });
    this.on(5, () => {
      this.disposables.requestAnimationFrame(() => {
        this.send({ type: 9 });
      });
    });
    {
      let n2 = this.state.id, s2 = x$3.get(null);
      this.disposables.add(s2.on(k$3.Push, (l2) => {
        !s2.selectors.isTop(l2, n2) && this.state.menuState === 0 && this.send({ type: 1 });
      })), this.on(0, () => s2.actions.push(n2)), this.on(1, () => s2.actions.pop(n2));
    }
  }
  static new({ id: t2, __demoMode: n2 = false }) {
    return new x({ id: t2, __demoMode: n2, menuState: n2 ? 0 : 1, buttonElement: null, itemsElement: null, items: [], searchQuery: "", activeItemIndex: null, activationTrigger: 1, pendingShouldSort: false, pendingFocus: { focus: c$2.Nothing } });
  }
  reduce(t2, n2) {
    return u$b(n2.type, D, t2, n2);
  }
}
const a2 = reactExports.createContext(null);
function p(t2) {
  let n2 = reactExports.useContext(a2);
  if (n2 === null) {
    let e2 = new Error(`<${t2} /> is missing a parent <Menu /> component.`);
    throw Error.captureStackTrace && Error.captureStackTrace(e2, s), e2;
  }
  return n2;
}
function s({ id: t2, __demoMode: n2 = false }) {
  let e2 = reactExports.useMemo(() => x.new({ id: t2, __demoMode: n2 }), []);
  return c$1(() => e2.dispose()), e2;
}
let et = reactExports.Fragment;
function tt(c2, E$12) {
  let p2 = reactExports.useId(), { __demoMode: a$12 = false, ...s$12 } = c2, l2 = s({ id: p2, __demoMode: a$12 }), [n2, g2, y2] = S$2(l2, (T2) => [T2.menuState, T2.itemsElement, T2.buttonElement]), I2 = y$7(E$12), o4 = x$3.get(null), h3 = S$2(o4, reactExports.useCallback((T2) => o4.selectors.isTop(T2, p2), [o4, p2]));
  k$2(h3, [y2, g2], (T2, u2) => {
    var f2;
    l2.send({ type: F.CloseMenu }), A(u2, h$2.Loose) || (T2.preventDefault(), (f2 = l2.state.buttonElement) == null || f2.focus());
  });
  let _2 = o$7(() => {
    l2.send({ type: F.CloseMenu });
  }), M2 = reactExports.useMemo(() => ({ open: n2 === E2.Open, close: _2 }), [n2, _2]), i$12 = { ref: I2 }, b2 = L$4();
  return React.createElement(Ae$2, null, React.createElement(a2.Provider, { value: l2 }, React.createElement(c$3, { value: u$b(n2, { [E2.Open]: i.Open, [E2.Closed]: i.Closed }) }, b2({ ourProps: i$12, theirProps: s$12, slot: M2, defaultTag: et, name: "Menu" }))));
}
let ot = "button";
function nt(c2, E$12) {
  let p$12 = p("Menu.Button"), a3 = reactExports.useId(), { id: s2 = `headlessui-menu-button-${a3}`, disabled: l2 = false, autoFocus: n2 = false, ...g2 } = c2, y2 = reactExports.useRef(null), I2 = be$1(), o4 = y$7(E$12, y2, Fe$1(), o$7((e2) => p$12.send({ type: F.SetButtonElement, element: e2 }))), h3 = o$7((e2) => {
    switch (e2.key) {
      case o$4.Space:
      case o$4.Enter:
      case o$4.ArrowDown:
        e2.preventDefault(), e2.stopPropagation(), p$12.send({ type: F.OpenMenu, focus: { focus: c$2.First } });
        break;
      case o$4.ArrowUp:
        e2.preventDefault(), e2.stopPropagation(), p$12.send({ type: F.OpenMenu, focus: { focus: c$2.Last } });
        break;
    }
  }), _2 = o$7((e2) => {
    switch (e2.key) {
      case o$4.Space:
        e2.preventDefault();
        break;
    }
  }), [M2, i2, b2] = S$2(p$12, (e2) => [e2.menuState, e2.buttonElement, e2.itemsElement]), T2 = M2 === E2.Open;
  k$1(T2, { trigger: i2, action: reactExports.useCallback((e2) => {
    if (i2 != null && i2.contains(e2.target)) return g$2.Ignore;
    let R2 = e2.target.closest('[role="menuitem"]:not([data-disabled])');
    return n$5(R2) ? g$2.Select(R2) : b2 != null && b2.contains(e2.target) ? g$2.Ignore : g$2.Close;
  }, [i2, b2]), close: reactExports.useCallback(() => p$12.send({ type: F.CloseMenu }), []), select: reactExports.useCallback((e2) => e2.click(), []) });
  let u2 = o$7((e2) => {
    var R2;
    if (e2.button === 0) {
      if (s$7(e2.currentTarget)) return e2.preventDefault();
      l2 || (M2 === E2.Open ? (reactDomExports.flushSync(() => p$12.send({ type: F.CloseMenu })), (R2 = y2.current) == null || R2.focus({ preventScroll: true })) : (e2.preventDefault(), p$12.send({ type: F.OpenMenu, focus: { focus: c$2.Nothing }, trigger: O.Pointer })));
    }
  }), { isFocusVisible: f2, focusProps: v2 } = $f7dceffc5ad7768b$export$4e328f61c538687f({ autoFocus: n2 }), { isHovered: S2, hoverProps: O$12 } = $6179b936705e76d3$export$ae780daf29e6d456({ isDisabled: l2 }), { pressed: F$12, pressProps: U2 } = w$6({ disabled: l2 }), H2 = reactExports.useMemo(() => ({ open: M2 === E2.Open, active: F$12 || M2 === E2.Open, disabled: l2, hover: S2, focus: f2, autofocus: n2 }), [M2, S2, f2, F$12, l2, n2]), G2 = _$3(I2(), { ref: o4, id: s2, type: e$1(c2, y2.current), "aria-haspopup": "menu", "aria-controls": b2 == null ? void 0 : b2.id, "aria-expanded": M2 === E2.Open, disabled: l2 || void 0, autoFocus: n2, onKeyDown: h3, onKeyUp: _2, onPointerDown: u2 }, v2, O$12, U2);
  return L$4()({ ourProps: G2, theirProps: g2, slot: H2, defaultTag: ot, name: "Menu.Button" });
}
let rt = "div", at = O$4.RenderStrategy | O$4.Static;
function st(c2, E$12) {
  let p$12 = reactExports.useId(), { id: a3 = `headlessui-menu-items-${p$12}`, anchor: s2, portal: l2 = false, modal: n2 = true, transition: g2 = false, ...y2 } = c2, I2 = ye$1(s2), o4 = p("Menu.Items"), [h3, _2] = Re$2(I2), M2 = Te$2(), [i$12, b2] = reactExports.useState(null), T2 = y$7(E$12, I2 ? h3 : null, o$7((t2) => o4.send({ type: F.SetItemsElement, element: t2 })), b2), [u2, f2] = S$2(o4, (t2) => [t2.menuState, t2.buttonElement]), v2 = n$2(f2), S2 = n$2(i$12);
  I2 && (l2 = true);
  let O2 = u$3(), [F$12, U2] = x$2(g2, i$12, O2 !== null ? (O2 & i.Open) === i.Open : u2 === E2.Open);
  p$2(F$12, f2, () => {
    o4.send({ type: F.CloseMenu });
  });
  let H2 = S$2(o4, (t2) => t2.__demoMode), G2 = H2 ? false : n2 && u2 === E2.Open;
  f$3(G2, S2);
  let w2 = H2 ? false : n2 && u2 === E2.Open;
  y$4(w2, { allowed: reactExports.useCallback(() => [f2, i$12], [f2, i$12]) });
  let e2 = u2 !== E2.Open, le = s$2(e2, f2) ? false : F$12;
  reactExports.useEffect(() => {
    let t2 = i$12;
    t2 && u2 === E2.Open && t2 !== (S2 == null ? void 0 : S2.activeElement) && t2.focus({ preventScroll: true });
  }, [u2, i$12, S2]), F$4(u2 === E2.Open, { container: i$12, accept(t2) {
    return t2.getAttribute("role") === "menuitem" ? NodeFilter.FILTER_REJECT : t2.hasAttribute("role") ? NodeFilter.FILTER_SKIP : NodeFilter.FILTER_ACCEPT;
  }, walk(t2) {
    t2.setAttribute("role", "none");
  } });
  let z2 = p$6(), pe = o$7((t2) => {
    var N2, Y2, Z;
    switch (z2.dispose(), t2.key) {
      case o$4.Space:
        if (o4.state.searchQuery !== "") return t2.preventDefault(), t2.stopPropagation(), o4.send({ type: F.Search, value: t2.key });
      case o$4.Enter:
        if (t2.preventDefault(), t2.stopPropagation(), o4.state.activeItemIndex !== null) {
          let { dataRef: ce2 } = o4.state.items[o4.state.activeItemIndex];
          (Y2 = (N2 = ce2.current) == null ? void 0 : N2.domRef.current) == null || Y2.click();
        }
        o4.send({ type: F.CloseMenu }), V(o4.state.buttonElement);
        break;
      case o$4.ArrowDown:
        return t2.preventDefault(), t2.stopPropagation(), o4.send({ type: F.GoToItem, focus: c$2.Next });
      case o$4.ArrowUp:
        return t2.preventDefault(), t2.stopPropagation(), o4.send({ type: F.GoToItem, focus: c$2.Previous });
      case o$4.Home:
      case o$4.PageUp:
        return t2.preventDefault(), t2.stopPropagation(), o4.send({ type: F.GoToItem, focus: c$2.First });
      case o$4.End:
      case o$4.PageDown:
        return t2.preventDefault(), t2.stopPropagation(), o4.send({ type: F.GoToItem, focus: c$2.Last });
      case o$4.Escape:
        t2.preventDefault(), t2.stopPropagation(), reactDomExports.flushSync(() => o4.send({ type: F.CloseMenu })), (Z = o4.state.buttonElement) == null || Z.focus({ preventScroll: true });
        break;
      case o$4.Tab:
        t2.preventDefault(), t2.stopPropagation(), reactDomExports.flushSync(() => o4.send({ type: F.CloseMenu })), j$1(o4.state.buttonElement, t2.shiftKey ? T$2.Previous : T$2.Next);
        break;
      default:
        t2.key.length === 1 && (o4.send({ type: F.Search, value: t2.key }), z2.setTimeout(() => o4.send({ type: F.ClearSearch }), 350));
        break;
    }
  }), ie = o$7((t2) => {
    switch (t2.key) {
      case o$4.Space:
        t2.preventDefault();
        break;
    }
  }), ue2 = reactExports.useMemo(() => ({ open: u2 === E2.Open }), [u2]), de2 = _$3(I2 ? M2() : {}, { "aria-activedescendant": S$2(o4, o4.selectors.activeDescendantId), "aria-labelledby": S$2(o4, (t2) => {
    var N2;
    return (N2 = t2.buttonElement) == null ? void 0 : N2.id;
  }), id: a3, onKeyDown: pe, onKeyUp: ie, role: "menu", tabIndex: u2 === E2.Open ? 0 : void 0, ref: T2, style: { ...y2.style, ..._2, "--button-width": d$2(f2, true).width }, ...R(U2) }), me2 = L$4();
  return React.createElement(ne$1, { enabled: l2 ? c2.static || F$12 : false, ownerDocument: v2 }, me2({ ourProps: de2, theirProps: y2, slot: ue2, defaultTag: rt, features: at, visible: le, name: "Menu.Items" }));
}
let lt = reactExports.Fragment;
function pt(c2, E3) {
  let p$12 = reactExports.useId(), { id: a3 = `headlessui-menu-item-${p$12}`, disabled: s2 = false, ...l2 } = c2, n2 = p("Menu.Item"), g2 = S$2(n2, (e2) => n2.selectors.isActive(e2, a3)), y2 = reactExports.useRef(null), I2 = y$7(E3, y2), o4 = S$2(n2, (e2) => n2.selectors.shouldScrollIntoView(e2, a3));
  n$6(() => {
    if (o4) return o$8().requestAnimationFrame(() => {
      var e2, R2;
      (R2 = (e2 = y2.current) == null ? void 0 : e2.scrollIntoView) == null || R2.call(e2, { block: "nearest" });
    });
  }, [o4, y2]);
  let h3 = s$1(y2), _2 = reactExports.useRef({ disabled: s2, domRef: y2, get textValue() {
    return h3();
  } });
  n$6(() => {
    _2.current.disabled = s2;
  }, [_2, s2]), n$6(() => (n2.actions.registerItem(a3, _2), () => n2.actions.unregisterItem(a3)), [_2, a3]);
  let M2 = o$7(() => {
    n2.send({ type: F.CloseMenu });
  }), i2 = o$7((e2) => {
    if (s2) return e2.preventDefault();
    n2.send({ type: F.CloseMenu }), V(n2.state.buttonElement);
  }), b2 = o$7(() => {
    if (s2) return n2.send({ type: F.GoToItem, focus: c$2.Nothing });
    n2.send({ type: F.GoToItem, focus: c$2.Specific, id: a3 });
  }), T2 = u$4(), u2 = o$7((e2) => {
    T2.update(e2), !s2 && (g2 || n2.send({ type: F.GoToItem, focus: c$2.Specific, id: a3, trigger: O.Pointer }));
  }), f2 = o$7((e2) => {
    T2.wasMoved(e2) && (s2 || g2 || n2.send({ type: F.GoToItem, focus: c$2.Specific, id: a3, trigger: O.Pointer }));
  }), v2 = o$7((e2) => {
    T2.wasMoved(e2) && (s2 || g2 && n2.send({ type: F.GoToItem, focus: c$2.Nothing }));
  }), [S2, O$12] = Q(), [F$12, U2] = w$5(), H2 = reactExports.useMemo(() => ({ active: g2, focus: g2, disabled: s2, close: M2 }), [g2, s2, M2]), G2 = { id: a3, ref: I2, role: "menuitem", tabIndex: s2 === true ? void 0 : -1, "aria-disabled": s2 === true ? true : void 0, "aria-labelledby": S2, "aria-describedby": F$12, disabled: void 0, onClick: i2, onFocus: b2, onPointerEnter: u2, onMouseEnter: u2, onPointerMove: f2, onMouseMove: f2, onPointerLeave: v2, onMouseLeave: v2 }, w2 = L$4();
  return React.createElement(O$12, null, React.createElement(U2, null, w2({ ourProps: G2, theirProps: l2, slot: H2, defaultTag: lt, name: "Menu.Item" })));
}
let it = "div";
function ut(c2, E3) {
  let [p2, a3] = Q(), s2 = c2, l2 = { ref: E3, "aria-labelledby": p2, role: "group" }, n2 = L$4();
  return React.createElement(a3, null, n2({ ourProps: l2, theirProps: s2, slot: {}, defaultTag: it, name: "Menu.Section" }));
}
let dt = "header";
function mt(c2, E3) {
  let p2 = reactExports.useId(), { id: a3 = `headlessui-menu-heading-${p2}`, ...s2 } = c2, l2 = C$4();
  n$6(() => l2.register(a3), [a3, l2.register]);
  let n2 = { id: a3, ref: E3, role: "presentation", ...l2.props };
  return L$4()({ ourProps: n2, theirProps: s2, slot: {}, defaultTag: dt, name: "Menu.Heading" });
}
let ct = "div";
function Tt(c2, E3) {
  let p2 = c2, a3 = { ref: E3, role: "separator" };
  return L$4()({ ourProps: a3, theirProps: p2, slot: {}, defaultTag: ct, name: "Menu.Separator" });
}
let ft = K(tt), yt = K(nt), Pt = K(st), Et = K(pt), gt = K(ut), Mt = K(mt), bt = K(Tt), lo = Object.assign(ft, { Button: yt, Items: Pt, Item: Et, Section: gt, Heading: Mt, Separator: bt });
export {
  Bt as B,
  Et as E,
  Fe as F,
  Ie as I,
  Lt as L,
  Pt as P,
  Re as R,
  V$1 as V,
  wt as a,
  Ve as b,
  ze as c,
  kt as k,
  lo as l,
  qe as q,
  wo as w,
  yt as y,
  ze$1 as z
};
