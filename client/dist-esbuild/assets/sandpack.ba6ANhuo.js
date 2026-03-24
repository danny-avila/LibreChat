import{aw as jr,ax as Ho,r as p,ay as Er,j as c,N as Et,az as kr,aA as Nr,aB as $r,aC as Lt,aD as Uo,aE as zo,aF as Vo,aG as Jo,aH as Wo}from"./vendor.CSn_ebf2.js";import{D as Ce,V as Rt,E as _e,k as kt,s as Tr,c as Or,d as Ar,h as Mr,a as Lr,b as Rr,e as Ir,f as _r,g as Dr,i as Fr,j as Pr,l as Br,S as Qe,m as Hr,A as Nt,n as Ur,o as zr,p as $t,H as Vr,t as z,q as Jr,r as Wr,u as Yr}from"./codemirror.BqPOSNyw.js";const Yo="modulepreload",Zo=function(e,t){return new URL(e,t).href},Rn={},Bt=function(t,n,o){let i=Promise.resolve();if(n&&n.length>0){let a=function(d){return Promise.all(d.map(f=>Promise.resolve(f).then(v=>({status:"fulfilled",value:v}),v=>({status:"rejected",reason:v}))))};const u=document.getElementsByTagName("link"),l=document.querySelector("meta[property=csp-nonce]"),s=(l==null?void 0:l.nonce)||(l==null?void 0:l.getAttribute("nonce"));i=a(n.map(d=>{if(d=Zo(d,o),d in Rn)return;Rn[d]=!0;const f=d.endsWith(".css"),v=f?'[rel="stylesheet"]':"";if(!!o)for(let h=u.length-1;h>=0;h--){const S=u[h];if(S.href===d&&(!f||S.rel==="stylesheet"))return}else if(document.querySelector(`link[href="${d}"]${v}`))return;const g=document.createElement("link");if(g.rel=f?"stylesheet":Yo,f||(g.as="script"),g.crossOrigin="",g.href=d,s&&g.setAttribute("nonce",s),document.head.appendChild(g),f)return new Promise((h,S)=>{g.addEventListener("load",h),g.addEventListener("error",()=>S(new Error(`Unable to preload CSS for ${d}`)))})}))}function r(a){const u=new Event("vite:preloadError",{cancelable:!0});if(u.payload=a,window.dispatchEvent(u),!u.defaultPrevented)throw a}return i.then(a=>{for(const u of a||[])u.status==="rejected"&&r(u.reason);return t().catch(r)})};var tn=function(e,t){return tn=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(n,o){n.__proto__=o}||function(n,o){for(var i in o)Object.prototype.hasOwnProperty.call(o,i)&&(n[i]=o[i])},tn(e,t)};function xn(e,t){if(typeof t!="function"&&t!==null)throw new TypeError("Class extends value "+String(t)+" is not a constructor or null");tn(e,t);function n(){this.constructor=e}e.prototype=t===null?Object.create(t):(n.prototype=t.prototype,new n)}var se=function(){return se=Object.assign||function(t){for(var n,o=1,i=arguments.length;o<i;o++){n=arguments[o];for(var r in n)Object.prototype.hasOwnProperty.call(n,r)&&(t[r]=n[r])}return t},se.apply(this,arguments)};function Ee(e,t,n,o){function i(r){return r instanceof n?r:new n(function(a){a(r)})}return new(n||(n=Promise))(function(r,a){function u(d){try{s(o.next(d))}catch(f){a(f)}}function l(d){try{s(o.throw(d))}catch(f){a(f)}}function s(d){d.done?r(d.value):i(d.value).then(u,l)}s((o=o.apply(e,[])).next())})}function ke(e,t){var n={label:0,sent:function(){if(r[0]&1)throw r[1];return r[1]},trys:[],ops:[]},o,i,r,a;return a={next:u(0),throw:u(1),return:u(2)},typeof Symbol=="function"&&(a[Symbol.iterator]=function(){return this}),a;function u(s){return function(d){return l([s,d])}}function l(s){if(o)throw new TypeError("Generator is already executing.");for(;n;)try{if(o=1,i&&(r=s[0]&2?i.return:s[0]?i.throw||((r=i.return)&&r.call(i),0):i.next)&&!(r=r.call(i,s[1])).done)return r;switch(i=0,r&&(s=[s[0]&2,r.value]),s[0]){case 0:case 1:r=s;break;case 4:return n.label++,{value:s[1],done:!1};case 5:n.label++,i=s[1],s=[0];continue;case 7:s=n.ops.pop(),n.trys.pop();continue;default:if(r=n.trys,!(r=r.length>0&&r[r.length-1])&&(s[0]===6||s[0]===2)){n=0;continue}if(s[0]===3&&(!r||s[1]>r[0]&&s[1]<r[3])){n.label=s[1];break}if(s[0]===6&&n.label<r[1]){n.label=r[1],r=s;break}if(r&&n.label<r[2]){n.label=r[2],n.ops.push(s);break}r[2]&&n.ops.pop(),n.trys.pop();continue}s=t.call(e,n)}catch(d){s=[6,d],i=0}finally{o=r=0}if(s[0]&5)throw s[1];return{value:s[0]?s[1]:void 0,done:!0}}}function Tt(e,t,n){if(n||arguments.length===2)for(var o=0,i=t.length,r;o<i;o++)(r||!(o in t))&&(r||(r=Array.prototype.slice.call(t,0,o)),r[o]=t[o]);return e.concat(r||Array.prototype.slice.call(t))}var nn;(function(e){e[e.None=0]="None",e[e.Error=10]="Error",e[e.Warning=20]="Warning",e[e.Info=30]="Info",e[e.Debug=40]="Debug"})(nn||(nn={}));var Ge=function(e){return"[sandpack-client]: ".concat(e)};function We(e,t){return t===void 0&&(t="Value is nullish"),jr(e!=null,Ge(t)),e}var qo='"dependencies" was not specified - provide either a package.json or a "dependencies" value',In='"entry" was not specified - provide either a package.json with the "main" field or an "entry" value';function Zr(e,t,n){return e===void 0&&(e={}),t===void 0&&(t={}),n===void 0&&(n="/index.js"),JSON.stringify({name:"sandpack-project",main:n,dependencies:e,devDependencies:t},null,2)}function wn(e,t,n,o){var i,r,a=Me(e),u=a["/package.json"];if(!u)return We(t,qo),We(o,In),a["/package.json"]={code:Zr(t,n,o)},a;if(u){var l=JSON.parse(u.code);We(!(!t&&!l.dependencies),In),t&&(l.dependencies=se(se({},(i=l.dependencies)!==null&&i!==void 0?i:{}),t??{})),n&&(l.devDependencies=se(se({},(r=l.devDependencies)!==null&&r!==void 0?r:{}),n??{})),o&&(l.main=o),a["/package.json"]={code:JSON.stringify(l,null,2)}}return a}function Sn(e){var t;if(e.title==="SyntaxError"){var n=e.title,o=e.path,i=e.message,r=e.line,a=e.column;return{title:n,path:o,message:i,line:r,column:a}}var u=Go((t=e.payload)===null||t===void 0?void 0:t.frames);if(!u)return{message:e.message};var l=Xo(u),s=Ko(u),d=Qo(u._originalFileName,e.message,s,l);return{message:d,title:e.title,path:u._originalFileName,line:u._originalLineNumber,column:u._originalColumnNumber}}function Go(e){if(e)return e.find(function(t){return!!t._originalFileName})}function Ko(e){return e?" (".concat(e._originalLineNumber,":").concat(e._originalColumnNumber,")"):""}function Xo(e){var t=e._originalScriptCode[e._originalScriptCode.length-1],n=t.lineNumber.toString().length,o=2,i=3,r=o+n+i+e._originalColumnNumber;return e._originalScriptCode.reduce(function(a,u){var l=u.highlight?">":" ",s=u.lineNumber.toString().length===n?"".concat(u.lineNumber):" ".concat(u.lineNumber),d=u.highlight?`
`+" ".repeat(r)+"^":"";return a+`
`+l+" "+s+" | "+u.content+d},"")}function Qo(e,t,n,o){return"".concat(e,": ").concat(t).concat(n,`
`).concat(o)}var Me=function(e){return typeof e=="string"?e.startsWith("/")?e:"/".concat(e):Array.isArray(e)?e.map(function(t){return t.startsWith("/")?t:"/".concat(t)}):typeof e=="object"&&e!==null?Object.entries(e).reduce(function(t,n){var o=n[0],i=n[1],r=o.startsWith("/")?o:"/".concat(o);return t[r]=i,t},{}):null};function qr(e,t,n){var o;return n===void 0&&(n={}),Ee(this,void 0,void 0,function(){var i,r,a;return ke(this,function(u){switch(u.label){case 0:switch(i=(o=t.template)!==null&&o!==void 0?o:"parcel",a=i,a){case"node":return[3,1];case"static":return[3,3]}return[3,5];case 1:return[4,Bt(()=>Promise.resolve().then(()=>Hl),void 0,import.meta.url).then(function(l){return l.SandpackNode})];case 2:return r=u.sent(),[3,7];case 3:return[4,Bt(()=>Promise.resolve().then(()=>Jl),void 0,import.meta.url).then(function(l){return l.SandpackStatic})];case 4:return r=u.sent(),[3,7];case 5:return[4,Bt(()=>Promise.resolve().then(()=>ru),void 0,import.meta.url).then(function(l){return l.SandpackRuntime})];case 6:r=u.sent(),u.label=7;case 7:return[2,new r(e,t,n)]}})})}var y=function(){return y=Object.assign||function(t){for(var n,o=1,i=arguments.length;o<i;o++){n=arguments[o];for(var r in n)Object.prototype.hasOwnProperty.call(n,r)&&(t[r]=n[r])}return t},y.apply(this,arguments)};function fe(e,t){var n={};for(var o in e)Object.prototype.hasOwnProperty.call(e,o)&&t.indexOf(o)<0&&(n[o]=e[o]);if(e!=null&&typeof Object.getOwnPropertySymbols=="function")for(var i=0,o=Object.getOwnPropertySymbols(e);i<o.length;i++)t.indexOf(o[i])<0&&Object.prototype.propertyIsEnumerable.call(e,o[i])&&(n[o[i]]=e[o[i]]);return n}function Be(e,t,n,o){function i(r){return r instanceof n?r:new n(function(a){a(r)})}return new(n||(n=Promise))(function(r,a){function u(d){try{s(o.next(d))}catch(f){a(f)}}function l(d){try{s(o.throw(d))}catch(f){a(f)}}function s(d){d.done?r(d.value):i(d.value).then(u,l)}s((o=o.apply(e,[])).next())})}function He(e,t){var n={label:0,sent:function(){if(r[0]&1)throw r[1];return r[1]},trys:[],ops:[]},o,i,r,a;return a={next:u(0),throw:u(1),return:u(2)},typeof Symbol=="function"&&(a[Symbol.iterator]=function(){return this}),a;function u(s){return function(d){return l([s,d])}}function l(s){if(o)throw new TypeError("Generator is already executing.");for(;n;)try{if(o=1,i&&(r=s[0]&2?i.return:s[0]?i.throw||((r=i.return)&&r.call(i),0):i.next)&&!(r=r.call(i,s[1])).done)return r;switch(i=0,r&&(s=[s[0]&2,r.value]),s[0]){case 0:case 1:r=s;break;case 4:return n.label++,{value:s[1],done:!1};case 5:n.label++,i=s[1],s=[0];continue;case 7:s=n.ops.pop(),n.trys.pop();continue;default:if(r=n.trys,!(r=r.length>0&&r[r.length-1])&&(s[0]===6||s[0]===2)){n=0;continue}if(s[0]===3&&(!r||s[1]>r[0]&&s[1]<r[3])){n.label=s[1];break}if(s[0]===6&&n.label<r[1]){n.label=r[1],r=s;break}if(r&&n.label<r[2]){n.label=r[2],n.ops.push(s);break}r[2]&&n.ops.pop(),n.trys.pop();continue}s=t.call(e,n)}catch(d){s=[6,d],i=0}finally{o=r=0}if(s[0]&5)throw s[1];return{value:s[0]?s[1]:void 0,done:!0}}}function we(e,t,n){if(n||arguments.length===2)for(var o=0,i=t.length,r;o<i;o++)(r||!(o in t))&&(r||(r=Array.prototype.slice.call(t,0,o)),r[o]=t[o]);return e.concat(r||Array.prototype.slice.call(t))}var Le=function(e){return c.jsx("svg",y({fill:"currentColor",height:"16",viewBox:"0 0 16 16",width:"16",xmlns:"http://www.w3.org/2000/svg"},e))},ei=function(){return c.jsxs(Le,{viewBox:"0 0 48 48",children:[c.jsx("title",{children:"Sign in"}),c.jsx("path",{d:"M9 42q-1.2 0-2.1-.9Q6 40.2 6 39V9q0-1.2.9-2.1Q7.8 6 9 6h14.55v3H9v30h14.55v3Zm24.3-9.25-2.15-2.15 5.1-5.1h-17.5v-3h17.4l-5.1-5.1 2.15-2.15 8.8 8.8Z"})]})},ti=function(){return c.jsxs(Le,{viewBox:"0 0 48 48",children:[c.jsx("title",{children:"Sign out"}),c.jsx("path",{d:"M9 42q-1.2 0-2.1-.9Q6 40.2 6 39V9q0-1.2.9-2.1Q7.8 6 9 6h14.55v3H9v30h14.55v3Zm24.3-9.25-2.15-2.15 5.1-5.1h-17.5v-3h17.4l-5.1-5.1 2.15-2.15 8.8 8.8Z"})]})},It=function(){return c.jsxs(Le,{fill:"none",stroke:"currentColor",children:[c.jsx("title",{children:"Restart script"}),c.jsx("path",{d:"M8 2C4.68629 2 2 4.68629 2 8C2 10.0946 3.07333 11.9385 4.7 13.0118",strokeLinecap:"round"}),c.jsx("path",{d:"M14.0005 7.9998C14.0005 5.82095 12.8391 3.91335 11.1016 2.8623",strokeLinecap:"round"}),c.jsx("path",{d:"M14.0003 2.3335H11.167C10.8908 2.3335 10.667 2.55735 10.667 2.8335V5.66683",strokeLinecap:"round"}),c.jsx("path",{d:"M1.99967 13.6665L4.83301 13.6665C5.10915 13.6665 5.33301 13.4426 5.33301 13.1665L5.33301 10.3332",strokeLinecap:"round"}),c.jsx("path",{d:"M10 10L12 12L10 14",strokeLinecap:"round",strokeLinejoin:"round"}),c.jsx("path",{d:"M14.667 14L12.667 14",strokeLinecap:"round",strokeLinejoin:"round"})]})},ni=function(){return c.jsxs(Le,{children:[c.jsx("title",{children:"Run sandbox"}),c.jsx("path",{d:"M11.0792 8.1078C11.2793 8.25007 11.27 8.55012 11.0616 8.67981L6.02535 11.8135C5.79638 11.956 5.5 11.7913 5.5 11.5216L5.5 8.40703L5.5 4.80661C5.5 4.52735 5.81537 4.36463 6.04296 4.52647L11.0792 8.1078Z"})]})},ri=function(){return c.jsxs(Le,{children:[c.jsx("title",{children:"Click to go back"}),c.jsx("path",{d:"M9.64645 12.3536C9.84171 12.5488 10.1583 12.5488 10.3536 12.3536C10.5488 12.1583 10.5488 11.8417 10.3536 11.6464L9.64645 12.3536ZM10.3536 4.35355C10.5488 4.15829 10.5488 3.84171 10.3536 3.64644C10.1583 3.45118 9.84171 3.45118 9.64645 3.64644L10.3536 4.35355ZM6.07072 7.92929L5.71716 7.57573L6.07072 7.92929ZM10.3536 11.6464L6.42427 7.71716L5.71716 8.42426L9.64645 12.3536L10.3536 11.6464ZM6.42427 8.28284L10.3536 4.35355L9.64645 3.64644L5.71716 7.57573L6.42427 8.28284ZM6.42427 7.71716C6.58048 7.87337 6.58048 8.12663 6.42427 8.28284L5.71716 7.57573C5.48285 7.81005 5.48285 8.18995 5.71716 8.42426L6.42427 7.71716Z"})]})},oi=function(){return c.jsxs(Le,{children:[c.jsx("title",{children:"Click to go forward"}),c.jsx("path",{d:"M6.35355 3.64645C6.15829 3.45118 5.84171 3.45118 5.64645 3.64645C5.45118 3.84171 5.45118 4.15829 5.64645 4.35355L6.35355 3.64645ZM5.64645 11.6464C5.45118 11.8417 5.45118 12.1583 5.64645 12.3536C5.84171 12.5488 6.15829 12.5488 6.35355 12.3536L5.64645 11.6464ZM9.92929 8.07071L10.2828 8.42426L9.92929 8.07071ZM5.64645 4.35355L9.57574 8.28284L10.2828 7.57574L6.35355 3.64645L5.64645 4.35355ZM9.57574 7.71716L5.64645 11.6464L6.35355 12.3536L10.2828 8.42426L9.57574 7.71716ZM9.57574 8.28284C9.41952 8.12663 9.41953 7.87337 9.57574 7.71716L10.2828 8.42426C10.5172 8.18995 10.5172 7.81005 10.2828 7.57574L9.57574 8.28284Z"})]})},Gr=function(){return c.jsxs(Le,{children:[c.jsx("title",{children:"Refresh preview"}),c.jsx("path",{clipRule:"evenodd",d:"M3.83325 7.99992C3.83325 5.69867 5.69853 3.83325 7.99934 3.83325C9.81246 3.83325 11.3563 4.99195 11.9285 6.61097C11.9396 6.6425 11.9536 6.67221 11.97 6.69992H8.80005C8.52391 6.69992 8.30005 6.92378 8.30005 7.19992C8.30005 7.47606 8.52391 7.69992 8.80005 7.69992H12.5667C12.8981 7.69992 13.1667 7.43129 13.1667 7.09992V3.33325C13.1667 3.05711 12.9429 2.83325 12.6667 2.83325C12.3906 2.83325 12.1667 3.05711 12.1667 3.33325V4.94608C11.2268 3.66522 9.7106 2.83325 7.99934 2.83325C5.14613 2.83325 2.83325 5.14651 2.83325 7.99992C2.83325 10.8533 5.14613 13.1666 7.99934 13.1666C9.91218 13.1666 11.5815 12.1266 12.474 10.5836C12.6123 10.3446 12.5306 10.0387 12.2915 9.90044C12.0525 9.76218 11.7466 9.84387 11.6084 10.0829C10.8873 11.3296 9.54072 12.1666 7.99934 12.1666C5.69853 12.1666 3.83325 10.3012 3.83325 7.99992Z",fillRule:"evenodd"})]})},ii=function(){return c.jsxs(Le,{fill:"none",stroke:"currentColor",children:[c.jsx("title",{children:"Clean"}),c.jsx("circle",{cx:"7.99998",cy:"8.00004",r:"4.66667",strokeLinecap:"round"}),c.jsx("path",{d:"M4.66669 4.66663L11.3334 11.3333"})]})},ai=function(){return c.jsxs(Le,{fill:"none",stroke:"currentColor",children:[c.jsx("title",{children:"Open on CodeSandbox"}),c.jsx("path",{d:"M6.66665 3.33337H4.33331C3.78103 3.33337 3.33331 3.78109 3.33331 4.33337V11.6667C3.33331 12.219 3.78103 12.6667 4.33331 12.6667H11.6666C12.2189 12.6667 12.6666 12.219 12.6666 11.6667V9.33337",strokeLinecap:"round"}),c.jsx("path",{d:"M10 3.33337H12.5667C12.6219 3.33337 12.6667 3.37815 12.6667 3.43337V6.00004",strokeLinecap:"round"}),c.jsx("path",{d:"M7.33331 8.66668L12.5333 3.46667",strokeLinecap:"round"})]})},si=function(){return c.jsxs(Le,{stroke:"currentColor",children:[c.jsx("title",{children:"Close file"}),c.jsx("path",{d:"M12 4L4 12",strokeLinecap:"round"}),c.jsx("path",{d:"M4 4L12 12",strokeLinecap:"round"})]})},ci=function(){return c.jsxs(Le,{children:[c.jsx("title",{children:"Open browser console"}),c.jsx("path",{d:"M5.65871 3.62037C5.44905 3.44066 5.1334 3.46494 4.95368 3.6746C4.77397 3.88427 4.79825 4.19992 5.00792 4.37963L5.65871 3.62037ZM5.00792 11.6204C4.79825 11.8001 4.77397 12.1157 4.95368 12.3254C5.1334 12.5351 5.44905 12.5593 5.65871 12.3796L5.00792 11.6204ZM9.9114 7.92407L10.2368 7.54445L9.9114 7.92407ZM5.00792 4.37963L9.586 8.3037L10.2368 7.54445L5.65871 3.62037L5.00792 4.37963ZM9.586 7.6963L5.00792 11.6204L5.65871 12.3796L10.2368 8.45555L9.586 7.6963ZM9.586 8.3037C9.39976 8.14407 9.39976 7.85594 9.586 7.6963L10.2368 8.45555C10.5162 8.2161 10.5162 7.7839 10.2368 7.54445L9.586 8.3037Z"}),c.jsx("path",{d:"M10 11.5C9.72386 11.5 9.5 11.7239 9.5 12C9.5 12.2761 9.72386 12.5 10 12.5V11.5ZM14.6667 12.5C14.9428 12.5 15.1667 12.2761 15.1667 12C15.1667 11.7239 14.9428 11.5 14.6667 11.5V12.5ZM10 12.5H14.6667V11.5H10V12.5Z"})]})},Ht,et={colors:{surface1:"#ffffff",surface2:"#EFEFEF",surface3:"#F3F3F3",disabled:"#C5C5C5",base:"#323232",clickable:"#808080",hover:"#4D4D4D",accent:"#3973E0",error:"#EA3323",errorSurface:"#FCF1F0",warning:"#6A4516",warningSurface:"#FEF2C0"},syntax:{plain:"#151515",comment:{color:"#999",fontStyle:"italic"},keyword:"#7C5AE3",tag:"#0971F1",punctuation:"#3B3B3B",definition:"#85A600",property:"#3B3B3B",static:"#3B3B3B",string:"#2E6BD0"},font:{body:'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"',mono:'"Fira Mono", "DejaVu Sans Mono", Menlo, Consolas, "Liberation Mono", Monaco, "Lucida Console", monospace',size:"13px",lineHeight:"20px"}},rn={colors:{surface1:"#151515",surface2:"#252525",surface3:"#2F2F2F",disabled:"#4D4D4D",base:"#808080",clickable:"#999999",hover:"#C5C5C5",accent:"#E5E5E5",error:"#FFB4A6",errorSurface:"#690000",warning:"#E7C400",warningSurface:"#3A3000"},syntax:{plain:"#FFFFFF",comment:{color:"#757575",fontStyle:"italic"},keyword:"#77B7D7",tag:"#DFAB5C",punctuation:"#ffffff",definition:"#86D9CA",property:"#77B7D7",static:"#C64640",string:"#977CDC"},font:{body:'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"',mono:'"Fira Mono", "DejaVu Sans Mono", Menlo, Consolas, "Liberation Mono", Monaco, "Lucida Console", monospace',size:"13px",lineHeight:"20px"}},li={light:et,dark:rn,auto:typeof window<"u"&&!((Ht=window==null?void 0:window.matchMedia)===null||Ht===void 0)&&Ht.call(window,"(prefers-color-scheme: dark)").matches?rn:et},Ot=function(e){var t=e.lastIndexOf("/");return e.slice(t+1)},ui=function(e,t){var n=(e[0]==="/"?e.slice(1):e).split("/"),o=[];if(n.length===1)o.unshift(n[0]);else for(var i=0;i<t.length;i++)for(var r=t[i].split("/"),a=1;a<=n.length;a++){var u=n[n.length-a],l=r[r.length-a];if(o.length<a&&o.unshift(u),u!==l)break}return o.length<n.length&&o.unshift(".."),o.join("/")},_n=function(e){var t=0,n=0,o=0;if(e.startsWith("#")){if(e.length<7)return!0;t=parseInt(e.substr(1,2),16),n=parseInt(e.substr(3,2),16),o=parseInt(e.substr(5,2),16)}else{var i=e.replace("rgb(","").replace("rgba(","").replace(")","").split(",");if(i.length<3)return!0;t=parseInt(i[0],10),n=parseInt(i[1],10),o=parseInt(i[2],10)}var r=(t*299+n*587+o*114)/1e3;return r<128},di=0,nt=function(){var e=+(Date.now().toString(10).substr(0,4)+di++);return e.toString(16)},ut,ne="sp",fi=(ut=Ho({prefix:ne}),ut.createTheme),N=ut.css;ut.getCssText;var Kr=ut.keyframes,pi={space:new Array(11).fill(" ").reduce(function(e,t,n){var o;return y(y({},e),(o={},o[n+1]="".concat((n+1)*4,"px"),o))},{}),border:{radius:"4px"},layout:{height:"300px",headerHeight:"40px"},transitions:{default:"150ms ease"},zIndices:{base:"1",overlay:"2",top:"3"}},vi=function(e){var t=Object.entries(e.syntax),n=t.reduce(function(o,i){var r,a=i[0],u=i[1],l=(r={},r["color-".concat(a)]=u,r);return typeof u=="object"&&(l=Object.entries(u).reduce(function(s,d){var f,v=d[0],m=d[1];return y(y({},s),(f={},f["".concat(v,"-").concat(a)]=m,f))},{})),y(y({},o),l)},{});return y(y({},pi),{colors:e.colors,font:e.font,syntax:n})},mi=function(e){var t,n,o,i,r;e===void 0&&(e="light");var a="default";if(typeof e=="string"){var u=li[e];if(!u)throw new Error("[sandpack-react]: invalid theme '".concat(e,"' provided."));return{theme:u,id:e,mode:_n(u.colors.surface1)?"dark":"light"}}var l=_n((n=(t=e==null?void 0:e.colors)===null||t===void 0?void 0:t.surface1)!==null&&n!==void 0?n:et.colors.surface1)?"dark":"light",s=l==="dark"?rn:et,d=y(y({},s.colors),(o=e==null?void 0:e.colors)!==null&&o!==void 0?o:{}),f=y(y({},s.syntax),(i=e==null?void 0:e.syntax)!==null&&i!==void 0?i:{}),v=y(y({},s.font),(r=e==null?void 0:e.font)!==null&&r!==void 0?r:{}),m={colors:d,syntax:f,font:v},g=e?hi(JSON.stringify(m)):a;return{theme:m,id:"sp-".concat(g),mode:l}},hi=function(e){for(var t=0,n=0;n<e.length;t&=t)t=31*t+e.charCodeAt(n++);return Math.abs(t)},Dn=function(){return""};Dn.toString=Dn;var Xr=p.createContext({}),gi=function(e){var t=e.children,n=e.classes;return c.jsx(Xr.Provider,{value:n||{},children:t})},be=function(){var e=p.useContext(Xr);return function(n,o){o===void 0&&(o=[]);var i="".concat(ne,"-").concat(n);return bi.apply(void 0,we(we([],o,!1),[i,e[i]],!1))}},bi=function(){for(var e=[],t=0;t<arguments.length;t++)e[t]=arguments[t];return e.filter(Boolean).join(" ")},yi=N({all:"initial",fontSize:"$font$size",fontFamily:"$font$body",display:"block",boxSizing:"border-box",textRendering:"optimizeLegibility",WebkitTapHighlightColor:"transparent",WebkitFontSmoothing:"subpixel-antialiased",variants:{variant:{dark:{colorScheme:"dark"},light:{colorScheme:"light"}}},"@media screen and (min-resolution: 2dppx)":{WebkitFontSmoothing:"antialiased",MozOsxFontSmoothing:"grayscale"},"*":{boxSizing:"border-box"},".sp-wrapper:focus":{outline:"0"}}),Cn=p.createContext({theme:et,id:"light",mode:"light"}),xi=function(e){var t=e.theme,n=e.children,o=e.className,i=fe(e,["theme","children","className"]),r=p.useState(t),a=r[0],u=r[1],l=mi(a),s=l.theme,d=l.id,f=l.mode,v=be(),m=p.useMemo(function(){return fi(d,vi(s))},[s,d]);return p.useEffect(function(){if(t!=="auto"){u(t);return}var g=function(h){var S=h.matches;u(S?"dark":"light")};return window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change",g),function(){window.matchMedia("(prefers-color-scheme: dark)").removeEventListener("change",g)}},[t]),c.jsx(Cn.Provider,{value:{theme:s,id:d,mode:f},children:c.jsx("div",y({className:v("wrapper",[m,yi({variant:f}),o])},i,{children:n}))})};Cn.Consumer;var ue={"/styles.css":{code:`body {
  font-family: sans-serif;
  -webkit-font-smoothing: auto;
  -moz-font-smoothing: auto;
  -moz-osx-font-smoothing: grayscale;
  font-smoothing: auto;
  text-rendering: optimizeLegibility;
  font-smooth: always;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
}

h1 {
  font-size: 1.5rem;
}`}},wi={files:{"/src/styles.css":ue["/styles.css"],"/src/pages/index.astro":{code:`---
import "../styles.css";
const data = "world";
---

<h1>Hello {data}</h1>

<style>
  h1 {
    font-size: 1.5rem;
  }
</style>`},".env":{code:'ASTRO_TELEMETRY_DISABLED="1"'},"/package.json":{code:JSON.stringify({dependencies:{astro:"^1.6.12","esbuild-wasm":"^0.15.16"},scripts:{dev:"astro dev",start:"astro dev",build:"astro build",preview:"astro preview",astro:"astro"}})}},main:"/src/pages/index.astro",environment:"node"},Si={files:y(y({},ue),{"/pages/_app.js":{code:`import '../styles.css'

export default function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />
}`},"/pages/index.js":{code:`export default function Home({ data }) {
  return (
    <div>
      <h1>Hello {data}</h1>
    </div>
  );
}
  
export function getServerSideProps() {
  return {
    props: { data: "world" },
  }
}
`},"/next.config.js":{code:`/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
}

module.exports = nextConfig
`},"/package.json":{code:JSON.stringify({name:"my-app",version:"0.1.0",private:!0,scripts:{dev:"NEXT_TELEMETRY_DISABLED=1 next dev",build:"next build",start:"next start",lint:"next lint"},dependencies:{next:"12.1.6",react:"18.2.0","react-dom":"18.2.0","@next/swc-wasm-nodejs":"12.1.6"}})}}),main:"/pages/index.js",environment:"node"},Ci={files:{"/index.js":{code:`const http = require('http');

const hostname = '127.0.0.1';
const port = 3000;

const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html');
  res.end('Hello world');
});

server.listen(port, hostname, () => {
  console.log(\`Server running at http://\${hostname}:\${port}/\`);
});`},"/package.json":{code:JSON.stringify({dependencies:{},scripts:{start:"node index.js"},main:"index.js"})}},main:"/index.js",environment:"node"},ji={files:y(y({},ue),{"/index.js":{code:`import "./styles.css";

document.getElementById("app").innerHTML = \`
<h1>Hello world</h1>
\`;
`},"/index.html":{code:`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite App</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/index.js"><\/script>
  </body>
</html>
`},"/package.json":{code:JSON.stringify({scripts:{dev:"vite",build:"vite build",preview:"vite preview"},devDependencies:{vite:"4.1.4","esbuild-wasm":"0.17.12"}})}}),main:"/index.js",environment:"node"},Ei={files:y(y({},ue),{"/App.jsx":{code:`export default function App() {
  const data = "world"

  return <h1>Hello {data}</h1>
}
`},"/index.jsx":{code:`import { render } from "preact";
import "./styles.css";

import App from "./App";

const root = document.getElementById("root");
render(<App />, root);
`},"/index.html":{code:`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/index.jsx"><\/script>
  </body>
</html>
`},"/package.json":{code:JSON.stringify({scripts:{dev:"vite",build:"vite build",preview:"vite preview"},dependencies:{preact:"^10.16.0"},devDependencies:{"@preact/preset-vite":"^2.5.0",vite:"4.1.4","esbuild-wasm":"0.17.12"}})},"/vite.config.js":{code:`import { defineConfig } from "vite";
import preact from '@preact/preset-vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [preact()],
});
`}}),main:"/App.jsx",environment:"node"},ki={files:y(y({},ue),{"/App.tsx":{code:`export default function App() {
  const data: string = "world"

  return <h1>Hello {data}</h1>
}
`},"/index.tsx":{code:`import { render } from "preact";
import "./styles.css";

import App from "./App";

const root = document.getElementById("root") as HTMLElement;
render(<App />, root);
`},"/index.html":{code:`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/index.tsx"><\/script>
  </body>
</html>
`},"/tsconfig.json":{code:JSON.stringify({compilerOptions:{target:"ESNext",useDefineForClassFields:!0,lib:["DOM","DOM.Iterable","ESNext"],allowJs:!1,skipLibCheck:!0,esModuleInterop:!1,allowSyntheticDefaultImports:!0,strict:!0,forceConsistentCasingInFileNames:!0,module:"ESNext",moduleResolution:"Node",resolveJsonModule:!0,isolatedModules:!0,noEmit:!0,jsx:"react-jsx",jsxImportSource:"preact"},include:["src"],references:[{path:"./tsconfig.node.json"}]},null,2)},"/tsconfig.node.json":{code:JSON.stringify({compilerOptions:{composite:!0,module:"ESNext",moduleResolution:"Node",allowSyntheticDefaultImports:!0},include:["vite.config.ts"]},null,2)},"/package.json":{code:JSON.stringify({scripts:{dev:"vite",build:"tsc && vite build",preview:"vite preview"},dependencies:{preact:"^10.16.0"},devDependencies:{"@preact/preset-vite":"^2.5.0",typescript:"^4.9.5",vite:"4.1.4","esbuild-wasm":"^0.17.12"}},null,2)},"/vite-env.d.ts":{code:'/// <reference types="vite/client" />'},"/vite.config.ts":{code:`import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [preact()],
})
`}}),main:"/App.tsx",environment:"node"},Ni={files:y(y({},ue),{"/App.jsx":{code:`export default function App() {
  const data = "world"

  return <h1>Hello {data}</h1>
}
`},"/index.jsx":{code:`import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

import App from "./App";

const root = createRoot(document.getElementById("root"));
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);`},"/index.html":{code:`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/index.jsx"><\/script>
  </body>
</html>
`},"/package.json":{code:JSON.stringify({scripts:{dev:"vite",build:"vite build",preview:"vite preview"},dependencies:{react:"^18.2.0","react-dom":"^18.2.0"},devDependencies:{"@vitejs/plugin-react":"3.1.0",vite:"4.1.4","esbuild-wasm":"0.17.12"}})},"/vite.config.js":{code:`import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
});
`}}),main:"/App.jsx",environment:"node"},$i={files:y(y({},ue),{"/App.tsx":{code:`export default function App() {
  const data: string = "world"

  return <h1>Hello {data}</h1>
}
`},"/index.tsx":{code:`import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

import App from "./App";
import React from "react";

const root = createRoot(document.getElementById("root") as HTMLElement);
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
`},"/index.html":{code:`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/index.tsx"><\/script>
  </body>
</html>
`},"/tsconfig.json":{code:JSON.stringify({compilerOptions:{target:"ESNext",useDefineForClassFields:!0,lib:["DOM","DOM.Iterable","ESNext"],allowJs:!1,skipLibCheck:!0,esModuleInterop:!1,allowSyntheticDefaultImports:!0,strict:!0,forceConsistentCasingInFileNames:!0,module:"ESNext",moduleResolution:"Node",resolveJsonModule:!0,isolatedModules:!0,noEmit:!0,jsx:"react-jsx"},include:["src"],references:[{path:"./tsconfig.node.json"}]},null,2)},"/tsconfig.node.json":{code:JSON.stringify({compilerOptions:{composite:!0,module:"ESNext",moduleResolution:"Node",allowSyntheticDefaultImports:!0},include:["vite.config.ts"]},null,2)},"/package.json":{code:JSON.stringify({scripts:{dev:"vite",build:"tsc && vite build",preview:"vite preview"},dependencies:{react:"^18.2.0","react-dom":"^18.2.0"},devDependencies:{"@types/react":"^18.0.28","@types/react-dom":"^18.0.11","@vitejs/plugin-react":"^3.1.0",typescript:"^4.9.5",vite:"4.1.4","esbuild-wasm":"^0.17.12"}},null,2)},"/vite-env.d.ts":{code:'/// <reference types="vite/client" />'},"/vite.config.ts":{code:`import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
})
`}}),main:"/App.tsx",environment:"node"},Ti={files:{"/src/styles.css":ue["/styles.css"],"/src/App.svelte":{code:`<script>
const data = "world";
<\/script>

<h1>Hello {data}</h1>

<style>
h1 {
  font-size: 1.5rem;
}
</style>`},"/src/main.js":{code:`import App from './App.svelte'
import "./styles.css"

const app = new App({
  target: document.getElementById('app'),
})

export default app`},"/index.html":{code:`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite App</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"><\/script>
  </body>
</html>
`},"/vite.config.js":{code:`import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [svelte()],
})`},"/package.json":{code:JSON.stringify({type:"module",scripts:{dev:"vite"},devDependencies:{"@sveltejs/vite-plugin-svelte":"^2.0.2",svelte:"^3.55.1",vite:"4.0.4","esbuild-wasm":"^0.17.12"}})}},main:"/src/App.svelte",environment:"node"},Oi={files:{"/src/styles.css":ue["/styles.css"],"/src/App.svelte":{code:`<script lang="ts">
const data: string = "world";
<\/script>

<h1>Hello {data}</h1>

<style>
h1 {
  font-size: 1.5rem;
}
</style>`},"/src/main.ts":{code:`import App from './App.svelte'
import "./styles.css"

const app = new App({
  target: document.getElementById('app'),
})

export default app`},"/index.html":{code:`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite App</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"><\/script>
  </body>
</html>
`},"/vite-env.d.ts":{code:`/// <reference types="svelte" />
/// <reference types="vite/client" />`},"svelte.config.js":{code:`import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

export default {
  // Consult https://svelte.dev/docs#compile-time-svelte-preprocess
  // for more information about preprocessors
  preprocess: vitePreprocess(),
}
`},"/vite.config.ts":{code:`import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [svelte()],
})`},"tsconfig.json":{code:JSON.stringify({extends:"@tsconfig/svelte/tsconfig.json",compilerOptions:{target:"ESNext",useDefineForClassFields:!0,module:"ESNext",resolveJsonModule:!0,allowJs:!0,checkJs:!0,isolatedModules:!0},include:["src/**/*.d.ts","src/**/*.ts","src/**/*.js","src/**/*.svelte"],references:[{path:"./tsconfig.node.json"}]},null,2)},"tsconfig.node.json":{code:JSON.stringify({compilerOptions:{composite:!0,module:"ESNext",moduleResolution:"Node"},include:["vite.config.ts"]},null,2)},"/package.json":{code:JSON.stringify({type:"module",scripts:{dev:"vite"},devDependencies:{"@sveltejs/vite-plugin-svelte":"^2.0.2","@tsconfig/svelte":"^3.0.0",svelte:"^3.55.1","svelte-check":"^2.10.3",tslib:"^2.5.0",vite:"4.1.4","esbuild-wasm":"^0.17.12"}},null,2)}},main:"/src/App.svelte",environment:"node"},Ai={files:{"/src/styles.css":ue["/styles.css"],"/src/App.vue":{code:`<script setup>
import { ref } from "vue";

const data = ref("world");
<\/script>

<template>
  <h1>Hello {{ data }}</h1>
</template>

<style>
h1 {
  font-size: 1.5rem;
}
</style>`},"/src/main.js":{code:`import { createApp } from 'vue'
import App from './App.vue'
import "./styles.css"
            
createApp(App).mount('#app')            
`},"/index.html":{code:`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite App</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"><\/script>
  </body>
</html>
`},"/vite.config.js":{code:`import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()]
})
`},"/package.json":{code:JSON.stringify({scripts:{dev:"vite",build:"vite build",preview:"vite preview"},dependencies:{vue:"^3.2.45"},devDependencies:{"@vitejs/plugin-vue":"3.2.0",vite:"4.1.4","esbuild-wasm":"0.17.12"}})}},main:"/src/App.vue",environment:"node"},Mi={files:{"/src/styles.css":ue["/styles.css"],"/src/App.vue":{code:`<script setup lang="ts">
import { ref } from "vue";

const data = ref<string>("world");
<\/script>

<template>
  <h1>Hello {{ data }}</h1>
</template>

<style>
h1 {
  font-size: 1.5rem;
}
</style>`},"/src/main.ts":{code:`import { createApp } from 'vue'
import App from './App.vue'
import "./styles.css"

createApp(App).mount('#app')
`},"/index.html":{code:`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite App</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"><\/script>
  </body>
</html>
`},"/vite-env.d.ts":{code:'/// <reference types="vite/client" />'},"/vite.config.ts":{code:`import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()]
})
`},"tsconfig.json":{code:JSON.stringify({compilerOptions:{target:"ESNext",useDefineForClassFields:!0,module:"ESNext",moduleResolution:"Node",strict:!0,jsx:"preserve",resolveJsonModule:!0,isolatedModules:!0,esModuleInterop:!0,lib:["ESNext","DOM"],skipLibCheck:!0,noEmit:!0},include:["src/**/*.ts","src/**/*.d.ts","src/**/*.tsx","src/**/*.vue"],references:[{path:"./tsconfig.node.json"}]},null,2)},"tsconfig.node.json":{code:JSON.stringify({compilerOptions:{composite:!0,module:"ESNext",moduleResolution:"Node",allowSyntheticDefaultImports:!0},include:["vite.config.ts"]},null,2)},"/package.json":{code:JSON.stringify({scripts:{dev:"vite",build:"tsc && vite build",preview:"vite preview"},dependencies:{vue:"^3.2.47"},devDependencies:{"@vitejs/plugin-vue":"^4.0.0",vite:"4.1.4","vue-tsc":"^1.2.0",typescript:"^4.9.5","esbuild-wasm":"^0.17.12"}},null,2)}},main:"/src/App.vue",environment:"node"},Li={files:{"/src/app/app.component.css":ue["/styles.css"],"/src/app/app.component.html":{code:`<div>
<h1>{{ helloWorld }}</h1>
</div>     
`},"/src/app/app.component.ts":{code:`import { Component } from "@angular/core";

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.css"]
})
export class AppComponent {
  helloWorld = "Hello world";
}           
`},"/src/app/app.module.ts":{code:`import { BrowserModule } from "@angular/platform-browser";
import { NgModule } from "@angular/core";
      
import { AppComponent } from "./app.component";
      
@NgModule({
  declarations: [AppComponent],
  imports: [BrowserModule],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule {}       
`},"/src/index.html":{code:`<!doctype html>
<html lang="en">
      
<head>
  <meta charset="utf-8">
  <title>Angular</title>
  <base href="/">
      
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" type="image/x-icon" href="favicon.ico">
</head>
      
<body>
   <app-root></app-root>
</body>
      
</html>
`},"/src/main.ts":{code:`import { enableProdMode } from "@angular/core";
import { platformBrowserDynamic } from "@angular/platform-browser-dynamic";
      
import { AppModule } from "./app/app.module";      

platformBrowserDynamic()
  .bootstrapModule(AppModule)
  .catch(err => console.log(err));
      
`},"/src/polyfills.ts":{code:`import "core-js/proposals/reflect-metadata";   
      import "zone.js/dist/zone";
`},"/package.json":{code:JSON.stringify({dependencies:{"@angular/core":"^11.2.0","@angular/platform-browser":"^11.2.0","@angular/platform-browser-dynamic":"^11.2.0","@angular/common":"^11.2.0","@angular/compiler":"^11.2.0","zone.js":"0.11.3","core-js":"3.8.3",rxjs:"6.6.3"},main:"/src/main.ts"})}},main:"/src/app/app.component.ts",environment:"angular-cli"},Ri={files:y(y({},ue),{"/App.js":{code:`export default function App() {
  return <h1>Hello world</h1>
}
`},"/index.js":{code:`import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

import App from "./App";

const root = createRoot(document.getElementById("root"));
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);`},"/public/index.html":{code:`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`},"/package.json":{code:JSON.stringify({dependencies:{react:"^18.0.0","react-dom":"^18.0.0","react-scripts":"^5.0.0"},main:"/index.js"})}}),main:"/App.js",environment:"create-react-app"},Ii={files:y(y({},ue),{"tsconfig.json":{code:`{
  "include": [
    "./**/*"
  ],
  "compilerOptions": {
    "strict": true,
    "esModuleInterop": true,
    "lib": [ "dom", "es2015" ],
    "jsx": "react-jsx"
  }
}`},"/App.tsx":{code:`export default function App(): JSX.Element {
  return <h1>Hello world</h1>
}
`},"/index.tsx":{code:`import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

import App from "./App";

const root = createRoot(document.getElementById("root"));
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);`},"/public/index.html":{code:`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`},"/package.json":{code:JSON.stringify({dependencies:{react:"^18.0.0","react-dom":"^18.0.0","react-scripts":"^4.0.0"},devDependencies:{"@types/react":"^18.0.0","@types/react-dom":"^18.0.0",typescript:"^4.0.0"},main:"/index.tsx"})}}),main:"/App.tsx",environment:"create-react-app"},_i={files:y(y({},ue),{"/App.tsx":{code:`import { Component } from "solid-js";

const App: Component = () => {
  return <h1>Hello world</h1>
};

export default App;`},"/index.tsx":{code:`import { render } from "solid-js/web";
import App from "./App";

import "./styles.css";

render(() => <App />, document.getElementById("app"));`},"/index.html":{code:`<html>
<head>
  <title>Parcel Sandbox</title>
  <meta charset="UTF-8" />
</head>
<body>
  <div id="app"></div>
  <script src="src/index.tsx"><\/script>
</body>
</html>`},"/package.json":{code:JSON.stringify({dependencies:{"solid-js":"1.3.15"},main:"/index.tsx"})}}),main:"/App.tsx",environment:"solid"},Di={files:y(y({},ue),{"/App.svelte":{code:`<style>
  h1 {
    font-size: 1.5rem;
  }
</style>

<script>
  let name = 'world';
<\/script>

<main>
  <h1>Hello {name}</h1>
</main>`},"/index.js":{code:`import App from "./App.svelte";
import "./styles.css";

const app = new App({
  target: document.body
});

export default app;
      `},"/public/index.html":{code:`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf8" />
    <meta name="viewport" content="width=device-width" />

    <title>Svelte app</title>

    <link rel="stylesheet" href="public/bundle.css" />
  </head>

  <body>
    <script src="bundle.js"><\/script>
  </body>
</html>`},"/package.json":{code:JSON.stringify({dependencies:{svelte:"^3.0.0"},main:"/index.js"})}}),main:"/App.svelte",environment:"svelte"},Fi={files:{"tsconfig.json":{code:`{
  "include": [
    "./**/*"
  ],
  "compilerOptions": {
    "strict": true,
    "esModuleInterop": true,
    "lib": [ "dom", "es2015" ],
    "jsx": "react-jsx"
  }
}`},"/add.ts":{code:"export const add = (a: number, b: number): number => a + b;"},"/add.test.ts":{code:`import { add } from './add';

describe('add', () => {
  test('Commutative Law of Addition', () => {
    expect(add(1, 2)).toBe(add(2, 1));
  });
});`},"package.json":{code:JSON.stringify({dependencies:{},devDependencies:{typescript:"^4.0.0"},main:"/add.ts"})}},main:"/add.test.ts",environment:"parcel",mode:"tests"},Pi={files:y(y({},ue),{"/index.js":{code:`import "./styles.css";

document.getElementById("app").innerHTML = \`
<h1>Hello world</h1>
\`;
`},"/index.html":{code:`<!DOCTYPE html>
<html>

<head>
  <title>Parcel Sandbox</title>
  <meta charset="UTF-8" />
</head>

<body>
  <div id="app"></div>

  <script src="index.js">
  <\/script>
</body>

</html>`},"/package.json":{code:JSON.stringify({dependencies:{},main:"/index.js"})}}),main:"/index.js",environment:"parcel"},Bi={files:y(y({},ue),{"tsconfig.json":{code:`{
  "compilerOptions": {
    "strict": true,
    "module": "commonjs",
    "jsx": "preserve",
    "esModuleInterop": true,
    "sourceMap": true,
    "allowJs": true,
    "lib": [
      "es6",
      "dom"
    ],
    "rootDir": "src",
    "moduleResolution": "node"
  }
}`},"/index.ts":{code:`import "./styles.css";

document.getElementById("app").innerHTML = \`
<h1>Hello world</h1>
\`;
`},"/index.html":{code:`<!DOCTYPE html>
<html>

<head>
  <title>Parcel Sandbox</title>
  <meta charset="UTF-8" />
</head>

<body>
  <div id="app"></div>

  <script src="index.ts">
  <\/script>
</body>

</html>`},"/package.json":{code:JSON.stringify({dependencies:{},devDependencies:{typescript:"^4.0.0"},main:"/index.ts"})}}),main:"/index.ts",environment:"parcel"},Hi={files:{"/src/styles.css":ue["/styles.css"],"/src/App.vue":{code:`<template>
  <h1>Hello {{ msg }}</h1>
</template>

<script setup>
import { ref } from 'vue';
const msg = ref('world');
<\/script>`},"/src/main.js":{code:`import { createApp } from 'vue'
import App from './App.vue'
import "./styles.css";

createApp(App).mount('#app')
`},"/public/index.html":{code:`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width,initial-scale=1.0" />
    <title>codesandbox</title>
  </head>
  <body>
    <noscript>
      <strong
        >We're sorry but codesandbox doesn't work properly without JavaScript
        enabled. Please enable it to continue.</strong
      >
    </noscript>
    <div id="app"></div>
    <!-- built files will be auto injected -->
  </body>
</html>
`},"/package.json":{code:JSON.stringify({name:"vue3",version:"0.1.0",private:!0,main:"/src/main.js",scripts:{serve:"vue-cli-service serve",build:"vue-cli-service build"},dependencies:{"core-js":"^3.26.1",vue:"^3.2.45"},devDependencies:{"@vue/cli-plugin-babel":"^5.0.8","@vue/cli-service":"^5.0.8"}})}},main:"/src/App.vue",environment:"vue-cli"},Ui={files:{"/src/styles.css":ue["/styles.css"],"/src/App.vue":{code:`<template>
  <h1>Hello {{ msg }}</h1>
</template>

<script setup lang="ts">
import { ref } from 'vue';
const msg = ref<string>('world');
<\/script>`},"/src/main.ts":{code:`import { createApp } from 'vue'
import App from './App.vue'
import "./styles.css";

createApp(App).mount('#app')
`},"/src/shims-vue.d.ts":`/* eslint-disable */
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}`,"/public/index.html":{code:`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width,initial-scale=1.0" />
    <title>codesandbox</title>
  </head>
  <body>
    <noscript>
      <strong
        >We're sorry but codesandbox doesn't work properly without JavaScript
        enabled. Please enable it to continue.</strong
      >
    </noscript>
    <div id="app"></div>
    <!-- built files will be auto injected -->
  </body>
</html>
`},"/package.json":{code:JSON.stringify({name:"vue3-ts",version:"0.1.0",private:!0,main:"/src/main.ts",scripts:{serve:"vue-cli-service serve",build:"vue-cli-service build"},dependencies:{"core-js":"^3.26.1",vue:"^3.2.45"},devDependencies:{"@vue/cli-plugin-babel":"^5.0.8","@vue/cli-plugin-typescript":"^5.0.8","@vue/cli-service":"^5.0.8",typescript:"^4.9.3"}})},"/tsconfig.json":{code:JSON.stringify({compilerOptions:{target:"esnext",module:"esnext",strict:!0,jsx:"preserve",moduleResolution:"node",experimentalDecorators:!0,skipLibCheck:!0,esModuleInterop:!0,allowSyntheticDefaultImports:!0,forceConsistentCasingInFileNames:!0,useDefineForClassFields:!0,sourceMap:!1,baseUrl:".",types:["webpack-env"],paths:{"@/*":["src/*"]},lib:["esnext","dom","dom.iterable","scripthost"]},include:["src/**/*.ts","src/**/*.tsx","src/**/*.vue","tests/**/*.ts","tests/**/*.tsx"],exclude:["node_modules"]})}},main:"/src/App.vue",environment:"vue-cli"},zi={files:y(y({},ue),{"/index.html":{code:`<!DOCTYPE html>
<html>

<head>
  <title>Parcel Sandbox</title>
  <meta charset="UTF-8" />
  <link rel="stylesheet" href="/styles.css" />
</head>

<body>
  <h1>Hello world</h1>
</body>

</html>`},"/package.json":{code:JSON.stringify({dependencies:{},main:"/index.html"})}}),main:"/index.html",environment:"static"},Fn={static:zi,angular:Li,react:Ri,"react-ts":Ii,solid:_i,svelte:Di,"test-ts":Fi,"vanilla-ts":Bi,vanilla:Pi,vue:Hi,"vue-ts":Ui,node:Ci,nextjs:Si,vite:ji,"vite-react":Ni,"vite-react-ts":$i,"vite-preact":Ei,"vite-preact-ts":ki,"vite-vue":Ai,"vite-vue-ts":Mi,"vite-svelte":Ti,"vite-svelte-ts":Oi,astro:wi},on=function(e){var t,n,o,i,r,a,u=Me(e.files),l=Vi({template:e.template,customSetup:e.customSetup,files:u}),s=Me((n=(t=e.options)===null||t===void 0?void 0:t.visibleFiles)!==null&&n!==void 0?n:[]),d=!((o=e.options)===null||o===void 0)&&o.activeFile?Pn((i=e.options)===null||i===void 0?void 0:i.activeFile,l.files):void 0;s.length===0&&u&&Object.keys(u).forEach(function(m){var g=u[m];if(typeof g=="string"){s.push(m);return}!d&&g.active&&(d=m,g.hidden===!0&&s.push(m)),g.hidden||s.push(m)}),s.length===0&&(s=[l.main]),l.entry&&!l.files[l.entry]&&(l.entry=Pn(l.entry,l.files)),!d&&l.main&&(d=l.main),(!d||!l.files[d])&&(d=s[0]),s.includes(d)||s.push(d);var f=wn(l.files,(r=l.dependencies)!==null&&r!==void 0?r:{},(a=l.devDependencies)!==null&&a!==void 0?a:{},l.entry),v=s.filter(function(m){return f[m]});return{visibleFiles:v,activeFile:d,files:f,environment:l.environment,shouldUpdatePreview:!0}},Pn=function(e,t){var n=Me(t),o=Me(e);if(o in n)return o;if(!e)return null;for(var i=null,r=0,a=[".js",".jsx",".ts",".tsx"];!i&&r<a.length;){var u=o.split(".")[0],l="".concat(u).concat(a[r]);n[l]!==void 0&&(i=l),r++}return i},Vi=function(e){var t=e.files,n=e.template,o=e.customSetup;if(!n){if(!o){var i=Fn.vanilla;return y(y({},i),{files:y(y({},i.files),St(t))})}if(!t||Object.keys(t).length===0)throw new Error("[sandpack-react]: without a template, you must pass at least one file");return y(y({},o),{files:St(t)})}var r=Fn[n];if(!r)throw new Error('[sandpack-react]: invalid template "'.concat(n,'" provided'));return!o&&!t?r:{files:St(y(y({},r.files),t)),dependencies:y(y({},r.dependencies),o==null?void 0:o.dependencies),devDependencies:y(y({},r.devDependencies),o==null?void 0:o.devDependencies),entry:Me(o==null?void 0:o.entry),main:r.main,environment:(o==null?void 0:o.environment)||r.environment}},St=function(e){return e?Object.keys(e).reduce(function(t,n){return typeof e[n]=="string"?t[n]={code:e[n]}:t[n]=e[n],t},{}):{}},Ji=function(e,t){var n=p.useState({editorState:"pristine"}),o=n[0],i=n[1],r=on(e),a=Lt(r.files,t)?"pristine":"dirty";return a!==o.editorState&&i(function(u){return y(y({},u),{editorState:a})}),o},Qr=function(){return typeof p.useId=="function"?p.useId():nt()},Bn=9,Wi="2.19.8",Yi=function(e){if(typeof p.useId=="function"){var t=p.useId();return function(){return Be(void 0,void 0,void 0,function(){var n,o;return He(this,function(i){switch(i.label){case 0:return n=Object.entries(e).map(function(r,a){return r+"|"+a}).join("|||"),[4,Zi(n+t+Wi)];case 1:return o=i.sent(),[2,Hn(o.replace(/:/g,"sp").replace(/[^a-zA-Z]/g,""),Bn)]}})})}}else return function(){return Hn(nt(),Bn)}};function Hn(e,t){return e.length>t?e.slice(0,t):e.padEnd(t,"s")}function Zi(e){return Be(this,void 0,void 0,function(){var t,n,o,i;return He(this,function(r){switch(r.label){case 0:return t=new TextEncoder,n=t.encode(e),[4,crypto.subtle.digest("SHA-256",n)];case 1:return o=r.sent(),i=Array.from(new Uint8Array(o)),[2,btoa(String.fromCharCode.apply(String,i))]}})})}var qi=4e4,Gi=function(e,t){var n,o,i,r=e.options,a=e.customSetup,u=e.teamId,l=e.sandboxId;r??(r={}),a??(a={});var s=(r==null?void 0:r.initMode)||"lazy",d=p.useState({startRoute:r==null?void 0:r.startRoute,bundlerState:void 0,error:null,initMode:s,reactDevTools:void 0,status:!((n=r==null?void 0:r.autorun)!==null&&n!==void 0)||n?"initial":"idle"}),f=d[0],v=d[1],m=p.useRef(),g=p.useRef(null),h=p.useRef(null),S=p.useRef({}),w=p.useRef({}),E=p.useRef(null),j=p.useRef({}),O=p.useRef(),k=p.useRef({global:{}}),M=p.useRef(),R=p.useRef(t.environment),V=Yi(t.files),P=p.useCallback(function(C,b,A){return Be(void 0,void 0,void 0,function(){var T,ee,G,F,te,W,me,xe,Te,Oe,Ae;return He(this,function(je){switch(je.label){case 0:return w.current[b]&&w.current[b].destroy(),r??(r={}),a??(a={}),T=(Te=r==null?void 0:r.bundlerTimeOut)!==null&&Te!==void 0?Te:qi,E.current&&clearTimeout(E.current),ee=typeof O.current!="function",ee&&(E.current=setTimeout(function(){H(),v(function(X){return y(y({},X),{status:"timeout"})})},T)),G=function(){return Be(void 0,void 0,void 0,function(){var X,oe;return He(this,function(ie){switch(ie.label){case 0:return r!=null&&r.experimental_enableStableServiceWorkerId?(X="SANDPACK_INTERNAL:URL-CONSISTENT-ID",oe=localStorage.getItem(X),oe?[3,2]:[4,V()]):[3,3];case 1:oe=ie.sent(),localStorage.setItem(X,oe),ie.label=2;case 2:return[2,oe];case 3:return[4,V()];case 4:return[2,ie.sent()]}})})},te=qr,W=[C,{files:t.files,template:t.environment}],xe={externalResources:r.externalResources,bundlerURL:r.bundlerURL,startRoute:(Oe=A==null?void 0:A.startRoute)!==null&&Oe!==void 0?Oe:r.startRoute,fileResolver:r.fileResolver,skipEval:(Ae=r.skipEval)!==null&&Ae!==void 0?Ae:!1,logLevel:r.logLevel,showOpenInCodeSandbox:!1,showErrorScreen:!0,showLoadingScreen:!1,reactDevTools:f.reactDevTools,customNpmRegistries:a==null?void 0:a.npmRegistries,teamId:u,experimental_enableServiceWorker:!!(r!=null&&r.experimental_enableServiceWorker)},[4,G()];case 1:return[4,te.apply(void 0,W.concat([(xe.experimental_stableServiceWorkerId=je.sent(),xe.sandboxId=l,xe)]))];case 2:return F=je.sent(),typeof O.current!="function"&&(O.current=F.listen(q)),j.current[b]=j.current[b]||{},k.current[b]&&(Object.keys(k.current[b]).forEach(function(X){var oe=k.current[b][X],ie=F.listen(oe);j.current[b][X]=ie}),k.current[b]={}),me=Object.entries(k.current.global),me.forEach(function(X){var oe=X[0],ie=X[1],I=F.listen(ie);j.current[b][oe]=I}),w.current[b]=F,[2]}})})},[t.environment,t.files,f.reactDevTools]),H=p.useCallback(function(){Object.keys(w.current).map($),typeof O.current=="function"&&(O.current(),O.current=void 0)},[]),Y=p.useCallback(function(){return Be(void 0,void 0,void 0,function(){return He(this,function(C){switch(C.label){case 0:return[4,Promise.all(Object.entries(S.current).map(function(b){var A=b[0],T=b[1],ee=T.iframe,G=T.clientPropsOverride,F=G===void 0?{}:G;return Be(void 0,void 0,void 0,function(){return He(this,function(te){switch(te.label){case 0:return[4,P(ee,A,F)];case 1:return te.sent(),[2]}})})}))];case 1:return C.sent(),v(function(b){return y(y({},b),{error:null,status:"running"})}),[2]}})})},[P]);m.current=function(C){C.some(function(b){return b.isIntersecting})?Y():H()};var J=p.useCallback(function(){var C,b,A,T=(C=r==null?void 0:r.autorun)!==null&&C!==void 0?C:!0;if(T){var ee=(b=r==null?void 0:r.initModeObserverOptions)!==null&&b!==void 0?b:{rootMargin:"1000px 0px"};g.current&&h.current&&((A=g.current)===null||A===void 0||A.unobserve(h.current)),h.current&&f.initMode==="lazy"?(g.current=new IntersectionObserver(function(G){var F,te;G.some(function(W){return W.isIntersecting})&&G.some(function(W){return W.isIntersecting})&&h.current&&((F=m.current)===null||F===void 0||F.call(m,G),(te=g.current)===null||te===void 0||te.unobserve(h.current))},ee),g.current.observe(h.current)):h.current&&f.initMode==="user-visible"?(g.current=new IntersectionObserver(function(G){var F;(F=m.current)===null||F===void 0||F.call(m,G)},ee),g.current.observe(h.current)):Y()}},[r==null?void 0:r.autorun,r==null?void 0:r.initModeObserverOptions,Y,f.initMode,H]),K=p.useCallback(function(C,b,A){return Be(void 0,void 0,void 0,function(){return He(this,function(T){switch(T.label){case 0:return S.current[b]={iframe:C,clientPropsOverride:A},f.status!=="running"?[3,2]:[4,P(C,b,A)];case 1:T.sent(),T.label=2;case 2:return[2]}})})},[P,f.status]),$=function(C){var b,A,T=w.current[C];T?(T.destroy(),(b=T.iframe.contentWindow)===null||b===void 0||b.location.replace("about:blank"),T.iframe.removeAttribute("src"),delete w.current[C]):delete S.current[C],E.current&&clearTimeout(E.current);var ee=Object.values((A=j.current[C])!==null&&A!==void 0?A:{});ee.forEach(function(F){var te=Object.values(F);te.forEach(function(W){return W()})});var G=Object.keys(w.current).length>0?"running":"idle";v(function(F){return y(y({},F),{status:G})})},q=function(C){C.type==="start"?v(function(b){return y(y({},b),{error:null})}):C.type==="state"?v(function(b){return y(y({},b),{bundlerState:C.state})}):C.type==="done"&&!C.compilatonError||C.type==="connected"?(E.current&&clearTimeout(E.current),v(function(b){return y(y({},b),{error:null})})):C.type==="action"&&C.action==="show-error"?(E.current&&clearTimeout(E.current),v(function(b){return y(y({},b),{error:Sn(C)})})):C.type==="action"&&C.action==="notification"&&C.notificationType==="error"&&v(function(b){return y(y({},b),{error:{message:C.title}})})},Z=function(C){v(function(b){return y(y({},b),{reactDevTools:C})})},Q=(o=r==null?void 0:r.recompileMode)!==null&&o!==void 0?o:"delayed",B=(i=r==null?void 0:r.recompileDelay)!==null&&i!==void 0?i:200,re=function(C,b){if(f.status!=="running"){console.warn("[sandpack-react]: dispatch cannot be called while in idle mode");return}b?w.current[b].dispatch(C):Object.values(w.current).forEach(function(A){A.dispatch(C)})},ve=function(C,b){if(b)if(w.current[b]){var A=w.current[b].listen(C);return A}else{var T=nt();k.current[b]=k.current[b]||{},j.current[b]=j.current[b]||{},k.current[b][T]=C;var A=function(){k.current[b][T]?delete k.current[b][T]:j.current[b][T]&&(j.current[b][T](),delete j.current[b][T])};return A}else{var ee=nt();k.current.global[ee]=C;var G=Object.values(w.current),F=G.map(function(W){return W.listen(C)}),A=function(){F.forEach(function(W){return W()}),delete k.current.global[ee],Object.values(j.current).forEach(function(W){var me;(me=W==null?void 0:W[ee])===null||me===void 0||me.call(W)})};return A}};return p.useEffect(function(){if(!(f.status!=="running"||!t.shouldUpdatePreview)){if(R.current!==t.environment&&(R.current=t.environment,Object.entries(w.current).forEach(function(b){var A=b[0],T=b[1];K(T.iframe,A)})),Q==="immediate"&&Object.values(w.current).forEach(function(b){b.status==="done"&&b.updateSandbox({files:t.files,template:t.environment})}),Q==="delayed"){if(typeof window>"u")return;window.clearTimeout(M.current),M.current=window.setTimeout(function(){Object.values(w.current).forEach(function(b){b.status==="done"&&b.updateSandbox({files:t.files,template:t.environment})})},B)}return function(){window.clearTimeout(M.current)}}},[t.files,t.environment,t.shouldUpdatePreview,B,Q,K,f.status]),p.useEffect(function(){s!==f.initMode&&(v(function(b){return y(y({},b),{initMode:s})}),J())},[s,J,f.initMode]),p.useEffect(function(){return function(){typeof O.current=="function"&&O.current(),E.current&&clearTimeout(E.current),M.current&&clearTimeout(M.current),g.current&&g.current.disconnect()}},[]),[f,{clients:w.current,initializeSandpackIframe:J,runSandpack:Y,registerBundler:K,unregisterBundler:$,registerReactDevTools:Z,addListener:ve,dispatchMessage:re,lazyAnchorRef:h,unsubscribeClientListenersRef:j,queuedListenersRef:k}]},Ki=function(e){var t=on(e),n=p.useState(t),o=n[0],i=n[1],r=p.useRef(!1);p.useEffect(function(){r.current?i(on(e)):r.current=!0},[e.files,e.customSetup,e.template]);var a=function(l,s,d){d===void 0&&(d=!0),i(function(f){var v,m=f.files;return typeof l=="string"&&typeof s=="string"?m=y(y({},m),(v={},v[l]=y(y({},m[l]),{code:s}),v)):typeof l=="object"&&(m=y(y({},m),St(l))),y(y({},f),{files:Me(m),shouldUpdatePreview:d})})},u={openFile:function(l){i(function(s){var d=s.visibleFiles,f=fe(s,["visibleFiles"]),v=d.includes(l)?d:we(we([],d,!0),[l],!1);return y(y({},f),{activeFile:l,visibleFiles:v})})},resetFile:function(l){i(function(s){var d;return y(y({},s),{files:y(y({},s.files),(d={},d[l]=t.files[l],d))})})},resetAllFiles:function(){i(function(l){return y(y({},l),{files:t.files})})},setActiveFile:function(l){o.files[l]&&i(function(s){return y(y({},s),{activeFile:l})})},updateCurrentFile:function(l,s){s===void 0&&(s=!0),a(o.activeFile,l,s)},updateFile:a,addFile:a,closeFile:function(l){o.visibleFiles.length!==1&&i(function(s){var d=s.visibleFiles,f=s.activeFile,v=fe(s,["visibleFiles","activeFile"]),m=d.indexOf(l),g=d.filter(function(h){return h!==l});return y(y({},v),{activeFile:l===f?m===0?d[1]:d[m-1]:f,visibleFiles:g})})},deleteFile:function(l,s){s===void 0&&(s=!0),i(function(d){var f=d.visibleFiles,v=d.files,m=d.activeFile,g=fe(d,["visibleFiles","files","activeFile"]),h=y({},v);delete h[l];var S=f.filter(function(j){return j!==l}),w=S.length===0;if(w){var E=Object.keys(v)[Object.keys(v).length-1];return y(y({},g),{visibleFiles:[E],activeFile:E,files:h,shouldUpdatePreview:s})}return y(y({},g),{visibleFiles:S,activeFile:l===m?S[S.length-1]:m,files:h,shouldUpdatePreview:s})})}};return[y(y({},o),{visibleFilesFromProps:t.visibleFiles}),u]},jn=p.createContext(null),au=function(e){var t,n,o,i=e.children,r=e.options,a=e.style,u=e.className,l=e.theme,s=Ki(e),d=s[0],f=s[1],v=Gi(e,d),m=v[0],g=v[1],h=g.dispatchMessage,S=g.addListener,w=fe(g,["dispatchMessage","addListener"]),E=Ji(e,d.files);return p.useEffect(function(){w.initializeSandpackIframe()},[]),c.jsx(jn.Provider,{value:y(y(y(y(y(y({},d),m),E),f),w),{autoReload:(n=(t=e.options)===null||t===void 0?void 0:t.autoReload)!==null&&n!==void 0?n:!0,teamId:e==null?void 0:e.teamId,exportOptions:(o=e==null?void 0:e.customSetup)===null||o===void 0?void 0:o.exportOptions,listen:S,dispatch:h}),children:c.jsx(gi,{classes:r==null?void 0:r.classes,children:c.jsx(xi,{className:u,style:a,theme:l,children:i})})})};jn.Consumer;function ce(){var e=p.useContext(jn);if(e===null)throw new Error('[sandpack-react]: "useSandpack" must be wrapped by a "SandpackProvider"');var t=e.dispatch,n=e.listen,o=fe(e,["dispatch","listen"]);return{sandpack:y({},o),dispatch:t,listen:n}}var eo=function(){var e,t,n,o=ce().sandpack;return{code:(e=o.files[o.activeFile])===null||e===void 0?void 0:e.code,readOnly:(n=(t=o.files[o.activeFile])===null||t===void 0?void 0:t.readOnly)!==null&&n!==void 0?n:!1,updateCode:o.updateCurrentFile}},it,ht,Ut,Fe=N({svg:{margin:"auto"}}),Ne=N((it={appearance:"none",outline:"none",display:"flex",alignItems:"center",fontSize:"inherit",fontFamily:"inherit",backgroundColor:"transparent",transition:"color $default, background $default",cursor:"pointer",color:"$colors$clickable",border:0,textDecoration:"none","&:disabled":{color:"$colors$disabled"},"&:hover:not(:disabled,[data-active='true'])":{color:"$colors$hover"},'&[data-active="true"]':{color:"$colors$accent"},svg:{minWidth:"$space$4",width:"$space$4",height:"$space$4"}},it["&.".concat(Fe)]={padding:"$space$1",height:"$space$7",display:"flex"},it["&.".concat(Fe,"&:not(:has(span))")]={width:"$space$7"},it["&.".concat(Fe,"&:has(svg + span)")]={paddingRight:"$space$3",paddingLeft:"$space$2",gap:"$space$1"},it)),Ke=N({backgroundColor:"$colors$surface2",borderRadius:"99999px",border:"1px solid $colors$surface3",'&[data-active="true"]':{color:"$colors$surface1",background:"$colors$accent"},"&:hover:not(:disabled,[data-active='true'])":{backgroundColor:"$colors$surface3"}}),Xi=N({padding:0}),En=Kr({"0%":{opacity:0},"100%":{opacity:1}}),at=N({position:"absolute",bottom:"0",left:"0",right:"0",top:"0",margin:"0",overflow:"auto",height:"100%",zIndex:"$top"}),to=N((ht={whiteSpace:"pre-wrap",padding:"$space$10",backgroundColor:"$colors$surface1",display:"flex",gap:"$space$2",flexDirection:"column"},ht[".".concat(Ne)]={width:"auto",gap:"$space$2",padding:"0 $space$3 0 $space$2",marginTop:"$space$1"},ht.variants={solidBg:{true:{backgroundColor:"$colors$errorSurface"}}},ht)),an=N((Ut={padding:"$space$10",backgroundColor:"$colors$surface1"},Ut[".".concat(Ne)]={marginTop:"$space$6",width:"auto",gap:"$space$2",padding:"0 $space$3 0 $space$2"},Ut)),Ue=N({animation:"".concat(En," 150ms ease"),color:"$colors$error",display:"flex",flexDirection:"column",gap:"$space$3",variants:{errorCode:{true:{fontFamily:"$font$mono"}}},a:{color:"inherit"},p:{margin:0}}),zt,Qi=N({borderBottom:"1px solid $colors$surface2",background:"$colors$surface1"}),ea=N({padding:"0 $space$2",overflow:"auto",display:"flex",flexWrap:"nowrap",alignItems:"stretch",minHeight:"40px",marginBottom:"-1px"}),ta=N({display:"flex",alignItems:"center",outline:"none",position:"relative",paddingRight:"20px",margin:"1px 0","&:has(button:focus)":{outline:"$colors$accent auto 1px"}}),no=N({padding:"0 $space$1 0 $space$1",borderRadius:"$border$radius",marginLeft:"$space$1",width:"$space$5",visibility:"hidden",cursor:"pointer",position:"absolute",right:"0px",svg:{width:"$space$3",height:"$space$3",display:"block",position:"relative",top:1}}),na=N((zt={padding:"0 $space$2",height:"$layout$headerHeight",whiteSpace:"nowrap","&:focus":{outline:"none"}},zt["&:hover ~ .".concat(no)]={visibility:"visible"},zt)),ro=function(e){var t=e.closableTabs,n=e.className,o=e.activeFileUniqueId,i=fe(e,["closableTabs","className","activeFileUniqueId"]),r=ce().sandpack,a=be(),u=r.activeFile,l=r.visibleFiles,s=r.setActiveFile,d=p.useState(null),f=d[0],v=d[1],m=function(h){var S=Ot(h),w=l.reduce(function(E,j){if(j===h)return E;var O=Ot(j);return O===S&&E.push(j),E},[]);return w.length===0?S:ui(h,w)},g=function(h){var S,w,E,j,O=h.e,k=h.index,M=O.currentTarget;switch(O.key){case"ArrowLeft":{var R=M.previousElementSibling;R&&((S=R.querySelector("button"))===null||S===void 0||S.focus(),s(l[k-1]))}break;case"ArrowRight":{var V=M.nextElementSibling;V&&((w=V.querySelector("button"))===null||w===void 0||w.focus(),s(l[k+1]))}break;case"Home":{var P=M.parentElement,H=P.firstElementChild;(E=H.querySelector("button"))===null||E===void 0||E.focus(),s(l[0]);break}case"End":{var Y=M.parentElement,J=Y.lastElementChild;(j=J.querySelector("button"))===null||j===void 0||j.focus(),s(l[-1]);break}}};return c.jsx("div",y({className:a("tabs",[Qi,n]),translate:"no"},i,{children:c.jsx("div",{"aria-label":"Select active file",className:a("tabs-scrollable-container",[ea]),role:"tablist",children:l.map(function(h,S){return c.jsxs("div",{"aria-controls":"".concat(h,"-").concat(o,"-tab-panel"),"aria-selected":h===u,className:a("tab-container",[ta]),onKeyDown:function(w){return g({e:w,index:S})},onMouseEnter:function(){return v(S)},onMouseLeave:function(){return v(null)},role:"tab",children:[c.jsx("button",{className:a("tab-button",[Ne,na]),"data-active":h===u,id:"".concat(h,"-").concat(o,"-tab"),onClick:function(){return s(h)},tabIndex:h===u?0:-1,title:h,type:"button",children:m(h)}),t&&l.length>1&&c.jsx("span",{className:a("close-button",[no]),onClick:function(w){w.stopPropagation(),r.closeFile(h)},style:{visibility:h===u||f===S?"visible":"hidden"},tabIndex:h===u?0:-1,children:c.jsx(si,{})})]},h)})})}))},dt=function(e){var t=e.onClick,n=e.className,o=e.children,i=be();return c.jsx("button",{className:i("button",[i("icon-standalone"),Ne,Fe,Ke,n]),onClick:t,type:"button",children:o})},ra=N({position:"absolute",bottom:"$space$2",right:"$space$2",paddingRight:"$space$3"}),oo=function(e){e.className;var t=e.onClick,n=fe(e,["className","onClick"]),o=ce().sandpack;return c.jsxs(dt,y({className:ra.toString(),onClick:function(i){o.runSandpack(),t==null||t(i)}},n,{children:[c.jsx(ni,{}),c.jsx("span",{children:"Run"})]}))},Vt,io=N((Vt={display:"flex",flexDirection:"column",width:"100%",position:"relative",backgroundColor:"$colors$surface1",gap:1},Vt["&:has(.".concat(ne,"-stack)")]={backgroundColor:"$colors$surface2"},Vt)),_t=function(e){var t=e.className,n=fe(e,["className"]),o=be();return c.jsx("div",y({className:o("stack",[io,t])},n))},oa=function(){var e=p.useContext(Cn),t=e.theme,n=e.id,o=e.mode;return{theme:t,themeId:n,themeMode:o}},Un=function(e,t){if(e.length!==t.length)return!1;for(var n=!0,o=0;o<e.length;o++)if(e[o]!==t[o]){n=!1;break}return n},sn=function(e,t){var n=t.line,o=t.column;return e.line(n).from+(o??0)-1},ia=function(){return _e.theme({"&":{backgroundColor:"var(--".concat(ne,"-colors-surface1)"),color:"var(--".concat(ne,"-syntax-color-plain)"),height:"100%"},".cm-matchingBracket, .cm-nonmatchingBracket, &.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket":{color:"inherit",backgroundColor:"rgba(128,128,128,.25)",backgroundBlendMode:"difference"},"&.cm-editor.cm-focused":{outline:"none"},"& .cm-activeLine":{backgroundColor:"transparent"},"&.cm-editor.cm-focused .cm-activeLine":{backgroundColor:"var(--".concat(ne,"-colors-surface3)"),borderRadius:"var(--".concat(ne,"-border-radius)")},".cm-errorLine":{backgroundColor:"var(--".concat(ne,"-colors-errorSurface)"),borderRadius:"var(--".concat(ne,"-border-radius)")},".cm-content":{caretColor:"var(--".concat(ne,"-colors-accent)"),padding:"0 var(--".concat(ne,"-space-4)")},".cm-scroller":{fontFamily:"var(--".concat(ne,"-font-mono)"),lineHeight:"var(--".concat(ne,"-font-lineHeight)")},".cm-gutters":{backgroundColor:"var(--".concat(ne,"-colors-surface1)"),color:"var(--".concat(ne,"-colors-disabled)"),border:"none",paddingLeft:"var(--".concat(ne,"-space-1)")},".cm-gutter.cm-lineNumbers":{fontSize:".6em"},".cm-lineNumbers .cm-gutterElement":{lineHeight:"var(--".concat(ne,"-font-lineHeight)"),minWidth:"var(--".concat(ne,"-space-5)")},".cm-content .cm-line":{paddingLeft:"var(--".concat(ne,"-space-1)")},".cm-content.cm-readonly .cm-line":{paddingLeft:0}})},Ie=function(e){return"".concat(ne,"-syntax-").concat(e)},aa=function(){var e=["string","plain","comment","keyword","definition","punctuation","property","tag","static"];return e.reduce(function(t,n){var o;return y(y({},t),(o={},o[".".concat(Ie(n))]={color:"$syntax$color$".concat(n),fontStyle:"$syntax$fontStyle$".concat(n)},o))},{})},sa=function(e){return Vr.define([{tag:z.link,textDecoration:"underline"},{tag:z.emphasis,fontStyle:"italic"},{tag:z.strong,fontWeight:"bold"},{tag:z.keyword,class:Ie("keyword")},{tag:[z.atom,z.number,z.bool],class:Ie("static")},{tag:z.variableName,class:Ie("plain")},{tag:z.standard(z.tagName),class:Ie("tag")},{tag:[z.function(z.variableName),z.definition(z.function(z.variableName)),z.tagName],class:Ie("definition")},{tag:z.propertyName,class:Ie("property")},{tag:[z.literal,z.inserted],class:Ie(e.syntax.string?"string":"static")},{tag:z.punctuation,class:Ie("punctuation")},{tag:[z.comment,z.quote],class:Ie("comment")}])},ca=function(e,t,n){if(!e&&!t)return"javascript";var o=t;if(!o&&e){var i=e.lastIndexOf(".");o=e.slice(i+1)}for(var r=0,a=n;r<a.length;r++){var u=a[r];if(o===u.name||u.extensions.includes(o||""))return u.name}switch(o){case"ts":case"tsx":return"typescript";case"html":case"svelte":case"vue":case"astro":return"html";case"css":case"less":case"scss":return"css";case"js":case"jsx":case"json":default:return"javascript"}},la=function(e,t){for(var n={javascript:$t({jsx:!0,typescript:!1}),typescript:$t({jsx:!0,typescript:!0}),html:zr(),css:Ur()},o=0,i=t;o<i.length;o++){var r=i[o];if(e===r.name)return r.language}return n[e]},ao=function(){for(var e=[],t=0;t<arguments.length;t++)e[t]=arguments[t];return p.useCallback(function(n){return e.forEach(function(o){if(o){if(typeof o=="function")return o(n);o.current=n}})},e)};function ua(e){return Rt.fromClass(function(){function t(n){this.decorations=this.getDecoration(n)}return t.prototype.update=function(n){},t.prototype.getDecoration=function(n){if(!e)return Ce.none;var o=e.map(function(i){var r,a,u,l=Ce.line({attributes:{class:(r=i.className)!==null&&r!==void 0?r:""}}),s=Ce.mark({class:(a=i.className)!==null&&a!==void 0?a:"",attributes:(u=i.elementAttributes)!==null&&u!==void 0?u:void 0}),d=sn(n.state.doc,{line:i.line,column:i.startColumn})+1;if(i.startColumn&&i.endColumn){var f=sn(n.state.doc,{line:i.line,column:i.endColumn})+1;return s.range(d,f)}return l.range(d)});return Ce.set(o)},t}(),{decorations:function(t){return t.decorations}})}function da(){return pa}var fa=Ce.line({attributes:{class:"cm-errorLine"}}),pa=Rt.fromClass(function(){function e(){this.decorations=Ce.none}return e.prototype.update=function(t){var n=this;t.transactions.forEach(function(o){var i=o.annotation("show-error");if(i!==void 0){var r=sn(t.view.state.doc,{line:i})+1;n.decorations=Ce.set([fa.range(r)])}else o.annotation("remove-errors")&&(n.decorations=Ce.none)})},e}(),{decorations:function(e){return e.decorations}}),gt,Jt,cn=N({margin:"0",display:"block",fontFamily:"$font$mono",fontSize:"$font$size",color:"$syntax$color$plain",lineHeight:"$font$lineHeight"}),zn=N(aa()),so=N((gt={flex:1,position:"relative",overflow:"auto",background:"$colors$surface1",".cm-scroller":{padding:"$space$4 0"}},gt[".".concat(cn)]={padding:"$space$4 0"},gt["@media screen and (max-width: 768px)"]={"@supports (-webkit-overflow-scrolling: touch)":{".cm-content":{fontSize:"16px"}}},gt)),Vn=N({margin:"0",outline:"none",height:"100%"}),va=N((Jt={fontFamily:"$font$mono",fontSize:"0.8em",position:"absolute",right:"$space$2",bottom:"$space$2",zIndex:"$top",color:"$colors$clickable",backgroundColor:"$colors$surface2",borderRadius:"99999px",padding:"calc($space$1 / 2) $space$2"},Jt["& + .".concat(Ne)]={right:"calc($space$11 * 2)"},Jt)),ma=function(e){var t=e.langSupport,n=e.highlightTheme,o=e.code,i=o===void 0?"":o,r=t.language.parser.parse(i),a=0,u=[],l=function(s,d){if(s>a){var f=i.slice(a,s);u.push(d?p.createElement("span",{children:f,className:d,key:"".concat(s).concat(a)}):f),a=s}};return Jr(r,n,function(s,d,f){l(s,""),l(d,f)}),a<i.length&&(i!=null&&i.includes(`
`))&&u.push(`

`),u},kn=p.forwardRef(function(e,t){var n=e.code,o=n===void 0?"":n,i=e.filePath,r=e.fileType,a=e.onCodeUpdate,u=e.showLineNumbers,l=u===void 0?!1:u,s=e.showInlineErrors,d=s===void 0?!1:s,f=e.wrapContent,v=f===void 0?!1:f,m=e.editorState,g=m===void 0?"pristine":m,h=e.readOnly,S=h===void 0?!1:h,w=e.showReadOnly,E=w===void 0?!0:w,j=e.decorators,O=e.initMode,k=O===void 0?"lazy":O,M=e.extensions,R=M===void 0?[]:M,V=e.extensionsKeymap,P=V===void 0?[]:V,H=e.additionalLanguages,Y=H===void 0?[]:H,J=p.useRef(null),K=ao(J,t),$=p.useRef(),q=oa(),Z=q.theme,Q=q.themeId,B=p.useState(o),re=B[0],ve=B[1],C=p.useState(k==="immediate"),b=C[0],A=C[1],T=be(),ee=ce(),G=ee.listen,F=ee.sandpack.autoReload,te=p.useRef([]),W=p.useRef([]),me=Er(J,{rootMargin:"600px 0px",threshold:.2}).isIntersecting;p.useImperativeHandle(t,function(){return{getCodemirror:function(){return $.current}}}),p.useEffect(function(){var I=k==="lazy"||k==="user-visible";I&&me&&A(!0)},[k,me]);var xe=ca(i,r,Y),Te=la(xe,Y),Oe=sa(Z),Ae=ma({langSupport:Te,highlightTheme:Oe,code:o}),je=p.useMemo(function(){return j&&j.sort(function(I,U){return I.line-U.line})},[j]),X=S&&(j==null?void 0:j.length)===0;p.useEffect(function(){if(!(!J.current||!b||X)){var I=J.current,U=I.querySelector(".sp-pre-placeholder");U&&I.removeChild(U);var L=new _e({doc:o,extensions:[],parent:I});return L.contentDOM.setAttribute("data-gramm","false"),L.contentDOM.setAttribute("data-lt-active","false"),L.contentDOM.setAttribute("aria-label",i?"Code Editor for ".concat(Ot(i)):"Code Editor"),L.contentDOM.setAttribute("tabIndex","-1"),$.current=L,function(){var _;(_=$.current)===null||_===void 0||_.destroy()}}},[b,S,X]),p.useEffect(function(){if(!X&&$.current){var I=[{key:"Tab",run:function(L){var _,he;Wr(L);var ae=P.find(function(Ye){var Ze=Ye.key;return Ze==="Tab"});return(he=(_=ae==null?void 0:ae.run)===null||_===void 0?void 0:_.call(ae,L))!==null&&he!==void 0?he:!0}},{key:"Shift-Tab",run:function(L){var _,he;Yr({state:L.state,dispatch:L.dispatch});var ae=P.find(function(Ye){var Ze=Ye.key;return Ze==="Shift-Tab"});return(he=(_=ae==null?void 0:ae.run)===null||_===void 0?void 0:_.call(ae,L))!==null&&he!==void 0?he:!0}},{key:"Escape",run:function(){return S||J.current&&J.current.focus(),!0}},{key:"mod-Backspace",run:Lr}],U=we(we([Rr(),Ir(),_r()],R,!0),[kt.of(we(we(we(we(we([],Or,!0),Ar,!0),Mr,!0),I,!0),P,!0)),Te,ia(),Tr(Oe),_e.updateListener.of(function(L){if(L.docChanged){var _=L.state.doc.toString();ve(_),a==null||a(_)}})],!1);S?(U.push(Dr.readOnly.of(!0)),U.push(_e.editable.of(!1))):(U.push(Fr()),U.push(Pr())),je&&U.push(ua(je)),v&&U.push(_e.lineWrapping),l&&U.push(Br()),d&&U.push(da()),$.current.dispatch({effects:Qe.reconfigure.of(U)})}},[b,je,l,v,Q,S,X,F]),p.useEffect(function(){var U=$.current,L=!Un(R,te.current)||!Un(P,W.current);U&&L&&(U.dispatch({effects:Qe.appendConfig.of(R)}),U.dispatch({effects:Qe.appendConfig.of(kt.of(we([],P,!0)))}),te.current=R,W.current=P)},[R,P]),p.useEffect(function(){$.current&&g==="dirty"&&window.matchMedia("(min-width: 768px)").matches&&$.current.contentDOM.focus()},[]),p.useEffect(function(){if($.current&&typeof o=="string"&&o!==re){var I=$.current,U=I.state.selection.ranges.some(function(_){var he=_.to,ae=_.from;return he>o.length||ae>o.length})?Hr.cursor(o.length):I.state.selection,L={from:0,to:I.state.doc.length,insert:o};I.dispatch({changes:L,selection:U})}},[o]),p.useEffect(function(){if(d){var U=G(function(L){var _=$.current;L.type==="success"?_==null||_.dispatch({annotations:[new Nt("remove-errors",!0)]}):L.type==="action"&&L.action==="show-error"&&L.path===i&&L.line&&(_==null||_.dispatch({annotations:[new Nt("show-error",L.line)]}))});return function(){return U()}}},[G,d]);var oe=function(I){I.key==="Enter"&&$.current&&(I.preventDefault(),$.current.contentDOM.focus())},ie=function(){var I=4;return l&&(I+=6),S||(I+=1),"var(--".concat(ne,"-space-").concat(I,")")};return X?c.jsxs(c.Fragment,{children:[c.jsx("pre",{ref:K,className:T("cm",[T(g),T(xe),Vn,zn]),translate:"no",children:c.jsx("code",{className:T("pre-placeholder",[cn]),style:{marginLeft:ie()},children:Ae})}),S&&E&&c.jsx("span",y({className:T("read-only",[va])},{},{children:"Read-only"}))]}):c.jsx("div",{ref:K,"aria-autocomplete":"list","aria-label":i?"Code Editor for ".concat(Ot(i)):"Code Editor","aria-multiline":"true",className:T("cm",[T(g),T(xe),Vn,zn]),onKeyDown:oe,role:"textbox",tabIndex:0,translate:"no",suppressHydrationWarning:!0,children:c.jsx("pre",{className:T("pre-placeholder",[cn]),style:{marginLeft:ie()},children:Ae})})}),su=p.forwardRef(function(e,t){var n=e.showTabs,o=e.showLineNumbers,i=o===void 0?!1:o,r=e.showInlineErrors,a=r===void 0?!1:r,u=e.showRunButton,l=u===void 0?!0:u,s=e.wrapContent,d=s===void 0?!1:s,f=e.closableTabs,v=f===void 0?!1:f,m=e.initMode,g=e.extensions,h=e.extensionsKeymap,S=e.readOnly,w=e.showReadOnly,E=e.additionalLanguages,j=e.className,O=fe(e,["showTabs","showLineNumbers","showInlineErrors","showRunButton","wrapContent","closableTabs","initMode","extensions","extensionsKeymap","readOnly","showReadOnly","additionalLanguages","className"]),k=ce().sandpack,M=eo(),R=M.code,V=M.updateCode,P=M.readOnly,H=k.activeFile,Y=k.status,J=k.editorState,K=n??k.visibleFiles.length>1,$=be(),q=function(Q,B){B===void 0&&(B=!0),V(Q,B)},Z=Qr();return c.jsxs(_t,y({className:$("editor",[j])},O,{children:[K&&c.jsx(ro,{activeFileUniqueId:Z,closableTabs:v}),c.jsxs("div",{"aria-labelledby":"".concat(H,"-").concat(Z,"-tab"),className:$("code-editor",[so]),id:"".concat(H,"-").concat(Z,"-tab-panel"),role:"tabpanel",children:[c.jsx(kn,{ref:t,additionalLanguages:E,code:R,editorState:J,extensions:g,extensionsKeymap:h,filePath:H,initMode:m||k.initMode,onCodeUpdate:function(Q){var B;return q(Q,(B=k.autoReload)!==null&&B!==void 0?B:!0)},readOnly:S||P,showInlineErrors:a,showLineNumbers:i,showReadOnly:w,wrapContent:d},H),l&&(!k.autoReload||Y==="idle")?c.jsx(oo,{}):null]})]}))});p.forwardRef(function(e,t){var n=e.showTabs,o=e.showLineNumbers,i=e.decorators,r=e.code,a=e.initMode,u=e.wrapContent,l=e.additionalLanguages,s=fe(e,["showTabs","showLineNumbers","decorators","code","initMode","wrapContent","additionalLanguages"]),d=ce().sandpack,f=eo().code,v=be(),m=n??d.visibleFiles.length>1,g=Qr();return c.jsxs(_t,y({className:v("editor-viewer")},s,{children:[m?c.jsx(ro,{activeFileUniqueId:g}):null,c.jsx("div",{"aria-labelledby":"".concat(d.activeFile,"-").concat(g,"-tab"),className:v("code-editor",[so]),id:"".concat(d.activeFile,"-").concat(g,"-tab-panel"),role:"tabpanel",children:c.jsx(kn,{ref:t,additionalLanguages:l,code:r??f,decorators:i,filePath:d.activeFile,initMode:a||d.initMode,showLineNumbers:o,showReadOnly:!1,wrapContent:u,readOnly:!0})}),d.status==="idle"?c.jsx(oo,{}):null]}))});var bt,yt,ha=N((bt={border:"1px solid $colors$surface2",display:"flex",flexWrap:"wrap",alignItems:"stretch",borderRadius:"$border$radius",overflow:"hidden",position:"relative",backgroundColor:"$colors$surface2",gap:1},bt["> .".concat(io)]={flexGrow:1,flexShrink:1,flexBasis:"0",height:"$layout$height",overflow:"hidden","@media print":{height:"auto",display:"block"},"@media screen and (max-width: 768px)":(yt={},yt["&:not(.".concat(ne,"-preview, .").concat(ne,"-editor, .").concat(ne,"-preset-column)")]={height:"calc($layout$height / 2)"},yt.minWidth="100%;",yt)},bt["> .".concat(ne,"-file-explorer")]={flex:.2,minWidth:200,"@media screen and (max-width: 768px)":{flex:1}},bt));p.forwardRef(function(e,t){var n=e.children,o=e.className,i=fe(e,["children","className"]),r=ce().sandpack,a=be(),u=ao(r.lazyAnchorRef,t);return c.jsx("div",y({ref:u,className:a("layout",[ha,o])},i,{children:n}))});var ga=function(){var e,t=ce().sandpack,n=t.error;return(e=n==null?void 0:n.message)!==null&&e!==void 0?e:null},co=200,ba=function(e,t){var n=ce(),o=n.sandpack,i=n.listen,r=p.useState("LOADING"),a=r[0],u=r[1];return p.useEffect(function(){var l=i(function(s){s.type==="start"&&s.firstLoad===!0&&u("LOADING"),s.type==="done"&&u(function(d){return d==="LOADING"?"PRE_FADING":"HIDDEN"})},e);return function(){l()}},[e,o.status==="idle"]),p.useEffect(function(){var l;return a==="PRE_FADING"&&!t?u("FADING"):a==="FADING"&&(l=setTimeout(function(){return u("HIDDEN")},co)),function(){clearTimeout(l)}},[a,t]),o.status==="timeout"?"TIMEOUT":o.status!=="running"?"HIDDEN":a},ya=function(e){var t=ce().dispatch;return{refresh:function(){return t({type:"refresh"},e)},back:function(){return t({type:"urlback"},e)},forward:function(){return t({type:"urlforward"},e)}}},lo=function(e){var t=ce(),n=t.sandpack,o=t.listen,i=t.dispatch,r=p.useRef(null),a=p.useRef(nt());p.useEffect(function(){var l=r.current,s=a.current;return l!==null&&n.registerBundler(l,s,e),function(){return n.unregisterBundler(s)}},[]);var u=function(){return n.clients[a.current]||null};return{sandpack:n,getClient:u,clientId:a.current,iframe:r,listen:function(l){return o(l,a.current)},dispatch:function(l){return i(l,a.current)}}},Nn=function(e){var t=ce().dispatch;return{restart:function(){return t({type:"shell/restart"},e)},openPreview:function(){return t({type:"shell/openPreview"},e)}}},xa=function(e,t){var n;switch(e.state){case"downloading_manifest":return"[1/3] Downloading manifest";case"downloaded_module":return"[2/3] Downloaded ".concat(e.name," (").concat(t-e.totalPending,"/").concat(t,")");case"starting_command":return"[3/3] Starting command";case"command_running":return'[3/3] Running "'.concat((n=e.command)===null||n===void 0?void 0:n.trim(),'"')}},uo=function(e){var t=p.useState(!1),n=t[0],o=t[1],i=p.useState(),r=i[0],a=i[1],u=p.useState(null),l=u[0],s=u[1],d=e==null?void 0:e.timeout,f=e==null?void 0:e.clientId,v=ce().listen;return p.useEffect(function(){var m,g=v(function(h){h.type==="start"&&h.firstLoad&&o(!1),d&&(m=setTimeout(function(){s(null)},d)),h.type==="dependencies"?s(function(){switch(h.data.state){case"downloading_manifest":return"[1/3] Downloading manifest";case"downloaded_module":return"[2/3] Downloaded ".concat(h.data.name," (").concat(h.data.progress,"/").concat(h.data.total,")");case"starting":return"[3/3] Starting"}return null}):h.type==="shell/progress"&&!n&&(!r&&h.data.state==="downloaded_module"&&a(h.data.totalPending),r!==void 0&&s(xa(h.data,r))),h.type==="done"&&h.compilatonError===!1&&(s(null),o(!0),clearTimeout(m))},f);return function(){m&&clearTimeout(m),g()}},[f,n,r,d]),l},wa=400*2,fo=function(e){var t=e.clientId,n=e.maxMessageCount,o=n===void 0?wa:n;e.resetOnPreviewRestart;var i=p.useState([]),r=i[0],a=i[1],u=ce().listen;return p.useEffect(function(){var l=u(function(s){s.type==="start"?a([]):s.type==="stdout"&&s.payload.data&&s.payload.data.trim()&&a(function(d){for(var f=we(we([],d,!0),[{data:s.payload.data,id:nt()}],!1);f.length>o;)f.shift();return f})},t);return l},[o,t]),{logs:r,reset:function(){return a([])}}},Sa=function(e){var t=e.replace("[sandpack-client]: ","");if(/process.exit/.test(t)){var n=t.match(/process.exit\((\d+)\)/);return n?Number(n[1])===0?"Server is not running, would you like to start it again?":"Server has crashed with status code ".concat(n[1],", would you like to restart the server?"):t}return t},Ca=function(e){var t=e.children,n=e.className,o=fe(e,["children","className"]),i=ga(),r=Nn().restart,a=be(),u=ce().sandpack,l=u.runSandpack,s=u.teamId,d=ce().dispatch;if(!i&&!t)return null;var f=i==null?void 0:i.startsWith("[sandpack-client]"),v=i==null?void 0:i.includes("NPM_REGISTRY_UNAUTHENTICATED_REQUEST"),m=function(){s&&d({type:"sign-in",teamId:s})};return v?c.jsxs("div",y({className:a("overlay",[a("error"),at,an,n])},e,{children:[c.jsx("p",{className:a("error-message",[Ue]),children:c.jsx("strong",{children:"Unable to fetch required dependency."})}),c.jsx("div",{className:a("error-message",[Ue]),children:c.jsxs("p",{children:["Authentication required. Please sign in to your account (make sure to allow pop-ups to this page) and try again. If the issue persists, contact"," ",c.jsx("a",{href:"mailto:hello@codesandbox.io?subject=Sandpack Timeout Error",children:"support"})," ","for further assistance."]})}),c.jsx("div",{children:c.jsxs("button",{className:a("button",[Ne,Fe,Ke]),onClick:m,children:[c.jsx(ei,{}),c.jsx("span",{children:"Sign in"})]})})]})):f&&i?c.jsx("div",y({className:a("overlay",[a("error"),at,an,n])},o,{children:c.jsxs("div",{className:a("error-message",[Ue]),children:[c.jsx("p",{className:a("error-title",[N({fontWeight:"bold"})]),children:"Couldn't connect to server"}),c.jsx("p",{children:Sa(i)}),c.jsx("div",{children:c.jsxs("button",{className:a("button",[a("icon-standalone"),Ne,Fe,Ke]),onClick:function(){r(),l()},title:"Restart script",type:"button",children:[c.jsx(It,{})," ",c.jsx("span",{children:"Restart"})]})})]})})):c.jsxs("div",y({className:a("overlay",[a("error"),at,to({solidBg:!0}),n]),translate:"no"},o,{children:[c.jsx("p",{className:a("error-message",[Ue]),children:c.jsx("strong",{children:"Something went wrong"})}),c.jsx("p",{className:a("error-message",[Ue({errorCode:!0})]),children:i||t})]}))};function ja(e,t){return t===void 0&&(t=!1),e=kr.escapeCarriageReturn(Ta(e)),Nr.ansiToJson(e,{json:!0,remove_empty:!0,use_classes:t})}function Ea(e){var t="";return e.bg&&(t+="".concat(e.bg,"-bg ")),e.fg&&(t+="".concat(e.fg,"-fg ")),e.decoration&&(t+="ansi-".concat(e.decoration," ")),t===""?null:(t=t.substring(0,t.length-1),t)}function ka(e){var t={};switch(e.bg&&(t.backgroundColor="rgb(".concat(e.bg,")")),e.fg&&(t.color="rgb(".concat(e.fg,")")),e.decoration){case"bold":t.fontWeight="bold";break;case"dim":t.opacity="0.5";break;case"italic":t.fontStyle="italic";break;case"hidden":t.visibility="hidden";break;case"strikethrough":t.textDecoration="line-through";break;case"underline":t.textDecoration="underline";break;case"blink":t.textDecoration="blink";break}return t}function Na(e,t,n,o){var i=t?null:ka(n),r=t?Ea(n):null;if(!e)return p.createElement("span",{style:i,key:o,className:r},n.content);for(var a=[],u=/(\s|^)(https?:\/\/(?:www\.|(?!www))[^\s.]+\.[^\s]{2,}|www\.[^\s]+\.[^\s]{2,})/g,l=0,s;(s=u.exec(n.content))!==null;){var d=s[1],f=s[2],v=s.index+d.length;v>l&&a.push(n.content.substring(l,v));var m=f.startsWith("www.")?"http://".concat(f):f;a.push(p.createElement("a",{key:l,href:m,target:"_blank"},"".concat(f))),l=u.lastIndex}return l<n.content.length&&a.push(n.content.substring(l)),p.createElement("span",{style:i,key:o,className:r},a)}function $a(e){var t=e.className,n=e.useClasses,o=e.children,i=e.linkify;return p.createElement("code",{className:t},ja(o??"",n??!1).map(Na.bind(null,i??!1,n??!1)))}function Ta(e){var t=e;do e=t,t=e.replace(/[^\n]\x08/gm,"");while(t.length<e.length);return e}var po=function(e){var t=e.data,n=be();return c.jsx(c.Fragment,{children:t.map(function(o){var i=o.data,r=o.id;return c.jsx("div",{className:n("console-item",[Oa]),children:c.jsx($a,{children:i})},r)})})},Oa=N({width:"100%",padding:"$space$3 $space$2",fontSize:".85em",position:"relative",whiteSpace:"pre","&:not(:first-child):after":{content:"",position:"absolute",top:0,left:0,right:0,height:1,background:"$colors$surface3"}}),Aa=function(e){return $r.compressToBase64(JSON.stringify(e)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")},Jn="https://codesandbox.io/api/v1/sandboxes/define",Ma=function(e,t){var n=Object.keys(e).reduce(function(o,i){var r,a=i.replace("/",""),u={content:e[i].code,isBinary:!1};return y(y({},o),(r={},r[a]=u,r))},{});return Aa(y({files:n},t?{template:t}:null))},La=function(e){var t=ce().sandpack;return t.exportOptions?c.jsx(Ra,y({state:t},e)):c.jsx(Ia,y({state:t},e))},Ra=function(e){var t=e.children,n=e.state,o=fe(e,["children","state"]),i=function(){return Be(void 0,void 0,void 0,function(){var r,a,u,l;return He(this,function(s){switch(s.label){case 0:if(!(!((l=n.exportOptions)===null||l===void 0)&&l.apiToken))throw new Error("Missing `apiToken` property");return r=Object.keys(n.files).reduce(function(d,f){var v,m=f.replace("/","");return y(y({},d),(v={},v[m]=n.files[f],v))},{}),[4,fetch("https://api.codesandbox.io/sandbox",{method:"POST",body:JSON.stringify({template:n.environment,files:r,privacy:n.exportOptions.privacy==="public"?0:2}),headers:{Authorization:"Bearer ".concat(n.exportOptions.apiToken),"Content-Type":"application/json","X-CSB-API-Version":"2023-07-01"}})];case 1:return a=s.sent(),[4,a.json()];case 2:return u=s.sent(),window.open("https://codesandbox.io/p/sandbox/".concat(u.data.alias,"?file=/").concat(n.activeFile,"&utm-source=storybook-addon"),"_blank"),[2]}})})};return c.jsx("button",y({onClick:i,title:"Export to workspace in CodeSandbox",type:"button"},o,{children:t}))},Ia=function(e){var t,n,o,i=e.children,r=e.state,a=fe(e,["children","state"]),u=p.useRef(null),l=p.useState(),s=l[0],d=l[1];return p.useEffect(function(){var v=setTimeout(function(){var m=Ma(r.files,r.environment),g=new URLSearchParams({parameters:m,query:new URLSearchParams({file:r.activeFile,utm_medium:"sandpack"}).toString()});d(g)},600);return function(){clearTimeout(v)}},[r.activeFile,r.environment,r.files]),((o=(n=(t=s==null?void 0:s.get)===null||t===void 0?void 0:t.call(s,"parameters"))===null||n===void 0?void 0:n.length)!==null&&o!==void 0?o:0)>1500?c.jsxs("button",y({onClick:function(){var f;return(f=u.current)===null||f===void 0?void 0:f.submit()},title:"Open in CodeSandbox",type:"button"},a,{children:[c.jsxs("form",{ref:u,action:Jn,method:"POST",style:{visibility:"hidden"},target:"_blank",children:[c.jsx("input",{name:"environment",type:"hidden",value:r.environment==="node"?"server":r.environment}),Array.from(s,function(f){var v=f[0],m=f[1];return c.jsx("input",{name:v,type:"hidden",value:m},v)})]}),i]})):c.jsx("a",y({href:"".concat(Jn,"?").concat(s==null?void 0:s.toString(),"&environment=").concat(r.environment==="node"?"server":r.environment),rel:"noreferrer noopener",target:"_blank",title:"Open in CodeSandbox"},a,{children:i}))},vo=function(){var e=be();return c.jsxs(La,{className:e("button",[e("icon-standalone"),Ne,Fe,Ke]),children:[c.jsx(ai,{}),c.jsx("span",{children:"Open Sandbox"})]})},qe,ln=N({transform:"translate(-4px, 9px) scale(0.13, 0.13)","*":{position:"absolute",width:"96px",height:"96px"}}),_a=N((qe={position:"absolute",right:"$space$2",bottom:"$space$2",zIndex:"$top",width:"32px",height:"32px",borderRadius:"$border$radius"},qe[".".concat(ln)]={display:"flex"},qe[".sp-button.".concat(Ne)]={display:"none"},qe["&:hover .sp-button.".concat(Ne)]={display:"flex"},qe["&:hover .sp-button.".concat(Ne," > span")]={display:"none"},qe["&:hover .".concat(ln)]={display:"none"},qe)),Da=Kr({"0%":{transform:"rotateX(-25.5deg) rotateY(45deg)"},"100%":{transform:"rotateX(-25.5deg) rotateY(405deg)"}}),Fa=N({animation:"".concat(Da," 1s linear infinite"),animationFillMode:"forwards",transformStyle:"preserve-3d",transform:"rotateX(-25.5deg) rotateY(45deg)","*":{border:"10px solid $colors$clickable",borderRadius:"8px",background:"$colors$surface1"},".top":{transform:"rotateX(90deg) translateZ(44px)",transformOrigin:"50% 50%"},".bottom":{transform:"rotateX(-90deg) translateZ(44px)",transformOrigin:"50% 50%"},".front":{transform:"rotateY(0deg) translateZ(44px)",transformOrigin:"50% 50%"},".back":{transform:"rotateY(-180deg) translateZ(44px)",transformOrigin:"50% 50%"},".left":{transform:"rotateY(-90deg) translateZ(44px)",transformOrigin:"50% 50%"},".right":{transform:"rotateY(90deg) translateZ(44px)",transformOrigin:"50% 50%"}}),Pa=function(e){var t=e.className,n=e.showOpenInCodeSandbox,o=fe(e,["className","showOpenInCodeSandbox"]),i=be();return c.jsxs("div",y({className:i("cube-wrapper",[_a,t]),title:"Open in CodeSandbox"},o,{children:[n&&c.jsx(vo,{}),c.jsx("div",{className:i("cube",[ln]),children:c.jsxs("div",{className:i("sides",[Fa]),children:[c.jsx("div",{className:"top"}),c.jsx("div",{className:"right"}),c.jsx("div",{className:"bottom"}),c.jsx("div",{className:"left"}),c.jsx("div",{className:"front"}),c.jsx("div",{className:"back"})]})})]}))},Ba=N({backgroundColor:"$colors$surface1"}),Ha=function(e){var t=e.clientId,n=e.loading,o=e.className,i=e.style,r=e.showOpenInCodeSandbox,a=fe(e,["clientId","loading","className","style","showOpenInCodeSandbox"]),u=be(),l=ce().sandpack,s=l.runSandpack,d=l.environment,f=p.useState(!1),v=f[0],m=f[1],g=ba(t,n),h=uo({clientId:t}),S=fo({clientId:t}).logs;if(p.useEffect(function(){var E;return h!=null&&h.includes("Running")&&(E=setTimeout(function(){m(!0)},3e3)),function(){E&&clearTimeout(E)}},[h]),g==="HIDDEN")return null;if(g==="TIMEOUT")return c.jsx("div",y({className:u("overlay",[u("error"),at,to,an,o])},a,{children:c.jsxs("div",{className:u("error-message",[Ue]),children:[c.jsx("p",{className:u("error-title",[N({fontWeight:"bold"})]),children:"Couldn't connect to server"}),c.jsx("div",{className:u("error-message",[Ue]),children:c.jsxs("p",{children:["This means sandpack cannot connect to the runtime or your network is having some issues. Please check the network tab in your browser and try again. If the problem persists, report it via"," ",c.jsx("a",{href:"mailto:hello@codesandbox.io?subject=Sandpack Timeout Error",children:"email"})," ","or submit an issue on"," ",c.jsx("a",{href:"https://github.com/codesandbox/sandpack/issues",rel:"noreferrer noopener",target:"_blank",children:"GitHub."})]})}),c.jsxs("p",{className:u("error-message",[Ue({errorCode:!0})]),children:["ENV: ",d,c.jsx("br",{}),"ERROR: TIME_OUT"]}),c.jsx("div",{children:c.jsxs("button",{className:u("button",[u("icon-standalone"),Ne,Fe,Ke]),onClick:s,title:"Restart script",type:"button",children:[c.jsx(It,{})," ",c.jsx("span",{children:"Try again"})]})})]})}));var w=g==="LOADING"||g==="PRE_FADING";return c.jsxs(c.Fragment,{children:[c.jsxs("div",y({className:u("overlay",[u("loading"),at,Ba,o]),style:y(y({},i),{opacity:w?1:0,transition:"opacity ".concat(co,"ms ease-out")})},a,{children:[v&&c.jsx("div",{className:Ua.toString(),children:c.jsx(po,{data:S})}),c.jsx(Pa,{showOpenInCodeSandbox:r})]})),h&&c.jsx("div",{className:za.toString(),children:c.jsx("p",{children:h})})]})},Ua=N({position:"absolute",left:0,right:0,bottom:"$space$8",overflow:"auto",opacity:.5,overflowX:"hidden"}),za=N({position:"absolute",left:"$space$5",bottom:"$space$4",zIndex:"$top",color:"$colors$clickable",animation:"".concat(En," 150ms ease"),fontFamily:"$font$mono",fontSize:".8em",width:"75%",p:{whiteSpace:"nowrap",margin:0,textOverflow:"ellipsis",overflow:"hidden"}}),Va=function(e){var t=e.clientId,n=uo({timeout:3e3,clientId:t});return n?c.jsx("div",{className:Ja.toString(),children:c.jsx("p",{children:n})}):null},Ja=N({position:"absolute",left:"$space$5",bottom:"$space$4",zIndex:"$top",color:"$colors$clickable",animation:"".concat(En," 150ms ease"),fontFamily:"$font$mono",fontSize:".8em",width:"75%",p:{whiteSpace:"nowrap",margin:0,textOverflow:"ellipsis",overflow:"hidden"}});N({borderRadius:"0",width:"100%",padding:0,marginBottom:"$space$2",span:{textOverflow:"ellipsis",whiteSpace:"nowrap",overflow:"hidden"},svg:{marginRight:"$space$1"}});N({padding:"$space$3",overflow:"auto",height:"100%"});var Wa=function(e){var t=e.match(/(https?:\/\/.*?)\//);return t&&t[1]?[t[1],e.replace(t[1],"")]:[e,"/"]},Ya=N({display:"flex",alignItems:"center",height:"$layout$headerHeight",borderBottom:"1px solid $colors$surface2",padding:"$space$3 $space$2",background:"$colors$surface1"}),Za=N({backgroundColor:"$colors$surface2",color:"$colors$clickable",padding:"$space$1 $space$3",borderRadius:"99999px",border:"1px solid $colors$surface2",height:"24px",lineHeight:"24px",fontSize:"inherit",outline:"none",flex:1,marginLeft:"$space$4",width:"0",transition:"background $transitions$default","&:hover":{backgroundColor:"$colors$surface3"},"&:focus":{backgroundColor:"$surface1",border:"1px solid $colors$accent",color:"$colors$base"}}),qa=function(e){var t,n=e.clientId,o=e.onURLChange,i=e.className,r=e.startRoute,a=fe(e,["clientId","onURLChange","className","startRoute"]),u=p.useState(""),l=u[0],s=u[1],d=ce(),f=d.sandpack,v=d.dispatch,m=d.listen,g=p.useState((t=r??f.startRoute)!==null&&t!==void 0?t:"/"),h=g[0],S=g[1],w=p.useState(!1),E=w[0],j=w[1],O=p.useState(!1),k=O[0],M=O[1],R=be();p.useEffect(function(){var $=m(function(q){if(q.type==="urlchange"){var Z=q.url,Q=q.back,B=q.forward,re=Wa(Z),ve=re[0],C=re[1];s(ve),S(C),j(Q),M(B)}},n);return function(){return $()}},[]);var V=function($){var q=$.target.value.startsWith("/")?$.target.value:"/".concat($.target.value);S(q)},P=function($){$.code==="Enter"&&($.preventDefault(),$.stopPropagation(),typeof o=="function"&&o(l+$.currentTarget.value))},H=function(){v({type:"refresh"})},Y=function(){v({type:"urlback"})},J=function(){v({type:"urlforward"})},K=R("button",[R("icon"),Ne,Xi,N({minWidth:"$space$6",justifyContent:"center"})]);return c.jsxs("div",y({className:R("navigator",[Ya,i])},a,{children:[c.jsx("button",{"aria-label":"Go back one page",className:K,disabled:!E,onClick:Y,type:"button",children:c.jsx(ri,{})}),c.jsx("button",{"aria-label":"Go forward one page",className:K,disabled:!k,onClick:J,type:"button",children:c.jsx(oi,{})}),c.jsx("button",{"aria-label":"Refresh page",className:K,onClick:H,type:"button",children:c.jsx(Gr,{})}),c.jsx("input",{"aria-label":"Current Sandpack URL",className:R("input",[Za]),name:"Current Sandpack URL",onChange:V,onKeyDown:P,type:"text",value:h})]}))},Wt,Ga=N((Wt={flex:1,display:"flex",flexDirection:"column",background:"white",overflow:"auto",position:"relative"},Wt[".".concat(ne,"-bridge-frame")]={border:0,position:"absolute",left:"$space$2",bottom:"$space$2",zIndex:"$top",height:12,width:"30%",mixBlendMode:"multiply",pointerEvents:"none"},Wt)),Ka=N({border:"0",outline:"0",width:"100%",height:"100%",minHeight:"160px",maxHeight:"2000px",flex:1}),Xa=N({display:"flex",position:"absolute",bottom:"$space$2",right:"$space$2",zIndex:"$overlay",gap:"$space$2"});p.forwardRef(function(e,t){var n=e.showNavigator,o=n===void 0?!1:n,i=e.showRefreshButton,r=i===void 0?!0:i,a=e.showOpenInCodeSandbox,u=a===void 0?!0:a,l=e.showSandpackErrorOverlay,s=l===void 0?!0:l;e.showOpenNewtab;var d=e.showRestartButton,f=d===void 0?!0:d,v=e.actionsChildren,m=v===void 0?c.jsx(c.Fragment,{}):v,g=e.children,h=e.className,S=e.startRoute,w=S===void 0?"/":S,E=fe(e,["showNavigator","showRefreshButton","showOpenInCodeSandbox","showSandpackErrorOverlay","showOpenNewtab","showRestartButton","actionsChildren","children","className","startRoute"]),j=lo({startRoute:w}),O=j.sandpack,k=j.listen,M=j.iframe,R=j.getClient,V=j.clientId,P=j.dispatch,H=p.useState(null),Y=H[0],J=H[1],K=O.status,$=ya(V).refresh,q=Nn(V).restart,Z=be();p.useEffect(function(){var B=k(function(re){re.type==="resize"&&J(re.height)});return B},[]),p.useImperativeHandle(t,function(){return{clientId:V,getClient:R}},[R,V]);var Q=function(B){M.current&&(M.current.src=B)};return c.jsxs(_t,y({className:Z("preview",[h])},E,{children:[o&&c.jsx(qa,{clientId:V,onURLChange:Q,startRoute:w}),c.jsxs("div",{className:Z("preview-container",[Ga]),children:[c.jsx("iframe",{ref:M,className:Z("preview-iframe",[Ka]),style:{height:Y||void 0},title:"Sandpack Preview"}),c.jsxs("div",{className:Z("preview-actions",[Xa]),children:[m,f&&O.environment==="node"&&c.jsx(dt,{onClick:q,children:c.jsx(It,{})}),!o&&r&&K==="running"&&c.jsx(dt,{onClick:$,children:c.jsx(Gr,{})}),O.teamId&&c.jsx("button",{className:Z("button",[Z("icon-standalone"),Ne,Fe,Ke]),onClick:function(){return P({type:"sign-out"})},title:"Sign out",type:"button",children:c.jsx(ti,{})}),u&&c.jsx(vo,{})]}),c.jsx(Ha,{clientId:V,showOpenInCodeSandbox:u}),s&&c.jsx(Ca,{}),g]})]}))});var Yt;N((Yt={display:"flex",flexDirection:"column",width:"100%",position:"relative",overflow:"auto",minHeight:"160px",flex:1},Yt[".".concat(ne,"-stack")]={height:"100%"},Yt));N({justifyContent:"space-between",borderBottom:"1px solid $colors$surface2",padding:"0 $space$2",fontFamily:"$font$mono",height:"$layout$headerHeight",minHeight:"$layout$headerHeight",overflowX:"auto",whiteSpace:"nowrap"});N({display:"flex",flexDirection:"row",alignItems:"center",gap:"$space$2"});var Dt=N({variants:{status:{pass:{color:"var(--test-pass)"},fail:{color:"var(--test-fail)"},skip:{color:"var(--test-skip)"},title:{color:"var(--test-title)"}}}});Dt({status:"pass"});Dt({status:"fail"});Dt({status:"skip"});Dt({status:"title"});var $n=N({variants:{status:{pass:{background:"var(--test-pass)",color:"$colors$surface1"},fail:{background:"var(--test-fail)",color:"$colors$surface1"},run:{background:"var(--test-run)",color:"$colors$surface1"}}}});$n({status:"run"});$n({status:"pass"});$n({status:"fail"});N({marginLeft:"$space$4"});N({marginBottom:"$space$2",color:"$colors$clickable"});N({marginBottom:"$space$2",color:"$colors$hover"});N({marginLeft:"$space$2"});N({marginRight:"$space$2"});N({color:"$colors$hover",marginBottom:"$space$2"});N({marginLeft:"$space$4"});N({color:"$colors$hover",fontSize:"$font$size",padding:"$space$2",whiteSpace:"pre-wrap"});N({display:"flex",flexDirection:"row",alignItems:"center",marginBottom:"$space$2"});N({marginBottom:"$space$2"});N({fontWeight:"bold"});N({borderRadius:"calc($border$radius / 2)"});N({padding:"$space$1 $space$2",fontFamily:"$font$mono",textTransform:"uppercase",marginRight:"$space$2"});N({fontFamily:"$font$mono",cursor:"pointer",display:"inline-block"});N({color:"$colors$clickable",textDecorationStyle:"dotted",textDecorationLine:"underline"});N({color:"$colors$hover",fontWeight:"bold",textDecorationStyle:"dotted",textDecorationLine:"underline"});N({marginBottom:"$space$2"});N({fontWeight:"bold",color:"$colors$hover",whiteSpace:"pre-wrap"});N({fontWeight:"bold",color:"$colors$clickable"});N({display:"flex",position:"absolute",bottom:"$space$2",right:"$space$2",zIndex:"$overlay","> *":{marginLeft:"$space$2"}});N({padding:"$space$4",height:"100%",overflow:"auto",display:"flex",flexDirection:"column",position:"relative",fontFamily:"$font$mono"});N({fontWeight:"bold",color:"$colors$base"});var Qa=["SyntaxError: ","Error in sandbox:"],es={id:"random",method:"clear",data:["Console was cleared"]},Wn="@t",Yn="#@t",Zn="@r",qn=1e4,mo=2,un=400,ts=un*2,Zt=function(){if(typeof globalThis<"u")return globalThis;if(typeof window<"u")return window;if(typeof Et<"u")return Et;if(typeof self<"u")return self;throw Error("Unable to locate global object")}(),ns=typeof ArrayBuffer=="function",rs=typeof Map=="function",os=typeof Set=="function",st;(function(e){e[e.infinity=0]="infinity",e[e.minusInfinity=1]="minusInfinity",e[e.minusZero=2]="minusZero"})(st||(st={}));var Gn={Arithmetic:function(e){return e===st.infinity?1/0:e===st.minusInfinity?-1/0:e===st.minusZero?-0:e},HTMLElement:function(e){var t=document.implementation.createHTMLDocument("sandbox");try{var n=t.createElement(e.tagName);n.innerHTML=e.innerHTML;for(var o=0,i=Object.keys(e.attributes);o<i.length;o++){var r=i[o];try{n.setAttribute(r,e.attributes[r])}catch{}}return n}catch{return e}},Function:function(e){var t=function(){};return Object.defineProperty(t,"toString",{value:function(){return"function ".concat(e.name,"() {").concat(e.body,"}")}}),t},"[[NaN]]":function(){return NaN},"[[undefined]]":function(){},"[[Date]]":function(e){var t=new Date;return t.setTime(e),t},"[[RegExp]]":function(e){return new RegExp(e.src,e.flags)},"[[Error]]":function(e){var t=Zt[e.name]||Error,n=new t(e.message);return n.stack=e.stack,n},"[[ArrayBuffer]]":function(e){if(ns){var t=new ArrayBuffer(e.length),n=new Int8Array(t);return n.set(e),t}return e},"[[TypedArray]]":function(e){return typeof Zt[e.ctorName]=="function"?new Zt[e.ctorName](e.arr):e.arr},"[[Map]]":function(e){if(rs){for(var t=new Map,n=0;n<e.length;n+=2)t.set(e[n],e[n+1]);return t}for(var o=[],i=0;i<e.length;i+=2)o.push([e[n],e[n+1]]);return o},"[[Set]]":function(e){if(os){for(var t=new Set,n=0;n<e.length;n++)t.add(e[n]);return t}return e}},dn=function(e){var t;if(typeof e=="string"||typeof e=="number"||e===null)return e;if(Array.isArray(e))return e.map(dn);if(typeof e=="object"&&Wn in e){var n=e[Wn],o=Gn[n];return o(e.data)}else if(typeof e=="object"&&Yn in e){var n=e[Yn],o=Gn[n];return o(e.data)}else if(typeof e=="object"&&((t=e.constructor)===null||t===void 0?void 0:t.name)==="NodeList"){var i={};return Object.entries(e).forEach(function(r){var a=r[0],u=r[1];i[a]=dn(u)}),i}return e},is=function(e,t,n){var o=e.reduce(function(i,r,a){return"".concat(i).concat(a?", ":"").concat(ft(r,t,n))},"");return"[".concat(o,"]")},as=function(e,t,n){var o=e.constructor.name!=="Object"?"".concat(e.constructor.name," "):"";if(n>mo)return o;var i=Object.entries(e),r=Object.entries(e).reduce(function(a,u,l){var s=u[0],d=u[1],f=l===0?"":", ",v=i.length>10?`
  `:"",m=ft(d,t,n);return l===un?a+v+"...":l>un?a:a+"".concat(f).concat(v).concat(s,": ")+m},"");return"".concat(o,"{ ").concat(r).concat(i.length>10?`
`:" ","}")},ft=function(e,t,n){var o;n===void 0&&(n=0);try{var i=dn(e);if(Array.isArray(i))return is(i,t,n+1);switch(typeof i){case"string":return'"'.concat(i,'"').slice(0,qn);case"number":case"function":case"symbol":return i.toString();case"boolean":return String(i);case"undefined":return"undefined";case"object":default:if(i instanceof RegExp||i instanceof Error||i instanceof Date)return i.toString();if(i===null)return String(null);if(i instanceof HTMLElement)return i.outerHTML.slice(0,qn);if(Object.entries(i).length===0)return"{}";if(Zn in i){if(n>mo)return"Unable to print information";var r=t[i[Zn]];return ft(r,t,n+1)}if(((o=i.constructor)===null||o===void 0?void 0:o.name)==="NodeList"){var a=i.length,u=new Array(a).fill(null).map(function(l,s){return ft(i[s],t)});return"NodeList(".concat(i.length,")[").concat(u,"]")}return as(i,t,n+1)}}catch{return"Unable to print information"}},ss=function(e){switch(e){case"warn":return"warning";case"clear":return"clear";case"error":return"error";case"log":case"info":default:return"info"}},xt,cs=function(e){var t=e.data,n=be();return c.jsx(c.Fragment,{children:t.map(function(o,i,r){var a=o.data,u=o.id,l=o.method;return a&&Array.isArray(a)?c.jsx(p.Fragment,{children:a.map(function(s,d){var f=r.slice(i,r.length);return c.jsx("div",{className:n("console-item",[ls({variant:ss(l)})]),children:c.jsx(kn,{code:l==="clear"?s:ft(s,f),fileType:"js",initMode:"user-visible",showReadOnly:!1,readOnly:!0,wrapContent:!0})},"".concat(u,"-").concat(d))})},u):null})})},ls=N((xt={width:"100%",padding:"$space$3 $space$2",fontSize:".8em",position:"relative","&:not(:first-child):after":{content:"",position:"absolute",top:0,left:0,right:0,height:1,background:"$colors$surface3"},".sp-cm":{padding:0},".cm-editor":{background:"none"},".cm-content":{padding:0}},xt[".".concat(ne,"-pre-placeholder")]={margin:"0 !important",fontSize:"1em"},xt.variants={variant:{error:{color:"$colors$error",background:"$colors$errorSurface","&:not(:first-child):after":{background:"$colors$error",opacity:.07}},warning:{color:"$colors$warning",background:"$colors$warningSurface","&:not(:first-child):after":{background:"$colors$warning",opacity:.07}},clear:{fontStyle:"italic"},info:{}}},xt)),us=N({justifyContent:"space-between",borderBottom:"1px solid $colors$surface2",padding:"0 $space$2",fontFamily:"$font$mono",height:"$layout$headerHeight",minHeight:"$layout$headerHeight",overflowX:"auto",whiteSpace:"nowrap"}),Kn=N({display:"flex",flexDirection:"row",alignItems:"center",gap:"$space$2"}),ds=function(e){var t=e.currentTab,n=e.setCurrentTab,o=e.node,i=be(),r=i("console-header-button",[Ne,Ke,N({padding:"$space$1 $space$3"})]);return c.jsxs("div",{className:i("console-header",[us,Kn]),children:[c.jsxs("p",{className:i("console-header-title",[N({lineHeight:1,margin:0,color:"$colors$base",fontSize:"$font$size",display:"flex",alignItems:"center",gap:"$space$2"})]),children:[c.jsx(ci,{}),c.jsx("span",{children:"Terminal"})]}),o&&c.jsxs("div",{className:i("console-header-actions",[Kn]),children:[c.jsx("button",{className:r,"data-active":t==="server",onClick:function(){return n("server")},type:"button",children:"Server"}),c.jsx("button",{className:r,"data-active":t==="client",onClick:function(){return n("client")},type:"button",children:"Client"})]})]})},fs=function(e){var t=e.clientId,n=e.maxMessageCount,o=n===void 0?ts:n,i=e.showSyntaxError,r=i===void 0?!1:i,a=e.resetOnPreviewRestart,u=a===void 0?!1:a,l=p.useState([]),s=l[0],d=l[1],f=ce().listen;return p.useEffect(function(){var v=f(function(m){if(u&&m.type==="start")d([]);else if(m.type==="console"&&m.codesandbox){var g=Array.isArray(m.log)?m.log:[m.log];if(g.find(function(S){var w=S.method;return w==="clear"}))return d([es]);var h=r?g:g.filter(function(S){var w,E,j,O=(j=(E=(w=S==null?void 0:S.data)===null||w===void 0?void 0:w.filter)===null||E===void 0?void 0:E.call(w,function(k){if(typeof k!="string")return!0;var M=Qa.filter(function(R){return k.startsWith(R)});return M.length===0}))!==null&&j!==void 0?j:[];return O.length>0});if(!h)return;d(function(S){for(var w=we(we([],S,!0),h,!0).filter(function(E,j,O){return j===O.findIndex(function(k){return k.id===E.id})});w.length>o;)w.shift();return w})}},t);return v},[r,o,t,u]),{logs:s,reset:function(){return d([])}}};p.forwardRef(function(e,t){var n,o=e.showHeader,i=o===void 0?!0:o,r=e.showSyntaxError,a=r===void 0?!1:r,u=e.maxMessageCount,l=e.onLogsChange,s=e.className;e.showSetupProgress;var d=e.showResetConsoleButton,f=d===void 0?!0:d,v=e.showRestartButton,m=v===void 0?!0:v,g=e.resetOnPreviewRestart,h=g===void 0?!1:g,S=e.actionsChildren,w=S===void 0?c.jsx(c.Fragment,{}):S,E=e.standalone,j=E===void 0?!1:E,O=fe(e,["showHeader","showSyntaxError","maxMessageCount","onLogsChange","className","showSetupProgress","showResetConsoleButton","showRestartButton","resetOnPreviewRestart","actionsChildren","standalone"]),k=ce().sandpack.environment,M=lo(),R=M.iframe,V=M.clientId,P=Nn().restart,H=p.useState(k==="node"?"server":"client"),Y=H[0],J=H[1],K=j?V:void 0,$=fs({maxMessageCount:u,showSyntaxError:a,resetOnPreviewRestart:h,clientId:K}),q=$.logs,Z=$.reset,Q=fo({maxMessageCount:u,resetOnPreviewRestart:h,clientId:K}),B=Q.logs,re=Q.reset,ve=p.useRef(null);p.useEffect(function(){l==null||l(q),ve.current&&(ve.current.scrollTop=ve.current.scrollHeight)},[l,q,B,Y]);var C=Y==="server",b=k==="node";p.useImperativeHandle(t,function(){return{reset:function(){Z(),re()}}});var A=be();return c.jsxs(_t,y({className:A("console",[N((n={height:"100%",background:"$surface1",iframe:{display:"none"}},n[".".concat(ne,"-bridge-frame")]={display:"block",border:0,position:"absolute",left:"$space$2",bottom:"$space$2",zIndex:"$top",height:12,width:"30%",mixBlendMode:"multiply",pointerEvents:"none"},n)),s])},O,{children:[i&&b&&c.jsx(ds,{currentTab:Y,node:b,setCurrentTab:J}),c.jsx("div",{ref:ve,className:A("console-list",[N({overflow:"auto",scrollBehavior:"smooth"})]),children:C?c.jsx(po,{data:B}):c.jsx(cs,{data:q})}),c.jsxs("div",{className:A("console-actions",[N({position:"absolute",bottom:"$space$2",right:"$space$2",display:"flex",gap:"$space$2"})]),children:[w,m&&C&&c.jsx(dt,{onClick:function(){P(),Z(),re()},children:c.jsx(It,{})}),f&&c.jsx(dt,{onClick:function(){Y==="client"?Z():re()},children:c.jsx(ii,{})})]}),j&&c.jsxs(c.Fragment,{children:[c.jsx(Va,{clientId:K}),c.jsx("iframe",{ref:R})]})]}))});N({position:"absolute",zIndex:"$top",variants:{direction:{vertical:{right:0,left:0,height:10,cursor:"ns-resize"},horizontal:{top:0,bottom:0,width:10,cursor:"ew-resize"}}},"@media screen and (max-width: 768px)":{display:"none"}});N({position:"relative",strong:{background:"$colors$clickable",color:"$colors$surface1",minWidth:12,height:12,padding:"0 2px",borderRadius:12,fontSize:8,lineHeight:"12px",position:"absolute",top:0,right:0,fontWeight:"normal"}});N({width:"100%",overflow:"hidden"});N({flexDirection:"row-reverse","@media screen and (max-width: 768px)":{flexFlow:"wrap-reverse !important",flexDirection:"initial"}});var ps={},x=function(){return x=Object.assign||function(t){for(var n,o=1,i=arguments.length;o<i;o++){n=arguments[o];for(var r in n)Object.prototype.hasOwnProperty.call(n,r)&&(t[r]=n[r])}return t},x.apply(this,arguments)};function pe(e,t){var n={};for(var o in e)Object.prototype.hasOwnProperty.call(e,o)&&t.indexOf(o)<0&&(n[o]=e[o]);if(e!=null&&typeof Object.getOwnPropertySymbols=="function")for(var i=0,o=Object.getOwnPropertySymbols(e);i<o.length;i++)t.indexOf(o[i])<0&&Object.prototype.propertyIsEnumerable.call(e,o[i])&&(n[o[i]]=e[o[i]]);return n}function ze(e,t,n,o){function i(r){return r instanceof n?r:new n(function(a){a(r)})}return new(n||(n=Promise))(function(r,a){function u(d){try{s(o.next(d))}catch(f){a(f)}}function l(d){try{s(o.throw(d))}catch(f){a(f)}}function s(d){d.done?r(d.value):i(d.value).then(u,l)}s((o=o.apply(e,[])).next())})}function Ve(e,t){var n={label:0,sent:function(){if(r[0]&1)throw r[1];return r[1]},trys:[],ops:[]},o,i,r,a;return a={next:u(0),throw:u(1),return:u(2)},typeof Symbol=="function"&&(a[Symbol.iterator]=function(){return this}),a;function u(s){return function(d){return l([s,d])}}function l(s){if(o)throw new TypeError("Generator is already executing.");for(;n;)try{if(o=1,i&&(r=s[0]&2?i.return:s[0]?i.throw||((r=i.return)&&r.call(i),0):i.next)&&!(r=r.call(i,s[1])).done)return r;switch(i=0,r&&(s=[s[0]&2,r.value]),s[0]){case 0:case 1:r=s;break;case 4:return n.label++,{value:s[1],done:!1};case 5:n.label++,i=s[1],s=[0];continue;case 7:s=n.ops.pop(),n.trys.pop();continue;default:if(r=n.trys,!(r=r.length>0&&r[r.length-1])&&(s[0]===6||s[0]===2)){n=0;continue}if(s[0]===3&&(!r||s[1]>r[0]&&s[1]<r[3])){n.label=s[1];break}if(s[0]===6&&n.label<r[1]){n.label=r[1],r=s;break}if(r&&n.label<r[2]){n.label=r[2],n.ops.push(s);break}r[2]&&n.ops.pop(),n.trys.pop();continue}s=t.call(e,n)}catch(d){s=[6,d],i=0}finally{o=r=0}if(s[0]&5)throw s[1];return{value:s[0]?s[1]:void 0,done:!0}}}function Se(e,t,n){if(n||arguments.length===2)for(var o=0,i=t.length,r;o<i;o++)(r||!(o in t))&&(r||(r=Array.prototype.slice.call(t,0,o)),r[o]=t[o]);return e.concat(r||Array.prototype.slice.call(t))}var Re=function(e){return c.jsx("svg",x({fill:"currentColor",height:"16",viewBox:"0 0 16 16",width:"16",xmlns:"http://www.w3.org/2000/svg"},e))},vs=function(){return c.jsxs(Re,{viewBox:"0 0 48 48",children:[c.jsx("title",{children:"Sign in"}),c.jsx("path",{d:"M9 42q-1.2 0-2.1-.9Q6 40.2 6 39V9q0-1.2.9-2.1Q7.8 6 9 6h14.55v3H9v30h14.55v3Zm24.3-9.25-2.15-2.15 5.1-5.1h-17.5v-3h17.4l-5.1-5.1 2.15-2.15 8.8 8.8Z"})]})},ms=function(){return c.jsxs(Re,{viewBox:"0 0 48 48",children:[c.jsx("title",{children:"Sign out"}),c.jsx("path",{d:"M9 42q-1.2 0-2.1-.9Q6 40.2 6 39V9q0-1.2.9-2.1Q7.8 6 9 6h14.55v3H9v30h14.55v3Zm24.3-9.25-2.15-2.15 5.1-5.1h-17.5v-3h17.4l-5.1-5.1 2.15-2.15 8.8 8.8Z"})]})},Ft=function(){return c.jsxs(Re,{fill:"none",stroke:"currentColor",children:[c.jsx("title",{children:"Restart script"}),c.jsx("path",{d:"M8 2C4.68629 2 2 4.68629 2 8C2 10.0946 3.07333 11.9385 4.7 13.0118",strokeLinecap:"round"}),c.jsx("path",{d:"M14.0005 7.9998C14.0005 5.82095 12.8391 3.91335 11.1016 2.8623",strokeLinecap:"round"}),c.jsx("path",{d:"M14.0003 2.3335H11.167C10.8908 2.3335 10.667 2.55735 10.667 2.8335V5.66683",strokeLinecap:"round"}),c.jsx("path",{d:"M1.99967 13.6665L4.83301 13.6665C5.10915 13.6665 5.33301 13.4426 5.33301 13.1665L5.33301 10.3332",strokeLinecap:"round"}),c.jsx("path",{d:"M10 10L12 12L10 14",strokeLinecap:"round",strokeLinejoin:"round"}),c.jsx("path",{d:"M14.667 14L12.667 14",strokeLinecap:"round",strokeLinejoin:"round"})]})},hs=function(){return c.jsxs(Re,{children:[c.jsx("title",{children:"Run sandbox"}),c.jsx("path",{d:"M11.0792 8.1078C11.2793 8.25007 11.27 8.55012 11.0616 8.67981L6.02535 11.8135C5.79638 11.956 5.5 11.7913 5.5 11.5216L5.5 8.40703L5.5 4.80661C5.5 4.52735 5.81537 4.36463 6.04296 4.52647L11.0792 8.1078Z"})]})},gs=function(){return c.jsxs(Re,{children:[c.jsx("title",{children:"Click to go back"}),c.jsx("path",{d:"M9.64645 12.3536C9.84171 12.5488 10.1583 12.5488 10.3536 12.3536C10.5488 12.1583 10.5488 11.8417 10.3536 11.6464L9.64645 12.3536ZM10.3536 4.35355C10.5488 4.15829 10.5488 3.84171 10.3536 3.64644C10.1583 3.45118 9.84171 3.45118 9.64645 3.64644L10.3536 4.35355ZM6.07072 7.92929L5.71716 7.57573L6.07072 7.92929ZM10.3536 11.6464L6.42427 7.71716L5.71716 8.42426L9.64645 12.3536L10.3536 11.6464ZM6.42427 8.28284L10.3536 4.35355L9.64645 3.64644L5.71716 7.57573L6.42427 8.28284ZM6.42427 7.71716C6.58048 7.87337 6.58048 8.12663 6.42427 8.28284L5.71716 7.57573C5.48285 7.81005 5.48285 8.18995 5.71716 8.42426L6.42427 7.71716Z"})]})},bs=function(){return c.jsxs(Re,{children:[c.jsx("title",{children:"Click to go forward"}),c.jsx("path",{d:"M6.35355 3.64645C6.15829 3.45118 5.84171 3.45118 5.64645 3.64645C5.45118 3.84171 5.45118 4.15829 5.64645 4.35355L6.35355 3.64645ZM5.64645 11.6464C5.45118 11.8417 5.45118 12.1583 5.64645 12.3536C5.84171 12.5488 6.15829 12.5488 6.35355 12.3536L5.64645 11.6464ZM9.92929 8.07071L10.2828 8.42426L9.92929 8.07071ZM5.64645 4.35355L9.57574 8.28284L10.2828 7.57574L6.35355 3.64645L5.64645 4.35355ZM9.57574 7.71716L5.64645 11.6464L6.35355 12.3536L10.2828 8.42426L9.57574 7.71716ZM9.57574 8.28284C9.41952 8.12663 9.41953 7.87337 9.57574 7.71716L10.2828 8.42426C10.5172 8.18995 10.5172 7.81005 10.2828 7.57574L9.57574 8.28284Z"})]})},ho=function(){return c.jsxs(Re,{children:[c.jsx("title",{children:"Refresh preview"}),c.jsx("path",{clipRule:"evenodd",d:"M3.83325 7.99992C3.83325 5.69867 5.69853 3.83325 7.99934 3.83325C9.81246 3.83325 11.3563 4.99195 11.9285 6.61097C11.9396 6.6425 11.9536 6.67221 11.97 6.69992H8.80005C8.52391 6.69992 8.30005 6.92378 8.30005 7.19992C8.30005 7.47606 8.52391 7.69992 8.80005 7.69992H12.5667C12.8981 7.69992 13.1667 7.43129 13.1667 7.09992V3.33325C13.1667 3.05711 12.9429 2.83325 12.6667 2.83325C12.3906 2.83325 12.1667 3.05711 12.1667 3.33325V4.94608C11.2268 3.66522 9.7106 2.83325 7.99934 2.83325C5.14613 2.83325 2.83325 5.14651 2.83325 7.99992C2.83325 10.8533 5.14613 13.1666 7.99934 13.1666C9.91218 13.1666 11.5815 12.1266 12.474 10.5836C12.6123 10.3446 12.5306 10.0387 12.2915 9.90044C12.0525 9.76218 11.7466 9.84387 11.6084 10.0829C10.8873 11.3296 9.54072 12.1666 7.99934 12.1666C5.69853 12.1666 3.83325 10.3012 3.83325 7.99992Z",fillRule:"evenodd"})]})},ys=function(){return c.jsxs(Re,{fill:"none",stroke:"currentColor",children:[c.jsx("title",{children:"Clean"}),c.jsx("circle",{cx:"7.99998",cy:"8.00004",r:"4.66667",strokeLinecap:"round"}),c.jsx("path",{d:"M4.66669 4.66663L11.3334 11.3333"})]})},xs=function(){return c.jsxs(Re,{fill:"none",stroke:"currentColor",children:[c.jsx("title",{children:"Open on CodeSandbox"}),c.jsx("path",{d:"M6.66665 3.33337H4.33331C3.78103 3.33337 3.33331 3.78109 3.33331 4.33337V11.6667C3.33331 12.219 3.78103 12.6667 4.33331 12.6667H11.6666C12.2189 12.6667 12.6666 12.219 12.6666 11.6667V9.33337",strokeLinecap:"round"}),c.jsx("path",{d:"M10 3.33337H12.5667C12.6219 3.33337 12.6667 3.37815 12.6667 3.43337V6.00004",strokeLinecap:"round"}),c.jsx("path",{d:"M7.33331 8.66668L12.5333 3.46667",strokeLinecap:"round"})]})},ws=function(){return c.jsxs(Re,{stroke:"currentColor",children:[c.jsx("title",{children:"Close file"}),c.jsx("path",{d:"M12 4L4 12",strokeLinecap:"round"}),c.jsx("path",{d:"M4 4L12 12",strokeLinecap:"round"})]})},Ss=function(){return c.jsxs(Re,{children:[c.jsx("title",{children:"Open browser console"}),c.jsx("path",{d:"M5.65871 3.62037C5.44905 3.44066 5.1334 3.46494 4.95368 3.6746C4.77397 3.88427 4.79825 4.19992 5.00792 4.37963L5.65871 3.62037ZM5.00792 11.6204C4.79825 11.8001 4.77397 12.1157 4.95368 12.3254C5.1334 12.5351 5.44905 12.5593 5.65871 12.3796L5.00792 11.6204ZM9.9114 7.92407L10.2368 7.54445L9.9114 7.92407ZM5.00792 4.37963L9.586 8.3037L10.2368 7.54445L5.65871 3.62037L5.00792 4.37963ZM9.586 7.6963L5.00792 11.6204L5.65871 12.3796L10.2368 8.45555L9.586 7.6963ZM9.586 8.3037C9.39976 8.14407 9.39976 7.85594 9.586 7.6963L10.2368 8.45555C10.5162 8.2161 10.5162 7.7839 10.2368 7.54445L9.586 8.3037Z"}),c.jsx("path",{d:"M10 11.5C9.72386 11.5 9.5 11.7239 9.5 12C9.5 12.2761 9.72386 12.5 10 12.5V11.5ZM14.6667 12.5C14.9428 12.5 15.1667 12.2761 15.1667 12C15.1667 11.7239 14.9428 11.5 14.6667 11.5V12.5ZM10 12.5H14.6667V11.5H10V12.5Z"})]})},qt,tt={colors:{surface1:"#ffffff",surface2:"#EFEFEF",surface3:"#F3F3F3",disabled:"#C5C5C5",base:"#323232",clickable:"#808080",hover:"#4D4D4D",accent:"#3973E0",error:"#EA3323",errorSurface:"#FCF1F0",warning:"#6A4516",warningSurface:"#FEF2C0"},syntax:{plain:"#151515",comment:{color:"#999",fontStyle:"italic"},keyword:"#7C5AE3",tag:"#0971F1",punctuation:"#3B3B3B",definition:"#85A600",property:"#3B3B3B",static:"#3B3B3B",string:"#2E6BD0"},font:{body:'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"',mono:'"Fira Mono", "DejaVu Sans Mono", Menlo, Consolas, "Liberation Mono", Monaco, "Lucida Console", monospace',size:"13px",lineHeight:"20px"}},fn={colors:{surface1:"#151515",surface2:"#252525",surface3:"#2F2F2F",disabled:"#4D4D4D",base:"#808080",clickable:"#999999",hover:"#C5C5C5",accent:"#E5E5E5",error:"#FFB4A6",errorSurface:"#690000",warning:"#E7C400",warningSurface:"#3A3000"},syntax:{plain:"#FFFFFF",comment:{color:"#757575",fontStyle:"italic"},keyword:"#77B7D7",tag:"#DFAB5C",punctuation:"#ffffff",definition:"#86D9CA",property:"#77B7D7",static:"#C64640",string:"#977CDC"},font:{body:'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"',mono:'"Fira Mono", "DejaVu Sans Mono", Menlo, Consolas, "Liberation Mono", Monaco, "Lucida Console", monospace',size:"13px",lineHeight:"20px"}},Cs={light:tt,dark:fn,auto:typeof window<"u"&&!((qt=window==null?void 0:window.matchMedia)===null||qt===void 0)&&qt.call(window,"(prefers-color-scheme: dark)").matches?fn:tt},At=function(e){var t=e.lastIndexOf("/");return e.slice(t+1)},js=function(e,t){var n=(e[0]==="/"?e.slice(1):e).split("/"),o=[];if(n.length===1)o.unshift(n[0]);else for(var i=0;i<t.length;i++)for(var r=t[i].split("/"),a=1;a<=n.length;a++){var u=n[n.length-a],l=r[r.length-a];if(o.length<a&&o.unshift(u),u!==l)break}return o.length<n.length&&o.unshift(".."),o.join("/")},Xn=function(e){var t=0,n=0,o=0;if(e.startsWith("#")){if(e.length<7)return!0;t=parseInt(e.substr(1,2),16),n=parseInt(e.substr(3,2),16),o=parseInt(e.substr(5,2),16)}else{var i=e.replace("rgb(","").replace("rgba(","").replace(")","").split(",");if(i.length<3)return!0;t=parseInt(i[0],10),n=parseInt(i[1],10),o=parseInt(i[2],10)}var r=(t*299+n*587+o*114)/1e3;return r<128},Es=0,rt=function(){var e=+(Date.now().toString(10).substr(0,4)+Es++);return e.toString(16)},pt=function(){return""},pn=function(){return pt},go=Object.getOwnPropertyDescriptors({toString:pt});Object.defineProperties(pt,go);Object.defineProperties(pn,go);var ks={createTheme:pt,css:pn,getCssText:pt,keyframes:pn},Mt,ge="sp",Ns=(Mt=ks,Mt.createTheme);Mt.getCssText;var bo=Mt.keyframes,$s={space:new Array(11).fill(" ").reduce(function(e,t,n){var o;return x(x({},e),(o={},o[n+1]="".concat((n+1)*4,"px"),o))},{}),border:{radius:"4px"},layout:{height:"300px",headerHeight:"40px"},transitions:{default:"150ms ease"},zIndices:{base:"1",overlay:"2",top:"3"}},Ts=function(e){var t=Object.entries(e.syntax),n=t.reduce(function(o,i){var r,a=i[0],u=i[1],l=(r={},r["color-".concat(a)]=u,r);return typeof u=="object"&&(l=Object.entries(u).reduce(function(s,d){var f,v=d[0],m=d[1];return x(x({},s),(f={},f["".concat(v,"-").concat(a)]=m,f))},{})),x(x({},o),l)},{});return x(x({},$s),{colors:e.colors,font:e.font,syntax:n})},Os=function(e){var t,n,o,i,r;e===void 0&&(e="light");var a="default";if(typeof e=="string"){var u=Cs[e];if(!u)throw new Error("[sandpack-react]: invalid theme '".concat(e,"' provided."));return{theme:u,id:e,mode:Xn(u.colors.surface1)?"dark":"light"}}var l=Xn((n=(t=e==null?void 0:e.colors)===null||t===void 0?void 0:t.surface1)!==null&&n!==void 0?n:tt.colors.surface1)?"dark":"light",s=l==="dark"?fn:tt,d=x(x({},s.colors),(o=e==null?void 0:e.colors)!==null&&o!==void 0?o:{}),f=x(x({},s.syntax),(i=e==null?void 0:e.syntax)!==null&&i!==void 0?i:{}),v=x(x({},s.font),(r=e==null?void 0:e.font)!==null&&r!==void 0?r:{}),m={colors:d,syntax:f,font:v},g=e?As(JSON.stringify(m)):a;return{theme:m,id:"sp-".concat(g),mode:l}},As=function(e){for(var t=0,n=0;n<e.length;t&=t)t=31*t+e.charCodeAt(n++);return Math.abs(t)},D=function(){return""};D.toString=D;var yo=p.createContext({}),Ms=function(e){var t=e.children,n=e.classes;return c.jsx(yo.Provider,{value:n||{},children:t})},ye=function(){var e=p.useContext(yo);return function(n,o){o===void 0&&(o=[]);var i="".concat(ge,"-").concat(n);return Ls.apply(void 0,Se(Se([],o,!1),[i,e[i]],!1))}},Ls=function(){for(var e=[],t=0;t<arguments.length;t++)e[t]=arguments[t];return e.filter(Boolean).join(" ")},Rs=D,Tn=p.createContext({theme:tt,id:"light",mode:"light"}),Is=function(e){var t=e.theme,n=e.children,o=e.className,i=pe(e,["theme","children","className"]),r=p.useState(t),a=r[0],u=r[1],l=Os(a),s=l.theme,d=l.id,f=l.mode,v=ye(),m=p.useMemo(function(){return Ns(d,Ts(s))},[s,d]);return p.useEffect(function(){if(t!=="auto"){u(t);return}var g=function(h){var S=h.matches;u(S?"dark":"light")};return window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change",g),function(){window.matchMedia("(prefers-color-scheme: dark)").removeEventListener("change",g)}},[t]),c.jsx(Tn.Provider,{value:{theme:s,id:d,mode:f},children:c.jsx("div",x({className:v("wrapper",[m,Rs(),o])},i,{children:n}))})};Tn.Consumer;var de={"/styles.css":{code:`body {
  font-family: sans-serif;
  -webkit-font-smoothing: auto;
  -moz-font-smoothing: auto;
  -moz-osx-font-smoothing: grayscale;
  font-smoothing: auto;
  text-rendering: optimizeLegibility;
  font-smooth: always;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
}

h1 {
  font-size: 1.5rem;
}`}},_s={files:{"/src/styles.css":de["/styles.css"],"/src/pages/index.astro":{code:`---
import "../styles.css";
const data = "world";
---

<h1>Hello {data}</h1>

<style>
  h1 {
    font-size: 1.5rem;
  }
</style>`},".env":{code:'ASTRO_TELEMETRY_DISABLED="1"'},"/package.json":{code:JSON.stringify({dependencies:{astro:"^1.6.12","esbuild-wasm":"^0.15.16"},scripts:{dev:"astro dev",start:"astro dev",build:"astro build",preview:"astro preview",astro:"astro"}})}},main:"/src/pages/index.astro",environment:"node"},Ds={files:x(x({},de),{"/pages/_app.js":{code:`import '../styles.css'

export default function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />
}`},"/pages/index.js":{code:`export default function Home({ data }) {
  return (
    <div>
      <h1>Hello {data}</h1>
    </div>
  );
}
  
export function getServerSideProps() {
  return {
    props: { data: "world" },
  }
}
`},"/next.config.js":{code:`/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
}

module.exports = nextConfig
`},"/package.json":{code:JSON.stringify({name:"my-app",version:"0.1.0",private:!0,scripts:{dev:"NEXT_TELEMETRY_DISABLED=1 next dev",build:"next build",start:"next start",lint:"next lint"},dependencies:{next:"12.1.6",react:"18.2.0","react-dom":"18.2.0","@next/swc-wasm-nodejs":"12.1.6"}})}}),main:"/pages/index.js",environment:"node"},Fs={files:{"/index.js":{code:`const http = require('http');

const hostname = '127.0.0.1';
const port = 3000;

const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html');
  res.end('Hello world');
});

server.listen(port, hostname, () => {
  console.log(\`Server running at http://\${hostname}:\${port}/\`);
});`},"/package.json":{code:JSON.stringify({dependencies:{},scripts:{start:"node index.js"},main:"index.js"})}},main:"/index.js",environment:"node"},Ps={files:x(x({},de),{"/index.js":{code:`import "./styles.css";

document.getElementById("app").innerHTML = \`
<h1>Hello world</h1>
\`;
`},"/index.html":{code:`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite App</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/index.js"><\/script>
  </body>
</html>
`},"/package.json":{code:JSON.stringify({scripts:{dev:"vite",build:"vite build",preview:"vite preview"},devDependencies:{vite:"4.1.4","esbuild-wasm":"0.17.12"}})}}),main:"/index.js",environment:"node"},Bs={files:x(x({},de),{"/App.jsx":{code:`export default function App() {
  const data = "world"

  return <h1>Hello {data}</h1>
}
`},"/index.jsx":{code:`import { render } from "preact";
import "./styles.css";

import App from "./App";

const root = document.getElementById("root");
render(<App />, root);
`},"/index.html":{code:`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/index.jsx"><\/script>
  </body>
</html>
`},"/package.json":{code:JSON.stringify({scripts:{dev:"vite",build:"vite build",preview:"vite preview"},dependencies:{preact:"^10.16.0"},devDependencies:{"@preact/preset-vite":"^2.5.0",vite:"4.1.4","esbuild-wasm":"0.17.12"}})},"/vite.config.js":{code:`import { defineConfig } from "vite";
import preact from '@preact/preset-vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [preact()],
});
`}}),main:"/App.jsx",environment:"node"},Hs={files:x(x({},de),{"/App.tsx":{code:`export default function App() {
  const data: string = "world"

  return <h1>Hello {data}</h1>
}
`},"/index.tsx":{code:`import { render } from "preact";
import "./styles.css";

import App from "./App";

const root = document.getElementById("root") as HTMLElement;
render(<App />, root);
`},"/index.html":{code:`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/index.tsx"><\/script>
  </body>
</html>
`},"/tsconfig.json":{code:JSON.stringify({compilerOptions:{target:"ESNext",useDefineForClassFields:!0,lib:["DOM","DOM.Iterable","ESNext"],allowJs:!1,skipLibCheck:!0,esModuleInterop:!1,allowSyntheticDefaultImports:!0,strict:!0,forceConsistentCasingInFileNames:!0,module:"ESNext",moduleResolution:"Node",resolveJsonModule:!0,isolatedModules:!0,noEmit:!0,jsx:"react-jsx",jsxImportSource:"preact"},include:["src"],references:[{path:"./tsconfig.node.json"}]},null,2)},"/tsconfig.node.json":{code:JSON.stringify({compilerOptions:{composite:!0,module:"ESNext",moduleResolution:"Node",allowSyntheticDefaultImports:!0},include:["vite.config.ts"]},null,2)},"/package.json":{code:JSON.stringify({scripts:{dev:"vite",build:"tsc && vite build",preview:"vite preview"},dependencies:{preact:"^10.16.0"},devDependencies:{"@preact/preset-vite":"^2.5.0",typescript:"^4.9.5",vite:"4.1.4","esbuild-wasm":"^0.17.12"}},null,2)},"/vite-env.d.ts":{code:'/// <reference types="vite/client" />'},"/vite.config.ts":{code:`import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [preact()],
})
`}}),main:"/App.tsx",environment:"node"},Us={files:x(x({},de),{"/App.jsx":{code:`export default function App() {
  const data = "world"

  return <h1>Hello {data}</h1>
}
`},"/index.jsx":{code:`import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

import App from "./App";

const root = createRoot(document.getElementById("root"));
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);`},"/index.html":{code:`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/index.jsx"><\/script>
  </body>
</html>
`},"/package.json":{code:JSON.stringify({scripts:{dev:"vite",build:"vite build",preview:"vite preview"},dependencies:{react:"^18.2.0","react-dom":"^18.2.0"},devDependencies:{"@vitejs/plugin-react":"3.1.0",vite:"4.1.4","esbuild-wasm":"0.17.12"}})},"/vite.config.js":{code:`import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
});
`}}),main:"/App.jsx",environment:"node"},zs={files:x(x({},de),{"/App.tsx":{code:`export default function App() {
  const data: string = "world"

  return <h1>Hello {data}</h1>
}
`},"/index.tsx":{code:`import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

import App from "./App";
import React from "react";

const root = createRoot(document.getElementById("root") as HTMLElement);
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
`},"/index.html":{code:`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/index.tsx"><\/script>
  </body>
</html>
`},"/tsconfig.json":{code:JSON.stringify({compilerOptions:{target:"ESNext",useDefineForClassFields:!0,lib:["DOM","DOM.Iterable","ESNext"],allowJs:!1,skipLibCheck:!0,esModuleInterop:!1,allowSyntheticDefaultImports:!0,strict:!0,forceConsistentCasingInFileNames:!0,module:"ESNext",moduleResolution:"Node",resolveJsonModule:!0,isolatedModules:!0,noEmit:!0,jsx:"react-jsx"},include:["src"],references:[{path:"./tsconfig.node.json"}]},null,2)},"/tsconfig.node.json":{code:JSON.stringify({compilerOptions:{composite:!0,module:"ESNext",moduleResolution:"Node",allowSyntheticDefaultImports:!0},include:["vite.config.ts"]},null,2)},"/package.json":{code:JSON.stringify({scripts:{dev:"vite",build:"tsc && vite build",preview:"vite preview"},dependencies:{react:"^18.2.0","react-dom":"^18.2.0"},devDependencies:{"@types/react":"^18.0.28","@types/react-dom":"^18.0.11","@vitejs/plugin-react":"^3.1.0",typescript:"^4.9.5",vite:"4.1.4","esbuild-wasm":"^0.17.12"}},null,2)},"/vite-env.d.ts":{code:'/// <reference types="vite/client" />'},"/vite.config.ts":{code:`import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
})
`}}),main:"/App.tsx",environment:"node"},Vs={files:{"/src/styles.css":de["/styles.css"],"/src/App.svelte":{code:`<script>
const data = "world";
<\/script>

<h1>Hello {data}</h1>

<style>
h1 {
  font-size: 1.5rem;
}
</style>`},"/src/main.js":{code:`import App from './App.svelte'
import "./styles.css"

const app = new App({
  target: document.getElementById('app'),
})

export default app`},"/index.html":{code:`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite App</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"><\/script>
  </body>
</html>
`},"/vite.config.js":{code:`import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [svelte()],
})`},"/package.json":{code:JSON.stringify({type:"module",scripts:{dev:"vite"},devDependencies:{"@sveltejs/vite-plugin-svelte":"^2.0.2",svelte:"^3.55.1",vite:"4.0.4","esbuild-wasm":"^0.17.12"}})}},main:"/src/App.svelte",environment:"node"},Js={files:{"/src/styles.css":de["/styles.css"],"/src/App.svelte":{code:`<script lang="ts">
const data: string = "world";
<\/script>

<h1>Hello {data}</h1>

<style>
h1 {
  font-size: 1.5rem;
}
</style>`},"/src/main.ts":{code:`import App from './App.svelte'
import "./styles.css"

const app = new App({
  target: document.getElementById('app'),
})

export default app`},"/index.html":{code:`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite App</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"><\/script>
  </body>
</html>
`},"/vite-env.d.ts":{code:`/// <reference types="svelte" />
/// <reference types="vite/client" />`},"svelte.config.js":{code:`import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

export default {
  // Consult https://svelte.dev/docs#compile-time-svelte-preprocess
  // for more information about preprocessors
  preprocess: vitePreprocess(),
}
`},"/vite.config.ts":{code:`import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [svelte()],
})`},"tsconfig.json":{code:JSON.stringify({extends:"@tsconfig/svelte/tsconfig.json",compilerOptions:{target:"ESNext",useDefineForClassFields:!0,module:"ESNext",resolveJsonModule:!0,allowJs:!0,checkJs:!0,isolatedModules:!0},include:["src/**/*.d.ts","src/**/*.ts","src/**/*.js","src/**/*.svelte"],references:[{path:"./tsconfig.node.json"}]},null,2)},"tsconfig.node.json":{code:JSON.stringify({compilerOptions:{composite:!0,module:"ESNext",moduleResolution:"Node"},include:["vite.config.ts"]},null,2)},"/package.json":{code:JSON.stringify({type:"module",scripts:{dev:"vite"},devDependencies:{"@sveltejs/vite-plugin-svelte":"^2.0.2","@tsconfig/svelte":"^3.0.0",svelte:"^3.55.1","svelte-check":"^2.10.3",tslib:"^2.5.0",vite:"4.1.4","esbuild-wasm":"^0.17.12"}},null,2)}},main:"/src/App.svelte",environment:"node"},Ws={files:{"/src/styles.css":de["/styles.css"],"/src/App.vue":{code:`<script setup>
import { ref } from "vue";

const data = ref("world");
<\/script>

<template>
  <h1>Hello {{ data }}</h1>
</template>

<style>
h1 {
  font-size: 1.5rem;
}
</style>`},"/src/main.js":{code:`import { createApp } from 'vue'
import App from './App.vue'
import "./styles.css"
            
createApp(App).mount('#app')            
`},"/index.html":{code:`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite App</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"><\/script>
  </body>
</html>
`},"/vite.config.js":{code:`import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()]
})
`},"/package.json":{code:JSON.stringify({scripts:{dev:"vite",build:"vite build",preview:"vite preview"},dependencies:{vue:"^3.2.45"},devDependencies:{"@vitejs/plugin-vue":"3.2.0",vite:"4.1.4","esbuild-wasm":"0.17.12"}})}},main:"/src/App.vue",environment:"node"},Ys={files:{"/src/styles.css":de["/styles.css"],"/src/App.vue":{code:`<script setup lang="ts">
import { ref } from "vue";

const data = ref<string>("world");
<\/script>

<template>
  <h1>Hello {{ data }}</h1>
</template>

<style>
h1 {
  font-size: 1.5rem;
}
</style>`},"/src/main.ts":{code:`import { createApp } from 'vue'
import App from './App.vue'
import "./styles.css"

createApp(App).mount('#app')
`},"/index.html":{code:`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite App</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"><\/script>
  </body>
</html>
`},"/vite-env.d.ts":{code:'/// <reference types="vite/client" />'},"/vite.config.ts":{code:`import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()]
})
`},"tsconfig.json":{code:JSON.stringify({compilerOptions:{target:"ESNext",useDefineForClassFields:!0,module:"ESNext",moduleResolution:"Node",strict:!0,jsx:"preserve",resolveJsonModule:!0,isolatedModules:!0,esModuleInterop:!0,lib:["ESNext","DOM"],skipLibCheck:!0,noEmit:!0},include:["src/**/*.ts","src/**/*.d.ts","src/**/*.tsx","src/**/*.vue"],references:[{path:"./tsconfig.node.json"}]},null,2)},"tsconfig.node.json":{code:JSON.stringify({compilerOptions:{composite:!0,module:"ESNext",moduleResolution:"Node",allowSyntheticDefaultImports:!0},include:["vite.config.ts"]},null,2)},"/package.json":{code:JSON.stringify({scripts:{dev:"vite",build:"tsc && vite build",preview:"vite preview"},dependencies:{vue:"^3.2.47"},devDependencies:{"@vitejs/plugin-vue":"^4.0.0",vite:"4.1.4","vue-tsc":"^1.2.0",typescript:"^4.9.5","esbuild-wasm":"^0.17.12"}},null,2)}},main:"/src/App.vue",environment:"node"},Zs={files:{"/src/app/app.component.css":de["/styles.css"],"/src/app/app.component.html":{code:`<div>
<h1>{{ helloWorld }}</h1>
</div>     
`},"/src/app/app.component.ts":{code:`import { Component } from "@angular/core";

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.css"]
})
export class AppComponent {
  helloWorld = "Hello world";
}           
`},"/src/app/app.module.ts":{code:`import { BrowserModule } from "@angular/platform-browser";
import { NgModule } from "@angular/core";
      
import { AppComponent } from "./app.component";
      
@NgModule({
  declarations: [AppComponent],
  imports: [BrowserModule],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule {}       
`},"/src/index.html":{code:`<!doctype html>
<html lang="en">
      
<head>
  <meta charset="utf-8">
  <title>Angular</title>
  <base href="/">
      
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" type="image/x-icon" href="favicon.ico">
</head>
      
<body>
   <app-root></app-root>
</body>
      
</html>
`},"/src/main.ts":{code:`import { enableProdMode } from "@angular/core";
import { platformBrowserDynamic } from "@angular/platform-browser-dynamic";
      
import { AppModule } from "./app/app.module";      

platformBrowserDynamic()
  .bootstrapModule(AppModule)
  .catch(err => console.log(err));
      
`},"/src/polyfills.ts":{code:`import "core-js/proposals/reflect-metadata";   
      import "zone.js/dist/zone";
`},"/package.json":{code:JSON.stringify({dependencies:{"@angular/core":"^11.2.0","@angular/platform-browser":"^11.2.0","@angular/platform-browser-dynamic":"^11.2.0","@angular/common":"^11.2.0","@angular/compiler":"^11.2.0","zone.js":"0.11.3","core-js":"3.8.3",rxjs:"6.6.3"},main:"/src/main.ts"})}},main:"/src/app/app.component.ts",environment:"angular-cli"},qs={files:x(x({},de),{"/App.js":{code:`export default function App() {
  return <h1>Hello world</h1>
}
`},"/index.js":{code:`import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

import App from "./App";

const root = createRoot(document.getElementById("root"));
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);`},"/public/index.html":{code:`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`},"/package.json":{code:JSON.stringify({dependencies:{react:"^18.0.0","react-dom":"^18.0.0","react-scripts":"^5.0.0"},main:"/index.js"})}}),main:"/App.js",environment:"create-react-app"},Gs={files:x(x({},de),{"tsconfig.json":{code:`{
  "include": [
    "./**/*"
  ],
  "compilerOptions": {
    "strict": true,
    "esModuleInterop": true,
    "lib": [ "dom", "es2015" ],
    "jsx": "react-jsx"
  }
}`},"/App.tsx":{code:`export default function App(): JSX.Element {
  return <h1>Hello world</h1>
}
`},"/index.tsx":{code:`import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

import App from "./App";

const root = createRoot(document.getElementById("root"));
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);`},"/public/index.html":{code:`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`},"/package.json":{code:JSON.stringify({dependencies:{react:"^18.0.0","react-dom":"^18.0.0","react-scripts":"^4.0.0"},devDependencies:{"@types/react":"^18.0.0","@types/react-dom":"^18.0.0",typescript:"^4.0.0"},main:"/index.tsx"})}}),main:"/App.tsx",environment:"create-react-app"},Ks={files:x(x({},de),{"/App.tsx":{code:`import { Component } from "solid-js";

const App: Component = () => {
  return <h1>Hello world</h1>
};

export default App;`},"/index.tsx":{code:`import { render } from "solid-js/web";
import App from "./App";

import "./styles.css";

render(() => <App />, document.getElementById("app"));`},"/index.html":{code:`<html>
<head>
  <title>Parcel Sandbox</title>
  <meta charset="UTF-8" />
</head>
<body>
  <div id="app"></div>
  <script src="src/index.tsx"><\/script>
</body>
</html>`},"/package.json":{code:JSON.stringify({dependencies:{"solid-js":"1.3.15"},main:"/index.tsx"})}}),main:"/App.tsx",environment:"solid"},Xs={files:x(x({},de),{"/App.svelte":{code:`<style>
  h1 {
    font-size: 1.5rem;
  }
</style>

<script>
  let name = 'world';
<\/script>

<main>
  <h1>Hello {name}</h1>
</main>`},"/index.js":{code:`import App from "./App.svelte";
import "./styles.css";

const app = new App({
  target: document.body
});

export default app;
      `},"/public/index.html":{code:`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf8" />
    <meta name="viewport" content="width=device-width" />

    <title>Svelte app</title>

    <link rel="stylesheet" href="public/bundle.css" />
  </head>

  <body>
    <script src="bundle.js"><\/script>
  </body>
</html>`},"/package.json":{code:JSON.stringify({dependencies:{svelte:"^3.0.0"},main:"/index.js"})}}),main:"/App.svelte",environment:"svelte"},Qs={files:{"tsconfig.json":{code:`{
  "include": [
    "./**/*"
  ],
  "compilerOptions": {
    "strict": true,
    "esModuleInterop": true,
    "lib": [ "dom", "es2015" ],
    "jsx": "react-jsx"
  }
}`},"/add.ts":{code:"export const add = (a: number, b: number): number => a + b;"},"/add.test.ts":{code:`import { add } from './add';

describe('add', () => {
  test('Commutative Law of Addition', () => {
    expect(add(1, 2)).toBe(add(2, 1));
  });
});`},"package.json":{code:JSON.stringify({dependencies:{},devDependencies:{typescript:"^4.0.0"},main:"/add.ts"})}},main:"/add.test.ts",environment:"parcel",mode:"tests"},ec={files:x(x({},de),{"/index.js":{code:`import "./styles.css";

document.getElementById("app").innerHTML = \`
<h1>Hello world</h1>
\`;
`},"/index.html":{code:`<!DOCTYPE html>
<html>

<head>
  <title>Parcel Sandbox</title>
  <meta charset="UTF-8" />
</head>

<body>
  <div id="app"></div>

  <script src="index.js">
  <\/script>
</body>

</html>`},"/package.json":{code:JSON.stringify({dependencies:{},main:"/index.js"})}}),main:"/index.js",environment:"parcel"},tc={files:x(x({},de),{"tsconfig.json":{code:`{
  "compilerOptions": {
    "strict": true,
    "module": "commonjs",
    "jsx": "preserve",
    "esModuleInterop": true,
    "sourceMap": true,
    "allowJs": true,
    "lib": [
      "es6",
      "dom"
    ],
    "rootDir": "src",
    "moduleResolution": "node"
  }
}`},"/index.ts":{code:`import "./styles.css";

document.getElementById("app").innerHTML = \`
<h1>Hello world</h1>
\`;
`},"/index.html":{code:`<!DOCTYPE html>
<html>

<head>
  <title>Parcel Sandbox</title>
  <meta charset="UTF-8" />
</head>

<body>
  <div id="app"></div>

  <script src="index.ts">
  <\/script>
</body>

</html>`},"/package.json":{code:JSON.stringify({dependencies:{},devDependencies:{typescript:"^4.0.0"},main:"/index.ts"})}}),main:"/index.ts",environment:"parcel"},nc={files:{"/src/styles.css":de["/styles.css"],"/src/App.vue":{code:`<template>
  <h1>Hello {{ msg }}</h1>
</template>

<script setup>
import { ref } from 'vue';
const msg = ref('world');
<\/script>`},"/src/main.js":{code:`import { createApp } from 'vue'
import App from './App.vue'
import "./styles.css";

createApp(App).mount('#app')
`},"/public/index.html":{code:`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width,initial-scale=1.0" />
    <title>codesandbox</title>
  </head>
  <body>
    <noscript>
      <strong
        >We're sorry but codesandbox doesn't work properly without JavaScript
        enabled. Please enable it to continue.</strong
      >
    </noscript>
    <div id="app"></div>
    <!-- built files will be auto injected -->
  </body>
</html>
`},"/package.json":{code:JSON.stringify({name:"vue3",version:"0.1.0",private:!0,main:"/src/main.js",scripts:{serve:"vue-cli-service serve",build:"vue-cli-service build"},dependencies:{"core-js":"^3.26.1",vue:"^3.2.45"},devDependencies:{"@vue/cli-plugin-babel":"^5.0.8","@vue/cli-service":"^5.0.8"}})}},main:"/src/App.vue",environment:"vue-cli"},rc={files:{"/src/styles.css":de["/styles.css"],"/src/App.vue":{code:`<template>
  <h1>Hello {{ msg }}</h1>
</template>

<script setup lang="ts">
import { ref } from 'vue';
const msg = ref<string>('world');
<\/script>`},"/src/main.ts":{code:`import { createApp } from 'vue'
import App from './App.vue'
import "./styles.css";

createApp(App).mount('#app')
`},"/src/shims-vue.d.ts":`/* eslint-disable */
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}`,"/public/index.html":{code:`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width,initial-scale=1.0" />
    <title>codesandbox</title>
  </head>
  <body>
    <noscript>
      <strong
        >We're sorry but codesandbox doesn't work properly without JavaScript
        enabled. Please enable it to continue.</strong
      >
    </noscript>
    <div id="app"></div>
    <!-- built files will be auto injected -->
  </body>
</html>
`},"/package.json":{code:JSON.stringify({name:"vue3-ts",version:"0.1.0",private:!0,main:"/src/main.ts",scripts:{serve:"vue-cli-service serve",build:"vue-cli-service build"},dependencies:{"core-js":"^3.26.1",vue:"^3.2.45"},devDependencies:{"@vue/cli-plugin-babel":"^5.0.8","@vue/cli-plugin-typescript":"^5.0.8","@vue/cli-service":"^5.0.8",typescript:"^4.9.3"}})},"/tsconfig.json":{code:JSON.stringify({compilerOptions:{target:"esnext",module:"esnext",strict:!0,jsx:"preserve",moduleResolution:"node",experimentalDecorators:!0,skipLibCheck:!0,esModuleInterop:!0,allowSyntheticDefaultImports:!0,forceConsistentCasingInFileNames:!0,useDefineForClassFields:!0,sourceMap:!1,baseUrl:".",types:["webpack-env"],paths:{"@/*":["src/*"]},lib:["esnext","dom","dom.iterable","scripthost"]},include:["src/**/*.ts","src/**/*.tsx","src/**/*.vue","tests/**/*.ts","tests/**/*.tsx"],exclude:["node_modules"]})}},main:"/src/App.vue",environment:"vue-cli"},oc={files:x(x({},de),{"/index.html":{code:`<!DOCTYPE html>
<html>

<head>
  <title>Parcel Sandbox</title>
  <meta charset="UTF-8" />
  <link rel="stylesheet" href="/styles.css" />
</head>

<body>
  <h1>Hello world</h1>
</body>

</html>`},"/package.json":{code:JSON.stringify({dependencies:{},main:"/index.html"})}}),main:"/index.html",environment:"static"},Qn={static:oc,angular:Zs,react:qs,"react-ts":Gs,solid:Ks,svelte:Xs,"test-ts":Qs,"vanilla-ts":tc,vanilla:ec,vue:nc,"vue-ts":rc,node:Fs,nextjs:Ds,vite:Ps,"vite-react":Us,"vite-react-ts":zs,"vite-preact":Bs,"vite-preact-ts":Hs,"vite-vue":Ws,"vite-vue-ts":Ys,"vite-svelte":Vs,"vite-svelte-ts":Js,astro:_s},vn=function(e){var t,n,o,i,r,a,u=Me(e.files),l=ic({template:e.template,customSetup:e.customSetup,files:u}),s=Me((n=(t=e.options)===null||t===void 0?void 0:t.visibleFiles)!==null&&n!==void 0?n:[]),d=!((o=e.options)===null||o===void 0)&&o.activeFile?er((i=e.options)===null||i===void 0?void 0:i.activeFile,l.files):void 0;s.length===0&&u&&Object.keys(u).forEach(function(m){var g=u[m];if(typeof g=="string"){s.push(m);return}!d&&g.active&&(d=m,g.hidden===!0&&s.push(m)),g.hidden||s.push(m)}),s.length===0&&(s=[l.main]),l.entry&&!l.files[l.entry]&&(l.entry=er(l.entry,l.files)),!d&&l.main&&(d=l.main),(!d||!l.files[d])&&(d=s[0]),s.includes(d)||s.push(d);var f=wn(l.files,(r=l.dependencies)!==null&&r!==void 0?r:{},(a=l.devDependencies)!==null&&a!==void 0?a:{},l.entry),v=s.filter(function(m){return f[m]});return{visibleFiles:v,activeFile:d,files:f,environment:l.environment,shouldUpdatePreview:!0}},er=function(e,t){var n=Me(t),o=Me(e);if(o in n)return o;if(!e)return null;for(var i=null,r=0,a=[".js",".jsx",".ts",".tsx"];!i&&r<a.length;){var u=o.split(".")[0],l="".concat(u).concat(a[r]);n[l]!==void 0&&(i=l),r++}return i},ic=function(e){var t=e.files,n=e.template,o=e.customSetup;if(!n){if(!o){var i=Qn.vanilla;return x(x({},i),{files:x(x({},i.files),Ct(t))})}if(!t||Object.keys(t).length===0)throw new Error("[sandpack-react]: without a template, you must pass at least one file");return x(x({},o),{files:Ct(t)})}var r=Qn[n];if(!r)throw new Error('[sandpack-react]: invalid template "'.concat(n,'" provided'));return!o&&!t?r:{files:Ct(x(x({},r.files),t)),dependencies:x(x({},r.dependencies),o==null?void 0:o.dependencies),devDependencies:x(x({},r.devDependencies),o==null?void 0:o.devDependencies),entry:Me(o==null?void 0:o.entry),main:r.main,environment:(o==null?void 0:o.environment)||r.environment}},Ct=function(e){return e?Object.keys(e).reduce(function(t,n){return typeof e[n]=="string"?t[n]={code:e[n]}:t[n]=e[n],t},{}):{}},ac=function(e,t){var n=p.useState({editorState:"pristine"}),o=n[0],i=n[1],r=vn(e),a=Lt(r.files,t)?"pristine":"dirty";return a!==o.editorState&&i(function(u){return x(x({},u),{editorState:a})}),o},xo=function(){return typeof p.useId=="function"?p.useId():rt()},tr=9,sc=ps.SANDPACK_CLIENT_VERSION,cc=function(e){if(typeof p.useId=="function"){var t=p.useId();return function(){return ze(void 0,void 0,void 0,function(){var n,o;return Ve(this,function(i){switch(i.label){case 0:return n=Object.entries(e).map(function(r,a){return r+"|"+a}).join("|||"),[4,lc(n+t+sc)];case 1:return o=i.sent(),[2,nr(o.replace(/:/g,"sp").replace(/[^a-zA-Z]/g,""),tr)]}})})}}else return function(){return nr(rt(),tr)}};function nr(e,t){return e.length>t?e.slice(0,t):e.padEnd(t,"s")}function lc(e){return ze(this,void 0,void 0,function(){var t,n,o,i;return Ve(this,function(r){switch(r.label){case 0:return t=new TextEncoder,n=t.encode(e),[4,crypto.subtle.digest("SHA-256",n)];case 1:return o=r.sent(),i=Array.from(new Uint8Array(o)),[2,btoa(String.fromCharCode.apply(String,i))]}})})}var uc=4e4,dc=function(e,t){var n,o,i,r=e.options,a=e.customSetup,u=e.teamId,l=e.sandboxId;r??(r={}),a??(a={});var s=(r==null?void 0:r.initMode)||"lazy",d=p.useState({startRoute:r==null?void 0:r.startRoute,bundlerState:void 0,error:null,initMode:s,reactDevTools:void 0,status:!((n=r==null?void 0:r.autorun)!==null&&n!==void 0)||n?"initial":"idle"}),f=d[0],v=d[1],m=p.useRef(),g=p.useRef(null),h=p.useRef(null),S=p.useRef({}),w=p.useRef({}),E=p.useRef(null),j=p.useRef({}),O=p.useRef(),k=p.useRef({global:{}}),M=p.useRef(),R=p.useRef(t.environment),V=cc(t.files),P=p.useCallback(function(C,b,A){return ze(void 0,void 0,void 0,function(){var T,ee,G,F,te,W,me,xe,Te,Oe,Ae;return Ve(this,function(je){switch(je.label){case 0:return w.current[b]&&w.current[b].destroy(),r??(r={}),a??(a={}),T=(Te=r==null?void 0:r.bundlerTimeOut)!==null&&Te!==void 0?Te:uc,E.current&&clearTimeout(E.current),ee=typeof O.current!="function",ee&&(E.current=setTimeout(function(){H(),v(function(X){return x(x({},X),{status:"timeout"})})},T)),G=function(){return ze(void 0,void 0,void 0,function(){var X,oe;return Ve(this,function(ie){switch(ie.label){case 0:return r!=null&&r.experimental_enableStableServiceWorkerId?(X="SANDPACK_INTERNAL:URL-CONSISTENT-ID",oe=localStorage.getItem(X),oe?[3,2]:[4,V()]):[3,3];case 1:oe=ie.sent(),localStorage.setItem(X,oe),ie.label=2;case 2:return[2,oe];case 3:return[4,V()];case 4:return[2,ie.sent()]}})})},te=qr,W=[C,{files:t.files,template:t.environment}],xe={externalResources:r.externalResources,bundlerURL:r.bundlerURL,startRoute:(Oe=A==null?void 0:A.startRoute)!==null&&Oe!==void 0?Oe:r.startRoute,fileResolver:r.fileResolver,skipEval:(Ae=r.skipEval)!==null&&Ae!==void 0?Ae:!1,logLevel:r.logLevel,showOpenInCodeSandbox:!1,showErrorScreen:!0,showLoadingScreen:!1,reactDevTools:f.reactDevTools,customNpmRegistries:a==null?void 0:a.npmRegistries,teamId:u,experimental_enableServiceWorker:!!(r!=null&&r.experimental_enableServiceWorker)},[4,G()];case 1:return[4,te.apply(void 0,W.concat([(xe.experimental_stableServiceWorkerId=je.sent(),xe.sandboxId=l,xe)]))];case 2:return F=je.sent(),typeof O.current!="function"&&(O.current=F.listen(q)),j.current[b]=j.current[b]||{},k.current[b]&&(Object.keys(k.current[b]).forEach(function(X){var oe=k.current[b][X],ie=F.listen(oe);j.current[b][X]=ie}),k.current[b]={}),me=Object.entries(k.current.global),me.forEach(function(X){var oe=X[0],ie=X[1],I=F.listen(ie);j.current[b][oe]=I}),w.current[b]=F,[2]}})})},[t.environment,t.files,f.reactDevTools]),H=p.useCallback(function(){Object.keys(w.current).map($),typeof O.current=="function"&&(O.current(),O.current=void 0)},[]),Y=p.useCallback(function(){return ze(void 0,void 0,void 0,function(){return Ve(this,function(C){switch(C.label){case 0:return[4,Promise.all(Object.entries(S.current).map(function(b){var A=b[0],T=b[1],ee=T.iframe,G=T.clientPropsOverride,F=G===void 0?{}:G;return ze(void 0,void 0,void 0,function(){return Ve(this,function(te){switch(te.label){case 0:return[4,P(ee,A,F)];case 1:return te.sent(),[2]}})})}))];case 1:return C.sent(),v(function(b){return x(x({},b),{error:null,status:"running"})}),[2]}})})},[P]);m.current=function(C){C.some(function(b){return b.isIntersecting})?Y():H()};var J=p.useCallback(function(){var C,b,A,T=(C=r==null?void 0:r.autorun)!==null&&C!==void 0?C:!0;if(T){var ee=(b=r==null?void 0:r.initModeObserverOptions)!==null&&b!==void 0?b:{rootMargin:"1000px 0px"};g.current&&h.current&&((A=g.current)===null||A===void 0||A.unobserve(h.current)),h.current&&f.initMode==="lazy"?(g.current=new IntersectionObserver(function(G){var F,te;G.some(function(W){return W.isIntersecting})&&G.some(function(W){return W.isIntersecting})&&h.current&&((F=m.current)===null||F===void 0||F.call(m,G),(te=g.current)===null||te===void 0||te.unobserve(h.current))},ee),g.current.observe(h.current)):h.current&&f.initMode==="user-visible"?(g.current=new IntersectionObserver(function(G){var F;(F=m.current)===null||F===void 0||F.call(m,G)},ee),g.current.observe(h.current)):Y()}},[r==null?void 0:r.autorun,r==null?void 0:r.initModeObserverOptions,Y,f.initMode,H]),K=p.useCallback(function(C,b,A){return ze(void 0,void 0,void 0,function(){return Ve(this,function(T){switch(T.label){case 0:return S.current[b]={iframe:C,clientPropsOverride:A},f.status!=="running"?[3,2]:[4,P(C,b,A)];case 1:T.sent(),T.label=2;case 2:return[2]}})})},[P,f.status]),$=function(C){var b,A,T=w.current[C];T?(T.destroy(),(b=T.iframe.contentWindow)===null||b===void 0||b.location.replace("about:blank"),T.iframe.removeAttribute("src"),delete w.current[C]):delete S.current[C],E.current&&clearTimeout(E.current);var ee=Object.values((A=j.current[C])!==null&&A!==void 0?A:{});ee.forEach(function(F){var te=Object.values(F);te.forEach(function(W){return W()})});var G=Object.keys(w.current).length>0?"running":"idle";v(function(F){return x(x({},F),{status:G})})},q=function(C){C.type==="start"?v(function(b){return x(x({},b),{error:null})}):C.type==="state"?v(function(b){return x(x({},b),{bundlerState:C.state})}):C.type==="done"&&!C.compilatonError||C.type==="connected"?(E.current&&clearTimeout(E.current),v(function(b){return x(x({},b),{error:null})})):C.type==="action"&&C.action==="show-error"?(E.current&&clearTimeout(E.current),v(function(b){return x(x({},b),{error:Sn(C)})})):C.type==="action"&&C.action==="notification"&&C.notificationType==="error"&&v(function(b){return x(x({},b),{error:{message:C.title}})})},Z=function(C){v(function(b){return x(x({},b),{reactDevTools:C})})},Q=(o=r==null?void 0:r.recompileMode)!==null&&o!==void 0?o:"delayed",B=(i=r==null?void 0:r.recompileDelay)!==null&&i!==void 0?i:200,re=function(C,b){if(f.status!=="running"){console.warn("[sandpack-react]: dispatch cannot be called while in idle mode");return}b?w.current[b].dispatch(C):Object.values(w.current).forEach(function(A){A.dispatch(C)})},ve=function(C,b){if(b)if(w.current[b]){var A=w.current[b].listen(C);return A}else{var T=rt();k.current[b]=k.current[b]||{},j.current[b]=j.current[b]||{},k.current[b][T]=C;var A=function(){k.current[b][T]?delete k.current[b][T]:j.current[b][T]&&(j.current[b][T](),delete j.current[b][T])};return A}else{var ee=rt();k.current.global[ee]=C;var G=Object.values(w.current),F=G.map(function(W){return W.listen(C)}),A=function(){F.forEach(function(W){return W()}),delete k.current.global[ee],Object.values(j.current).forEach(function(W){var me;(me=W==null?void 0:W[ee])===null||me===void 0||me.call(W)})};return A}};return p.useEffect(function(){if(!(f.status!=="running"||!t.shouldUpdatePreview)){if(R.current!==t.environment&&(R.current=t.environment,Object.entries(w.current).forEach(function(b){var A=b[0],T=b[1];K(T.iframe,A)})),Q==="immediate"&&Object.values(w.current).forEach(function(b){b.status==="done"&&b.updateSandbox({files:t.files,template:t.environment})}),Q==="delayed"){if(typeof window>"u")return;window.clearTimeout(M.current),M.current=window.setTimeout(function(){Object.values(w.current).forEach(function(b){b.status==="done"&&b.updateSandbox({files:t.files,template:t.environment})})},B)}return function(){window.clearTimeout(M.current)}}},[t.files,t.environment,t.shouldUpdatePreview,B,Q,K,f.status]),p.useEffect(function(){s!==f.initMode&&(v(function(b){return x(x({},b),{initMode:s})}),J())},[s,J,f.initMode]),p.useEffect(function(){return function(){typeof O.current=="function"&&O.current(),E.current&&clearTimeout(E.current),M.current&&clearTimeout(M.current),g.current&&g.current.disconnect()}},[]),[f,{clients:w.current,initializeSandpackIframe:J,runSandpack:Y,registerBundler:K,unregisterBundler:$,registerReactDevTools:Z,addListener:ve,dispatchMessage:re,lazyAnchorRef:h,unsubscribeClientListenersRef:j,queuedListenersRef:k}]},fc=function(e){var t=vn(e),n=p.useState(t),o=n[0],i=n[1],r=p.useRef(!1);p.useEffect(function(){r.current?i(vn(e)):r.current=!0},[e.files,e.customSetup,e.template]);var a=function(l,s,d){d===void 0&&(d=!0),i(function(f){var v,m=f.files;return typeof l=="string"&&typeof s=="string"?m=x(x({},m),(v={},v[l]=x(x({},m[l]),{code:s}),v)):typeof l=="object"&&(m=x(x({},m),Ct(l))),x(x({},f),{files:Me(m),shouldUpdatePreview:d})})},u={openFile:function(l){i(function(s){var d=s.visibleFiles,f=pe(s,["visibleFiles"]),v=d.includes(l)?d:Se(Se([],d,!0),[l],!1);return x(x({},f),{activeFile:l,visibleFiles:v})})},resetFile:function(l){i(function(s){var d;return x(x({},s),{files:x(x({},s.files),(d={},d[l]=t.files[l],d))})})},resetAllFiles:function(){i(function(l){return x(x({},l),{files:t.files})})},setActiveFile:function(l){o.files[l]&&i(function(s){return x(x({},s),{activeFile:l})})},updateCurrentFile:function(l,s){s===void 0&&(s=!0),a(o.activeFile,l,s)},updateFile:a,addFile:a,closeFile:function(l){o.visibleFiles.length!==1&&i(function(s){var d=s.visibleFiles,f=s.activeFile,v=pe(s,["visibleFiles","activeFile"]),m=d.indexOf(l),g=d.filter(function(h){return h!==l});return x(x({},v),{activeFile:l===f?m===0?d[1]:d[m-1]:f,visibleFiles:g})})},deleteFile:function(l,s){s===void 0&&(s=!0),i(function(d){var f=d.visibleFiles,v=d.files,m=d.activeFile,g=pe(d,["visibleFiles","files","activeFile"]),h=x({},v);delete h[l];var S=f.filter(function(j){return j!==l}),w=S.length===0;if(w){var E=Object.keys(v)[Object.keys(v).length-1];return x(x({},g),{visibleFiles:[E],activeFile:E,files:h,shouldUpdatePreview:s})}return x(x({},g),{visibleFiles:S,activeFile:l===m?S[S.length-1]:m,files:h,shouldUpdatePreview:s})})}};return[x(x({},o),{visibleFilesFromProps:t.visibleFiles}),u]},On=p.createContext(null),cu=function(e){var t,n,o,i=e.children,r=e.options,a=e.style,u=e.className,l=e.theme,s=fc(e),d=s[0],f=s[1],v=dc(e,d),m=v[0],g=v[1],h=g.dispatchMessage,S=g.addListener,w=pe(g,["dispatchMessage","addListener"]),E=ac(e,d.files);return p.useEffect(function(){w.initializeSandpackIframe()},[]),c.jsx(On.Provider,{value:x(x(x(x(x(x({},d),m),E),f),w),{autoReload:(n=(t=e.options)===null||t===void 0?void 0:t.autoReload)!==null&&n!==void 0?n:!0,teamId:e==null?void 0:e.teamId,exportOptions:(o=e==null?void 0:e.customSetup)===null||o===void 0?void 0:o.exportOptions,listen:S,dispatch:h}),children:c.jsx(Ms,{classes:r==null?void 0:r.classes,children:c.jsx(Is,{className:u,style:a,theme:l,children:i})})})};On.Consumer;function le(){var e=p.useContext(On);if(e===null)throw new Error('[sandpack-react]: "useSandpack" must be wrapped by a "SandpackProvider"');var t=e.dispatch,n=e.listen,o=pe(e,["dispatch","listen"]);return{sandpack:x({},o),dispatch:t,listen:n}}var wo=function(){var e,t,n,o=le().sandpack;return{code:(e=o.files[o.activeFile])===null||e===void 0?void 0:e.code,readOnly:(n=(t=o.files[o.activeFile])===null||t===void 0?void 0:t.readOnly)!==null&&n!==void 0?n:!1,updateCode:o.updateCurrentFile}},ot=D,Pe=D,Xe=D,pc=D;bo({"0%":{opacity:0},"100%":{opacity:1}});var ct=D,So=D,mn=D,Je=D,vc=D,mc=D,hc=D,gc=D,bc=D,Co=function(e){var t=e.closableTabs,n=e.className,o=e.activeFileUniqueId,i=pe(e,["closableTabs","className","activeFileUniqueId"]),r=le().sandpack,a=ye(),u=r.activeFile,l=r.visibleFiles,s=r.setActiveFile,d=p.useState(null),f=d[0],v=d[1],m=function(h){var S=At(h),w=l.reduce(function(E,j){if(j===h)return E;var O=At(j);return O===S&&E.push(j),E},[]);return w.length===0?S:js(h,w)},g=function(h){var S,w,E,j,O=h.e,k=h.index,M=O.currentTarget;switch(O.key){case"ArrowLeft":{var R=M.previousElementSibling;R&&((S=R.querySelector("button"))===null||S===void 0||S.focus(),s(l[k-1]))}break;case"ArrowRight":{var V=M.nextElementSibling;V&&((w=V.querySelector("button"))===null||w===void 0||w.focus(),s(l[k+1]))}break;case"Home":{var P=M.parentElement,H=P.firstElementChild;(E=H.querySelector("button"))===null||E===void 0||E.focus(),s(l[0]);break}case"End":{var Y=M.parentElement,J=Y.lastElementChild;(j=J.querySelector("button"))===null||j===void 0||j.focus(),s(l[-1]);break}}};return c.jsx("div",x({className:a("tabs",[vc,n]),translate:"no"},i,{children:c.jsx("div",{"aria-label":"Select active file",className:a("tabs-scrollable-container",[mc]),role:"tablist",children:l.map(function(h,S){return c.jsxs("div",{"aria-controls":"".concat(h,"-").concat(o,"-tab-panel"),"aria-selected":h===u,className:a("tab-container",[hc]),onKeyDown:function(w){return g({e:w,index:S})},onMouseEnter:function(){return v(S)},onMouseLeave:function(){return v(null)},role:"tab",children:[c.jsx("button",{className:a("tab-button",[Pe,bc]),"data-active":h===u,id:"".concat(h,"-").concat(o,"-tab"),onClick:function(){return s(h)},tabIndex:h===u?0:-1,title:h,type:"button",children:m(h)}),t&&l.length>1&&c.jsx("span",{className:a("close-button",[gc]),onClick:function(w){w.stopPropagation(),r.closeFile(h)},style:{visibility:h===u||f===S?"visible":"hidden"},tabIndex:h===u?0:-1,children:c.jsx(ws,{})})]},h)})})}))},vt=function(e){var t=e.onClick,n=e.className,o=e.children,i=ye();return c.jsx("button",{className:i("button",[i("icon-standalone"),Pe,ot,Xe,n]),onClick:t,type:"button",children:o})},yc=D,jo=function(e){var t=e.onClick,n=pe(e,["className","onClick"]),o=le().sandpack;return c.jsxs(vt,x({className:yc.toString(),onClick:function(i){o.runSandpack(),t==null||t(i)}},n,{children:[c.jsx(hs,{}),c.jsx("span",{children:"Run"})]}))},xc=D,Pt=function(e){var t=e.className,n=pe(e,["className"]),o=ye();return c.jsx("div",x({className:o("stack",[xc,t])},n))},wc=function(){var e=p.useContext(Tn),t=e.theme,n=e.id,o=e.mode;return{theme:t,themeId:n,themeMode:o}},rr=function(e,t){if(e.length!==t.length)return!1;for(var n=!0,o=0;o<e.length;o++)if(e[o]!==t[o]){n=!1;break}return n},hn=function(e,t){var n=t.line,o=t.column;return e.line(n).from+(o??0)-1},Sc=function(){return _e.theme({"&":{backgroundColor:"var(--".concat(ge,"-colors-surface1)"),color:"var(--".concat(ge,"-syntax-color-plain)"),height:"100%"},".cm-matchingBracket, .cm-nonmatchingBracket, &.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket":{color:"inherit",backgroundColor:"rgba(128,128,128,.25)",backgroundBlendMode:"difference"},"&.cm-editor.cm-focused":{outline:"none"},"& .cm-activeLine":{backgroundColor:"transparent"},"&.cm-editor.cm-focused .cm-activeLine":{backgroundColor:"var(--".concat(ge,"-colors-surface3)"),borderRadius:"var(--".concat(ge,"-border-radius)")},".cm-errorLine":{backgroundColor:"var(--".concat(ge,"-colors-errorSurface)"),borderRadius:"var(--".concat(ge,"-border-radius)")},".cm-content":{caretColor:"var(--".concat(ge,"-colors-accent)"),padding:"0 var(--".concat(ge,"-space-4)")},".cm-scroller":{fontFamily:"var(--".concat(ge,"-font-mono)"),lineHeight:"var(--".concat(ge,"-font-lineHeight)")},".cm-gutters":{backgroundColor:"var(--".concat(ge,"-colors-surface1)"),color:"var(--".concat(ge,"-colors-disabled)"),border:"none",paddingLeft:"var(--".concat(ge,"-space-1)")},".cm-gutter.cm-lineNumbers":{fontSize:".6em"},".cm-lineNumbers .cm-gutterElement":{lineHeight:"var(--".concat(ge,"-font-lineHeight)"),minWidth:"var(--".concat(ge,"-space-5)")},".cm-content .cm-line":{paddingLeft:"var(--".concat(ge,"-space-1)")},".cm-content.cm-readonly .cm-line":{paddingLeft:0}})},De=function(e){return"".concat(ge,"-syntax-").concat(e)},Cc=function(e){return Vr.define([{tag:z.link,textDecoration:"underline"},{tag:z.emphasis,fontStyle:"italic"},{tag:z.strong,fontWeight:"bold"},{tag:z.keyword,class:De("keyword")},{tag:[z.atom,z.number,z.bool],class:De("static")},{tag:z.variableName,class:De("plain")},{tag:z.standard(z.tagName),class:De("tag")},{tag:[z.function(z.variableName),z.definition(z.function(z.variableName)),z.tagName],class:De("definition")},{tag:z.propertyName,class:De("property")},{tag:[z.literal,z.inserted],class:De(e.syntax.string?"string":"static")},{tag:z.punctuation,class:De("punctuation")},{tag:[z.comment,z.quote],class:De("comment")}])},jc=function(e,t,n){if(!e&&!t)return"javascript";var o=t;if(!o&&e){var i=e.lastIndexOf(".");o=e.slice(i+1)}for(var r=0,a=n;r<a.length;r++){var u=a[r];if(o===u.name||u.extensions.includes(o||""))return u.name}switch(o){case"ts":case"tsx":return"typescript";case"html":case"svelte":case"vue":case"astro":return"html";case"css":case"less":case"scss":return"css";case"js":case"jsx":case"json":default:return"javascript"}},Ec=function(e,t){for(var n={javascript:$t({jsx:!0,typescript:!1}),typescript:$t({jsx:!0,typescript:!0}),html:zr(),css:Ur()},o=0,i=t;o<i.length;o++){var r=i[o];if(e===r.name)return r.language}return n[e]},Eo=function(){for(var e=[],t=0;t<arguments.length;t++)e[t]=arguments[t];return p.useCallback(function(n){return e.forEach(function(o){if(o){if(typeof o=="function")return o(n);o.current=n}})},e)};function kc(e){return Rt.fromClass(function(){function t(n){this.decorations=this.getDecoration(n)}return t.prototype.update=function(n){},t.prototype.getDecoration=function(n){if(!e)return Ce.none;var o=e.map(function(i){var r,a,u,l=Ce.line({attributes:{class:(r=i.className)!==null&&r!==void 0?r:""}}),s=Ce.mark({class:(a=i.className)!==null&&a!==void 0?a:"",attributes:(u=i.elementAttributes)!==null&&u!==void 0?u:void 0}),d=hn(n.state.doc,{line:i.line,column:i.startColumn})+1;if(i.startColumn&&i.endColumn){var f=hn(n.state.doc,{line:i.line,column:i.endColumn})+1;return s.range(d,f)}return l.range(d)});return Ce.set(o)},t}(),{decorations:function(t){return t.decorations}})}function Nc(){return Tc}var $c=Ce.line({attributes:{class:"cm-errorLine"}}),Tc=Rt.fromClass(function(){function e(){this.decorations=Ce.none}return e.prototype.update=function(t){var n=this;t.transactions.forEach(function(o){var i=o.annotation("show-error");if(i!==void 0){var r=hn(t.view.state.doc,{line:i})+1;n.decorations=Ce.set([$c.range(r)])}else o.annotation("remove-errors")&&(n.decorations=Ce.none)})},e}(),{decorations:function(e){return e.decorations}}),or=D,ir=D,ko=D,ar=D,Oc=D,Ac=function(e){var t=e.langSupport,n=e.highlightTheme,o=e.code,i=o===void 0?"":o,r=t.language.parser.parse(i),a=0,u=[],l=function(s,d){if(s>a){var f=i.slice(a,s);u.push(d?p.createElement("span",{children:f,className:d,key:"".concat(s).concat(a)}):f),a=s}};return Jr(r,n,function(s,d,f){l(s,""),l(d,f)}),a<i.length&&(i!=null&&i.includes(`
`))&&u.push(`

`),u},An=p.forwardRef(function(e,t){var n=e.code,o=n===void 0?"":n,i=e.filePath,r=e.fileType,a=e.onCodeUpdate,u=e.showLineNumbers,l=u===void 0?!1:u,s=e.showInlineErrors,d=s===void 0?!1:s,f=e.wrapContent,v=f===void 0?!1:f,m=e.editorState,g=m===void 0?"pristine":m,h=e.readOnly,S=h===void 0?!1:h,w=e.showReadOnly,E=w===void 0?!0:w,j=e.decorators,O=e.initMode,k=O===void 0?"lazy":O,M=e.extensions,R=M===void 0?[]:M,V=e.extensionsKeymap,P=V===void 0?[]:V,H=e.additionalLanguages,Y=H===void 0?[]:H,J=p.useRef(null),K=Eo(J,t),$=p.useRef(),q=wc(),Z=q.theme,Q=q.themeId,B=p.useState(o),re=B[0],ve=B[1],C=p.useState(k==="immediate"),b=C[0],A=C[1],T=ye(),ee=le(),G=ee.listen,F=ee.sandpack.autoReload,te=p.useRef([]),W=p.useRef([]),me=Er(J,{rootMargin:"600px 0px",threshold:.2}).isIntersecting;p.useImperativeHandle(t,function(){return{getCodemirror:function(){return $.current}}}),p.useEffect(function(){var I=k==="lazy"||k==="user-visible";I&&me&&A(!0)},[k,me]);var xe=jc(i,r,Y),Te=Ec(xe,Y),Oe=Cc(Z),Ae=Ac({langSupport:Te,highlightTheme:Oe,code:o}),je=p.useMemo(function(){return j&&j.sort(function(I,U){return I.line-U.line})},[j]),X=S&&(j==null?void 0:j.length)===0;p.useEffect(function(){if(!(!J.current||!b||X)){var I=J.current,U=I.querySelector(".sp-pre-placeholder");U&&I.removeChild(U);var L=new _e({doc:o,extensions:[],parent:I});return L.contentDOM.setAttribute("data-gramm","false"),L.contentDOM.setAttribute("data-lt-active","false"),L.contentDOM.setAttribute("aria-label",i?"Code Editor for ".concat(At(i)):"Code Editor"),L.contentDOM.setAttribute("tabIndex","-1"),$.current=L,function(){var _;(_=$.current)===null||_===void 0||_.destroy()}}},[b,S,X]),p.useEffect(function(){if(!X&&$.current){var I=[{key:"Tab",run:function(L){var _,he;Wr(L);var ae=P.find(function(Ye){var Ze=Ye.key;return Ze==="Tab"});return(he=(_=ae==null?void 0:ae.run)===null||_===void 0?void 0:_.call(ae,L))!==null&&he!==void 0?he:!0}},{key:"Shift-Tab",run:function(L){var _,he;Yr({state:L.state,dispatch:L.dispatch});var ae=P.find(function(Ye){var Ze=Ye.key;return Ze==="Shift-Tab"});return(he=(_=ae==null?void 0:ae.run)===null||_===void 0?void 0:_.call(ae,L))!==null&&he!==void 0?he:!0}},{key:"Escape",run:function(){return S||J.current&&J.current.focus(),!0}},{key:"mod-Backspace",run:Lr}],U=Se(Se([Rr(),Ir(),_r()],R,!0),[kt.of(Se(Se(Se(Se(Se([],Or,!0),Ar,!0),Mr,!0),I,!0),P,!0)),Te,Sc(),Tr(Oe),_e.updateListener.of(function(L){if(L.docChanged){var _=L.state.doc.toString();ve(_),a==null||a(_)}})],!1);S?(U.push(Dr.readOnly.of(!0)),U.push(_e.editable.of(!1))):(U.push(Fr()),U.push(Pr())),je&&U.push(kc(je)),v&&U.push(_e.lineWrapping),l&&U.push(Br()),d&&U.push(Nc()),$.current.dispatch({effects:Qe.reconfigure.of(U)})}},[b,je,l,v,Q,S,X,F]),p.useEffect(function(){var U=$.current,L=!rr(R,te.current)||!rr(P,W.current);U&&L&&(U.dispatch({effects:Qe.appendConfig.of(R)}),U.dispatch({effects:Qe.appendConfig.of(kt.of(Se([],P,!0)))}),te.current=R,W.current=P)},[R,P]),p.useEffect(function(){$.current&&g==="dirty"&&window.matchMedia("(min-width: 768px)").matches&&$.current.contentDOM.focus()},[]),p.useEffect(function(){if($.current&&typeof o=="string"&&o!==re){var I=$.current,U=I.state.selection.ranges.some(function(_){var he=_.to,ae=_.from;return he>o.length||ae>o.length})?Hr.cursor(o.length):I.state.selection,L={from:0,to:I.state.doc.length,insert:o};I.dispatch({changes:L,selection:U})}},[o]),p.useEffect(function(){if(d){var U=G(function(L){var _=$.current;L.type==="success"?_==null||_.dispatch({annotations:[new Nt("remove-errors",!0)]}):L.type==="action"&&L.action==="show-error"&&L.path===i&&L.line&&(_==null||_.dispatch({annotations:[new Nt("show-error",L.line)]}))});return function(){return U()}}},[G,d]);var oe=function(I){I.key==="Enter"&&$.current&&(I.preventDefault(),$.current.contentDOM.focus())},ie=function(){var I=4;return l&&(I+=6),S||(I+=1),"var(--".concat(ge,"-space-").concat(I,")")};return X?c.jsxs(c.Fragment,{children:[c.jsx("pre",{ref:K,className:T("cm",[T(g),T(xe),ar,ir]),translate:"no",children:c.jsx("code",{className:T("pre-placeholder",[or]),style:{marginLeft:ie()},children:Ae})}),S&&E&&c.jsx("span",x({className:T("read-only",[Oc])},{},{children:"Read-only"}))]}):c.jsx("div",{ref:K,"aria-autocomplete":"list","aria-label":i?"Code Editor for ".concat(At(i)):"Code Editor","aria-multiline":"true",className:T("cm",[T(g),T(xe),ar,ir]),onKeyDown:oe,role:"textbox",tabIndex:0,translate:"no",suppressHydrationWarning:!0,children:c.jsx("pre",{className:T("pre-placeholder",[or]),style:{marginLeft:ie()},children:Ae})})});p.forwardRef(function(e,t){var n=e.showTabs,o=e.showLineNumbers,i=o===void 0?!1:o,r=e.showInlineErrors,a=r===void 0?!1:r,u=e.showRunButton,l=u===void 0?!0:u,s=e.wrapContent,d=s===void 0?!1:s,f=e.closableTabs,v=f===void 0?!1:f,m=e.initMode,g=e.extensions,h=e.extensionsKeymap,S=e.readOnly,w=e.showReadOnly,E=e.additionalLanguages,j=e.className,O=pe(e,["showTabs","showLineNumbers","showInlineErrors","showRunButton","wrapContent","closableTabs","initMode","extensions","extensionsKeymap","readOnly","showReadOnly","additionalLanguages","className"]),k=le().sandpack,M=wo(),R=M.code,V=M.updateCode,P=M.readOnly,H=k.activeFile,Y=k.status,J=k.editorState,K=n??k.visibleFiles.length>1,$=ye(),q=function(Q,B){B===void 0&&(B=!0),V(Q,B)},Z=xo();return c.jsxs(Pt,x({className:$("editor",[j])},O,{children:[K&&c.jsx(Co,{activeFileUniqueId:Z,closableTabs:v}),c.jsxs("div",{"aria-labelledby":"".concat(H,"-").concat(Z,"-tab"),className:$("code-editor",[ko]),id:"".concat(H,"-").concat(Z,"-tab-panel"),role:"tabpanel",children:[c.jsx(An,{ref:t,additionalLanguages:E,code:R,editorState:J,extensions:g,extensionsKeymap:h,filePath:H,initMode:m||k.initMode,onCodeUpdate:function(Q){var B;return q(Q,(B=k.autoReload)!==null&&B!==void 0?B:!0)},readOnly:S||P,showInlineErrors:a,showLineNumbers:i,showReadOnly:w,wrapContent:d},H),l&&(!k.autoReload||Y==="idle")?c.jsx(jo,{}):null]})]}))});p.forwardRef(function(e,t){var n=e.showTabs,o=e.showLineNumbers,i=e.decorators,r=e.code,a=e.initMode,u=e.wrapContent,l=e.additionalLanguages,s=pe(e,["showTabs","showLineNumbers","decorators","code","initMode","wrapContent","additionalLanguages"]),d=le().sandpack,f=wo().code,v=ye(),m=n??d.visibleFiles.length>1,g=xo();return c.jsxs(Pt,x({className:v("editor-viewer")},s,{children:[m?c.jsx(Co,{activeFileUniqueId:g}):null,c.jsx("div",{"aria-labelledby":"".concat(d.activeFile,"-").concat(g,"-tab"),className:v("code-editor",[ko]),id:"".concat(d.activeFile,"-").concat(g,"-tab-panel"),role:"tabpanel",children:c.jsx(An,{ref:t,additionalLanguages:l,code:r??f,decorators:i,filePath:d.activeFile,initMode:a||d.initMode,showLineNumbers:o,showReadOnly:!1,wrapContent:u,readOnly:!0})}),d.status==="idle"?c.jsx(jo,{}):null]}))});var Mc=D;p.forwardRef(function(e,t){var n=e.children,o=e.className,i=pe(e,["children","className"]),r=le().sandpack,a=ye(),u=Eo(r.lazyAnchorRef,t);return c.jsx("div",x({ref:u,className:a("layout",[Mc,o])},i,{children:n}))});var Lc=function(){var e,t=le().sandpack,n=t.error;return(e=n==null?void 0:n.message)!==null&&e!==void 0?e:null},No=200,Rc=function(e,t){var n=le(),o=n.sandpack,i=n.listen,r=p.useState("LOADING"),a=r[0],u=r[1];return p.useEffect(function(){var l=i(function(s){s.type==="start"&&s.firstLoad===!0&&u("LOADING"),s.type==="done"&&u(function(d){return d==="LOADING"?"PRE_FADING":"HIDDEN"})},e);return function(){l()}},[e,o.status==="idle"]),p.useEffect(function(){var l;return a==="PRE_FADING"&&!t?u("FADING"):a==="FADING"&&(l=setTimeout(function(){return u("HIDDEN")},No)),function(){clearTimeout(l)}},[a,t]),o.status==="timeout"?"TIMEOUT":o.status!=="running"?"HIDDEN":a},Ic=function(e){var t=le().dispatch;return{refresh:function(){return t({type:"refresh"},e)},back:function(){return t({type:"urlback"},e)},forward:function(){return t({type:"urlforward"},e)}}},$o=function(e){var t=le(),n=t.sandpack,o=t.listen,i=t.dispatch,r=p.useRef(null),a=p.useRef(rt());p.useEffect(function(){var l=r.current,s=a.current;return l!==null&&n.registerBundler(l,s,e),function(){return n.unregisterBundler(s)}},[]);var u=function(){return n.clients[a.current]||null};return{sandpack:n,getClient:u,clientId:a.current,iframe:r,listen:function(l){return o(l,a.current)},dispatch:function(l){return i(l,a.current)}}},Mn=function(e){var t=le().dispatch;return{restart:function(){return t({type:"shell/restart"},e)},openPreview:function(){return t({type:"shell/openPreview"},e)}}},_c=function(e,t){var n;switch(e.state){case"downloading_manifest":return"[1/3] Downloading manifest";case"downloaded_module":return"[2/3] Downloaded ".concat(e.name," (").concat(t-e.totalPending,"/").concat(t,")");case"starting_command":return"[3/3] Starting command";case"command_running":return'[3/3] Running "'.concat((n=e.command)===null||n===void 0?void 0:n.trim(),'"')}},To=function(e){var t=p.useState(!1),n=t[0],o=t[1],i=p.useState(),r=i[0],a=i[1],u=p.useState(null),l=u[0],s=u[1],d=e==null?void 0:e.timeout,f=e==null?void 0:e.clientId,v=le().listen;return p.useEffect(function(){var m,g=v(function(h){h.type==="start"&&h.firstLoad&&o(!1),d&&(m=setTimeout(function(){s(null)},d)),h.type==="dependencies"?s(function(){switch(h.data.state){case"downloading_manifest":return"[1/3] Downloading manifest";case"downloaded_module":return"[2/3] Downloaded ".concat(h.data.name," (").concat(h.data.progress,"/").concat(h.data.total,")");case"starting":return"[3/3] Starting"}return null}):h.type==="shell/progress"&&!n&&(!r&&h.data.state==="downloaded_module"&&a(h.data.totalPending),r!==void 0&&s(_c(h.data,r))),h.type==="done"&&h.compilatonError===!1&&(s(null),o(!0),clearTimeout(m))},f);return function(){m&&clearTimeout(m),g()}},[f,n,r,d]),l},Dc=400*2,Oo=function(e){var t=e.clientId,n=e.maxMessageCount,o=n===void 0?Dc:n,i=p.useState([]),r=i[0],a=i[1],u=le().listen;return p.useEffect(function(){var l=u(function(s){s.type==="start"?a([]):s.type==="stdout"&&s.payload.data&&s.payload.data.trim()&&a(function(d){for(var f=Se(Se([],d,!0),[{data:s.payload.data,id:rt()}],!1);f.length>o;)f.shift();return f})},t);return l},[o,t]),{logs:r,reset:function(){return a([])}}},Fc=function(e){var t=e.replace("[sandpack-client]: ","");if(/process.exit/.test(t)){var n=t.match(/process.exit\((\d+)\)/);return n?Number(n[1])===0?"Server is not running, would you like to start it again?":"Server has crashed with status code ".concat(n[1],", would you like to restart the server?"):t}return t},Pc=function(e){var t=e.children,n=e.className,o=pe(e,["children","className"]),i=Lc(),r=Mn().restart,a=ye(),u=le().sandpack,l=u.runSandpack,s=u.teamId,d=le().dispatch;if(!i&&!t)return null;var f=i==null?void 0:i.startsWith("[sandpack-client]"),v=i==null?void 0:i.includes("NPM_REGISTRY_UNAUTHENTICATED_REQUEST"),m=function(){s&&d({type:"sign-in",teamId:s})};return v?c.jsxs("div",x({className:a("overlay",[a("error"),ct,mn,n])},e,{children:[c.jsx("p",{className:a("error-message",[Je]),children:c.jsx("strong",{children:"Unable to fetch required dependency."})}),c.jsx("div",{className:a("error-message",[Je]),children:c.jsxs("p",{children:["Authentication required. Please sign in to your account (make sure to allow pop-ups to this page) and try again. If the issue persists, contact"," ",c.jsx("a",{href:"mailto:hello@codesandbox.io?subject=Sandpack Timeout Error",children:"support"})," ","for further assistance."]})}),c.jsx("div",{children:c.jsxs("button",{className:a("button",[Pe,ot,Xe]),onClick:m,children:[c.jsx(vs,{}),c.jsx("span",{children:"Sign in"})]})})]})):f&&i?c.jsx("div",x({className:a("overlay",[a("error"),ct,mn,n])},o,{children:c.jsxs("div",{className:a("error-message",[Je]),children:[c.jsx("p",{className:a("error-title",[D]),children:"Couldn't connect to server"}),c.jsx("p",{children:Fc(i)}),c.jsx("div",{children:c.jsxs("button",{className:a("button",[a("icon-standalone"),Pe,ot,Xe]),onClick:function(){r(),l()},title:"Restart script",type:"button",children:[c.jsx(Ft,{})," ",c.jsx("span",{children:"Restart"})]})})]})})):c.jsxs("div",x({className:a("overlay",[a("error"),ct,So(),n]),translate:"no"},o,{children:[c.jsx("p",{className:a("error-message",[Je]),children:c.jsx("strong",{children:"Something went wrong"})}),c.jsx("p",{className:a("error-message",[Je()]),children:i||t})]}))};function Bc(e,t){return t===void 0&&(t=!1),e=kr.escapeCarriageReturn(Jc(e)),Nr.ansiToJson(e,{json:!0,remove_empty:!0,use_classes:t})}function Hc(e){var t="";return e.bg&&(t+="".concat(e.bg,"-bg ")),e.fg&&(t+="".concat(e.fg,"-fg ")),e.decoration&&(t+="ansi-".concat(e.decoration," ")),t===""?null:(t=t.substring(0,t.length-1),t)}function Uc(e){var t={};switch(e.bg&&(t.backgroundColor="rgb(".concat(e.bg,")")),e.fg&&(t.color="rgb(".concat(e.fg,")")),e.decoration){case"bold":t.fontWeight="bold";break;case"dim":t.opacity="0.5";break;case"italic":t.fontStyle="italic";break;case"hidden":t.visibility="hidden";break;case"strikethrough":t.textDecoration="line-through";break;case"underline":t.textDecoration="underline";break;case"blink":t.textDecoration="blink";break}return t}function zc(e,t,n,o){var i=t?null:Uc(n),r=t?Hc(n):null;if(!e)return p.createElement("span",{style:i,key:o,className:r},n.content);for(var a=[],u=/(\s|^)(https?:\/\/(?:www\.|(?!www))[^\s.]+\.[^\s]{2,}|www\.[^\s]+\.[^\s]{2,})/g,l=0,s;(s=u.exec(n.content))!==null;){var d=s[1],f=s[2],v=s.index+d.length;v>l&&a.push(n.content.substring(l,v));var m=f.startsWith("www.")?"http://".concat(f):f;a.push(p.createElement("a",{key:l,href:m,target:"_blank"},"".concat(f))),l=u.lastIndex}return l<n.content.length&&a.push(n.content.substring(l)),p.createElement("span",{style:i,key:o,className:r},a)}function Vc(e){var t=e.className,n=e.useClasses,o=e.children,i=e.linkify;return p.createElement("code",{className:t},Bc(o??"",n??!1).map(zc.bind(null,i??!1,n??!1)))}function Jc(e){var t=e;do e=t,t=e.replace(/[^\n]\x08/gm,"");while(t.length<e.length);return e}var Ao=function(e){var t=e.data,n=ye();return c.jsx(c.Fragment,{children:t.map(function(o){var i=o.data,r=o.id;return c.jsx("div",{className:n("console-item",[Wc]),children:c.jsx(Vc,{children:i})},r)})})},Wc=D,Yc=function(e){return $r.compressToBase64(JSON.stringify(e)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")},sr="https://codesandbox.io/api/v1/sandboxes/define",Zc=function(e,t){var n=Object.keys(e).reduce(function(o,i){var r,a=i.replace("/",""),u={content:e[i].code,isBinary:!1};return x(x({},o),(r={},r[a]=u,r))},{});return Yc(x({files:n},t?{template:t}:null))},qc=function(e){var t=le().sandpack;return t.exportOptions?c.jsx(Gc,x({state:t},e)):c.jsx(Kc,x({state:t},e))},Gc=function(e){var t=e.children,n=e.state,o=pe(e,["children","state"]),i=function(){return ze(void 0,void 0,void 0,function(){var r,a,u,l;return Ve(this,function(s){switch(s.label){case 0:if(!(!((l=n.exportOptions)===null||l===void 0)&&l.apiToken))throw new Error("Missing `apiToken` property");return r=Object.keys(n.files).reduce(function(d,f){var v,m=f.replace("/","");return x(x({},d),(v={},v[m]=n.files[f],v))},{}),[4,fetch("https://api.codesandbox.io/sandbox",{method:"POST",body:JSON.stringify({template:n.environment,files:r,privacy:n.exportOptions.privacy==="public"?0:2}),headers:{Authorization:"Bearer ".concat(n.exportOptions.apiToken),"Content-Type":"application/json","X-CSB-API-Version":"2023-07-01"}})];case 1:return a=s.sent(),[4,a.json()];case 2:return u=s.sent(),window.open("https://codesandbox.io/p/sandbox/".concat(u.data.alias,"?file=/").concat(n.activeFile,"&utm-source=storybook-addon"),"_blank"),[2]}})})};return c.jsx("button",x({onClick:i,title:"Export to workspace in CodeSandbox",type:"button"},o,{children:t}))},Kc=function(e){var t,n,o,i=e.children,r=e.state,a=pe(e,["children","state"]),u=p.useRef(null),l=p.useState(),s=l[0],d=l[1];return p.useEffect(function(){var v=setTimeout(function(){var m=Zc(r.files,r.environment),g=new URLSearchParams({parameters:m,query:new URLSearchParams({file:r.activeFile,utm_medium:"sandpack"}).toString()});d(g)},600);return function(){clearTimeout(v)}},[r.activeFile,r.environment,r.files]),((o=(n=(t=s==null?void 0:s.get)===null||t===void 0?void 0:t.call(s,"parameters"))===null||n===void 0?void 0:n.length)!==null&&o!==void 0?o:0)>1500?c.jsxs("button",x({onClick:function(){var f;return(f=u.current)===null||f===void 0?void 0:f.submit()},title:"Open in CodeSandbox",type:"button"},a,{children:[c.jsxs("form",{ref:u,action:sr,method:"POST",style:{visibility:"hidden"},target:"_blank",children:[c.jsx("input",{name:"environment",type:"hidden",value:r.environment==="node"?"server":r.environment}),Array.from(s,function(f){var v=f[0],m=f[1];return c.jsx("input",{name:v,type:"hidden",value:m},v)})]}),i]})):c.jsx("a",x({href:"".concat(sr,"?").concat(s==null?void 0:s.toString(),"&environment=").concat(r.environment==="node"?"server":r.environment),rel:"noreferrer noopener",target:"_blank",title:"Open in CodeSandbox"},a,{children:i}))},Mo=function(){var e=ye();return c.jsxs(qc,{className:e("button",[e("icon-standalone"),Pe,ot,Xe]),children:[c.jsx(xs,{}),c.jsx("span",{children:"Open Sandbox"})]})},Xc=D,Qc=D;bo({"0%":{transform:"rotateX(-25.5deg) rotateY(45deg)"},"100%":{transform:"rotateX(-25.5deg) rotateY(405deg)"}});var el=D,tl=function(e){var t=e.className,n=e.showOpenInCodeSandbox,o=pe(e,["className","showOpenInCodeSandbox"]),i=ye();return c.jsxs("div",x({className:i("cube-wrapper",[Qc,t]),title:"Open in CodeSandbox"},o,{children:[n&&c.jsx(Mo,{}),c.jsx("div",{className:i("cube",[Xc]),children:c.jsxs("div",{className:i("sides",[el]),children:[c.jsx("div",{className:"top"}),c.jsx("div",{className:"right"}),c.jsx("div",{className:"bottom"}),c.jsx("div",{className:"left"}),c.jsx("div",{className:"front"}),c.jsx("div",{className:"back"})]})})]}))},nl=D,rl=function(e){var t=e.clientId,n=e.loading,o=e.className,i=e.style,r=e.showOpenInCodeSandbox,a=pe(e,["clientId","loading","className","style","showOpenInCodeSandbox"]),u=ye(),l=le().sandpack,s=l.runSandpack,d=l.environment,f=p.useState(!1),v=f[0],m=f[1],g=Rc(t,n),h=To({clientId:t}),S=Oo({clientId:t}).logs;if(p.useEffect(function(){var E;return h!=null&&h.includes("Running")&&(E=setTimeout(function(){m(!0)},3e3)),function(){E&&clearTimeout(E)}},[h]),g==="HIDDEN")return null;if(g==="TIMEOUT")return c.jsx("div",x({className:u("overlay",[u("error"),ct,So,mn,o])},a,{children:c.jsxs("div",{className:u("error-message",[Je]),children:[c.jsx("p",{className:u("error-title",[D]),children:"Couldn't connect to server"}),c.jsx("div",{className:u("error-message",[Je]),children:c.jsxs("p",{children:["This means sandpack cannot connect to the runtime or your network is having some issues. Please check the network tab in your browser and try again. If the problem persists, report it via"," ",c.jsx("a",{href:"mailto:hello@codesandbox.io?subject=Sandpack Timeout Error",children:"email"})," ","or submit an issue on"," ",c.jsx("a",{href:"https://github.com/codesandbox/sandpack/issues",rel:"noreferrer noopener",target:"_blank",children:"GitHub."})]})}),c.jsxs("p",{className:u("error-message",[Je()]),children:["ENV: ",d,c.jsx("br",{}),"ERROR: TIME_OUT"]}),c.jsx("div",{children:c.jsxs("button",{className:u("button",[u("icon-standalone"),Pe,ot,Xe]),onClick:s,title:"Restart script",type:"button",children:[c.jsx(Ft,{})," ",c.jsx("span",{children:"Try again"})]})})]})}));var w=g==="LOADING"||g==="PRE_FADING";return c.jsxs(c.Fragment,{children:[c.jsxs("div",x({className:u("overlay",[u("loading"),ct,nl,o]),style:x(x({},i),{opacity:w?1:0,transition:"opacity ".concat(No,"ms ease-out")})},a,{children:[v&&c.jsx("div",{className:ol.toString(),children:c.jsx(Ao,{data:S})}),c.jsx(tl,{showOpenInCodeSandbox:r})]})),h&&c.jsx("div",{className:il.toString(),children:c.jsx("p",{children:h})})]})},ol=D,il=D,al=function(e){var t=e.clientId,n=To({timeout:3e3,clientId:t});return n?c.jsx("div",{className:sl.toString(),children:c.jsx("p",{children:n})}):null},sl=D,cl=function(e){var t=e.match(/(https?:\/\/.*?)\//);return t&&t[1]?[t[1],e.replace(t[1],"")]:[e,"/"]},ll=D,ul=D,dl=function(e){var t,n=e.clientId,o=e.onURLChange,i=e.className,r=e.startRoute,a=pe(e,["clientId","onURLChange","className","startRoute"]),u=p.useState(""),l=u[0],s=u[1],d=le(),f=d.sandpack,v=d.dispatch,m=d.listen,g=p.useState((t=r??f.startRoute)!==null&&t!==void 0?t:"/"),h=g[0],S=g[1],w=p.useState(!1),E=w[0],j=w[1],O=p.useState(!1),k=O[0],M=O[1],R=ye();p.useEffect(function(){var $=m(function(q){if(q.type==="urlchange"){var Z=q.url,Q=q.back,B=q.forward,re=cl(Z),ve=re[0],C=re[1];s(ve),S(C),j(Q),M(B)}},n);return function(){return $()}},[]);var V=function($){var q=$.target.value.startsWith("/")?$.target.value:"/".concat($.target.value);S(q)},P=function($){$.code==="Enter"&&($.preventDefault(),$.stopPropagation(),typeof o=="function"&&o(l+$.currentTarget.value))},H=function(){v({type:"refresh"})},Y=function(){v({type:"urlback"})},J=function(){v({type:"urlforward"})},K=R("button",[R("icon"),Pe,pc,D]);return c.jsxs("div",x({className:R("navigator",[ll,i])},a,{children:[c.jsx("button",{"aria-label":"Go back one page",className:K,disabled:!E,onClick:Y,type:"button",children:c.jsx(gs,{})}),c.jsx("button",{"aria-label":"Go forward one page",className:K,disabled:!k,onClick:J,type:"button",children:c.jsx(bs,{})}),c.jsx("button",{"aria-label":"Refresh page",className:K,onClick:H,type:"button",children:c.jsx(ho,{})}),c.jsx("input",{"aria-label":"Current Sandpack URL",className:R("input",[ul]),name:"Current Sandpack URL",onChange:V,onKeyDown:P,type:"text",value:h})]}))},fl=D,pl=D,vl=D,lu=p.forwardRef(function(e,t){var n=e.showNavigator,o=n===void 0?!1:n,i=e.showRefreshButton,r=i===void 0?!0:i,a=e.showOpenInCodeSandbox,u=a===void 0?!0:a,l=e.showSandpackErrorOverlay,s=l===void 0?!0:l,d=e.showRestartButton,f=d===void 0?!0:d,v=e.actionsChildren,m=v===void 0?c.jsx(c.Fragment,{}):v,g=e.children,h=e.className,S=e.startRoute,w=S===void 0?"/":S,E=pe(e,["showNavigator","showRefreshButton","showOpenInCodeSandbox","showSandpackErrorOverlay","showOpenNewtab","showRestartButton","actionsChildren","children","className","startRoute"]),j=$o({startRoute:w}),O=j.sandpack,k=j.listen,M=j.iframe,R=j.getClient,V=j.clientId,P=j.dispatch,H=p.useState(null),Y=H[0],J=H[1],K=O.status,$=Ic(V).refresh,q=Mn(V).restart,Z=ye();p.useEffect(function(){var B=k(function(re){re.type==="resize"&&J(re.height)});return B},[]),p.useImperativeHandle(t,function(){return{clientId:V,getClient:R}},[R,V]);var Q=function(B){M.current&&(M.current.src=B)};return c.jsxs(Pt,x({className:Z("preview",[h])},E,{children:[o&&c.jsx(dl,{clientId:V,onURLChange:Q,startRoute:w}),c.jsxs("div",{className:Z("preview-container",[fl]),children:[c.jsx("iframe",{ref:M,className:Z("preview-iframe",[pl]),style:{height:Y||void 0},title:"Sandpack Preview"}),c.jsxs("div",{className:Z("preview-actions",[vl]),children:[m,f&&O.environment==="node"&&c.jsx(vt,{onClick:q,children:c.jsx(Ft,{})}),!o&&r&&K==="running"&&c.jsx(vt,{onClick:$,children:c.jsx(ho,{})}),O.teamId&&c.jsx("button",{className:Z("button",[Z("icon-standalone"),Pe,ot,Xe]),onClick:function(){return P({type:"sign-out"})},title:"Sign out",type:"button",children:c.jsx(ms,{})}),u&&c.jsx(Mo,{})]}),c.jsx(rl,{clientId:V,showOpenInCodeSandbox:u}),s&&c.jsx(Pc,{}),g]})]}))}),ml=["SyntaxError: ","Error in sandbox:"],hl={id:"random",method:"clear",data:["Console was cleared"]},cr="@t",lr="#@t",ur="@r",dr=1e4,Lo=2,gn=400,gl=gn*2,Gt=function(){if(typeof globalThis<"u")return globalThis;if(typeof window<"u")return window;if(typeof Et<"u")return Et;if(typeof self<"u")return self;throw Error("Unable to locate global object")}(),bl=typeof ArrayBuffer=="function",yl=typeof Map=="function",xl=typeof Set=="function",lt;(function(e){e[e.infinity=0]="infinity",e[e.minusInfinity=1]="minusInfinity",e[e.minusZero=2]="minusZero"})(lt||(lt={}));var fr={Arithmetic:function(e){return e===lt.infinity?1/0:e===lt.minusInfinity?-1/0:e===lt.minusZero?-0:e},HTMLElement:function(e){var t=document.implementation.createHTMLDocument("sandbox");try{var n=t.createElement(e.tagName);n.innerHTML=e.innerHTML;for(var o=0,i=Object.keys(e.attributes);o<i.length;o++){var r=i[o];try{n.setAttribute(r,e.attributes[r])}catch{}}return n}catch{return e}},Function:function(e){var t=function(){};return Object.defineProperty(t,"toString",{value:function(){return"function ".concat(e.name,"() {").concat(e.body,"}")}}),t},"[[NaN]]":function(){return NaN},"[[undefined]]":function(){},"[[Date]]":function(e){var t=new Date;return t.setTime(e),t},"[[RegExp]]":function(e){return new RegExp(e.src,e.flags)},"[[Error]]":function(e){var t=Gt[e.name]||Error,n=new t(e.message);return n.stack=e.stack,n},"[[ArrayBuffer]]":function(e){if(bl){var t=new ArrayBuffer(e.length),n=new Int8Array(t);return n.set(e),t}return e},"[[TypedArray]]":function(e){return typeof Gt[e.ctorName]=="function"?new Gt[e.ctorName](e.arr):e.arr},"[[Map]]":function(e){if(yl){for(var t=new Map,n=0;n<e.length;n+=2)t.set(e[n],e[n+1]);return t}for(var o=[],i=0;i<e.length;i+=2)o.push([e[n],e[n+1]]);return o},"[[Set]]":function(e){if(xl){for(var t=new Set,n=0;n<e.length;n++)t.add(e[n]);return t}return e}},bn=function(e){var t;if(typeof e=="string"||typeof e=="number"||e===null)return e;if(Array.isArray(e))return e.map(bn);if(typeof e=="object"&&cr in e){var n=e[cr],o=fr[n];return o(e.data)}else if(typeof e=="object"&&lr in e){var n=e[lr],o=fr[n];return o(e.data)}else if(typeof e=="object"&&((t=e.constructor)===null||t===void 0?void 0:t.name)==="NodeList"){var i={};return Object.entries(e).forEach(function(r){var a=r[0],u=r[1];i[a]=bn(u)}),i}return e},wl=function(e,t,n){var o=e.reduce(function(i,r,a){return"".concat(i).concat(a?", ":"").concat(mt(r,t,n))},"");return"[".concat(o,"]")},Sl=function(e,t,n){var o=e.constructor.name!=="Object"?"".concat(e.constructor.name," "):"";if(n>Lo)return o;var i=Object.entries(e),r=Object.entries(e).reduce(function(a,u,l){var s=u[0],d=u[1],f=l===0?"":", ",v=i.length>10?`
  `:"",m=mt(d,t,n);return l===gn?a+v+"...":l>gn?a:a+"".concat(f).concat(v).concat(s,": ")+m},"");return"".concat(o,"{ ").concat(r).concat(i.length>10?`
`:" ","}")},mt=function(e,t,n){var o;n===void 0&&(n=0);try{var i=bn(e);if(Array.isArray(i))return wl(i,t,n+1);switch(typeof i){case"string":return'"'.concat(i,'"').slice(0,dr);case"number":case"function":case"symbol":return i.toString();case"boolean":return String(i);case"undefined":return"undefined";case"object":default:if(i instanceof RegExp||i instanceof Error||i instanceof Date)return i.toString();if(i===null)return String(null);if(i instanceof HTMLElement)return i.outerHTML.slice(0,dr);if(Object.entries(i).length===0)return"{}";if(ur in i){if(n>Lo)return"Unable to print information";var r=t[i[ur]];return mt(r,t,n+1)}if(((o=i.constructor)===null||o===void 0?void 0:o.name)==="NodeList"){var a=i.length,u=new Array(a).fill(null).map(function(l,s){return mt(i[s],t)});return"NodeList(".concat(i.length,")[").concat(u,"]")}return Sl(i,t,n+1)}}catch{return"Unable to print information"}},Cl=function(e){var t=e.data,n=ye();return c.jsx(c.Fragment,{children:t.map(function(o,i,r){var a=o.data,u=o.id,l=o.method;return a&&Array.isArray(a)?c.jsx(p.Fragment,{children:a.map(function(s,d){var f=r.slice(i,r.length);return c.jsx("div",{className:n("console-item",[jl()]),children:c.jsx(An,{code:l==="clear"?s:mt(s,f),fileType:"js",initMode:"user-visible",showReadOnly:!1,readOnly:!0,wrapContent:!0})},"".concat(u,"-").concat(d))})},u):null})})},jl=D,El=D,pr=D,kl=function(e){var t=e.currentTab,n=e.setCurrentTab,o=e.node,i=ye(),r=i("console-header-button",[Pe,Xe,D]);return c.jsxs("div",{className:i("console-header",[El,pr]),children:[c.jsxs("p",{className:i("console-header-title",[D]),children:[c.jsx(Ss,{}),c.jsx("span",{children:"Terminal"})]}),o&&c.jsxs("div",{className:i("console-header-actions",[pr]),children:[c.jsx("button",{className:r,"data-active":t==="server",onClick:function(){return n("server")},type:"button",children:"Server"}),c.jsx("button",{className:r,"data-active":t==="client",onClick:function(){return n("client")},type:"button",children:"Client"})]})]})},Nl=function(e){var t=e.clientId,n=e.maxMessageCount,o=n===void 0?gl:n,i=e.showSyntaxError,r=i===void 0?!1:i,a=e.resetOnPreviewRestart,u=a===void 0?!1:a,l=p.useState([]),s=l[0],d=l[1],f=le().listen;return p.useEffect(function(){var v=f(function(m){if(u&&m.type==="start")d([]);else if(m.type==="console"&&m.codesandbox){var g=Array.isArray(m.log)?m.log:[m.log];if(g.find(function(S){var w=S.method;return w==="clear"}))return d([hl]);var h=r?g:g.filter(function(S){var w,E,j,O=(j=(E=(w=S==null?void 0:S.data)===null||w===void 0?void 0:w.filter)===null||E===void 0?void 0:E.call(w,function(k){if(typeof k!="string")return!0;var M=ml.filter(function(R){return k.startsWith(R)});return M.length===0}))!==null&&j!==void 0?j:[];return O.length>0});if(!h)return;d(function(S){for(var w=Se(Se([],S,!0),h,!0).filter(function(E,j,O){return j===O.findIndex(function(k){return k.id===E.id})});w.length>o;)w.shift();return w})}},t);return v},[r,o,t,u]),{logs:s,reset:function(){return d([])}}};p.forwardRef(function(e,t){var n=e.showHeader,o=n===void 0?!0:n,i=e.showSyntaxError,r=i===void 0?!1:i,a=e.maxMessageCount,u=e.onLogsChange,l=e.className,s=e.showResetConsoleButton,d=s===void 0?!0:s,f=e.showRestartButton,v=f===void 0?!0:f,m=e.resetOnPreviewRestart,g=m===void 0?!1:m,h=e.actionsChildren,S=h===void 0?c.jsx(c.Fragment,{}):h,w=e.standalone,E=w===void 0?!1:w,j=pe(e,["showHeader","showSyntaxError","maxMessageCount","onLogsChange","className","showSetupProgress","showResetConsoleButton","showRestartButton","resetOnPreviewRestart","actionsChildren","standalone"]),O=le().sandpack.environment,k=$o(),M=k.iframe,R=k.clientId,V=Mn().restart,P=p.useState(O==="node"?"server":"client"),H=P[0],Y=P[1],J=E?R:void 0,K=Nl({maxMessageCount:a,showSyntaxError:r,resetOnPreviewRestart:g,clientId:J}),$=K.logs,q=K.reset,Z=Oo({maxMessageCount:a,clientId:J}),Q=Z.logs,B=Z.reset,re=p.useRef(null);p.useEffect(function(){u==null||u($),re.current&&(re.current.scrollTop=re.current.scrollHeight)},[u,$,Q,H]);var ve=H==="server",C=O==="node";p.useImperativeHandle(t,function(){return{reset:function(){q(),B()}}});var b=ye();return c.jsxs(Pt,x({className:b("console",[D,l])},j,{children:[o&&C&&c.jsx(kl,{currentTab:H,node:C,setCurrentTab:Y}),c.jsx("div",{ref:re,className:b("console-list",[D]),children:ve?c.jsx(Ao,{data:Q}):c.jsx(Cl,{data:$})}),c.jsxs("div",{className:b("console-actions",[D]),children:[S,v&&ve&&c.jsx(vt,{onClick:function(){V(),q(),B()},children:c.jsx(Ft,{})}),d&&c.jsx(vt,{onClick:function(){H==="client"?q():B()},children:c.jsx(ys,{})})]}),E&&c.jsxs(c.Fragment,{children:[c.jsx(al,{clientId:J}),c.jsx("iframe",{ref:M})]})]}))});var Ln=function(){function e(t,n,o){o===void 0&&(o={}),this.status="idle",this.options=o,this.sandboxSetup=n,this.iframeSelector=t}return e.prototype.updateOptions=function(t){Lt(this.options,t)||(this.options=t,this.updateSandbox())},e.prototype.updateSandbox=function(t,n){throw t===void 0&&(t=this.sandboxSetup),Error("Method not implemented")},e.prototype.destroy=function(){throw Error("Method not implemented")},e.prototype.dispatch=function(t){throw Error("Method not implemented")},e.prototype.listen=function(t){throw Error("Method not implemented")},e}(),Ro=function(){function e(){this.listeners={},this.listenersCount=0,this.channelId=Math.floor(Math.random()*1e6),this.listeners=[]}return e.prototype.cleanup=function(){this.listeners={},this.listenersCount=0},e.prototype.dispatch=function(t){Object.values(this.listeners).forEach(function(n){return n(t)})},e.prototype.listener=function(t){var n=this;if(typeof t!="function")return function(){};var o=this.listenersCount;return this.listeners[o]=t,this.listenersCount++,function(){delete n.listeners[o]}},e}();function vr(e){return/[a-zA-Z.]/.test(e)}function Io(e){return/[a-zA-Z]/.test(e)}function $l(e){return/\s/.test(e)}function mr(e){return/[&|]/.test(e)}function hr(e){return/-/.test(e)}function Tl(e){return/["']/.test(e)}function gr(e){return Io(e)&&e===e.toUpperCase()}var $e;(function(e){e.OR="OR",e.AND="AND",e.PIPE="PIPE",e.Command="Command",e.Argument="Argument",e.String="String",e.EnvVar="EnvVar"})($e||($e={}));var Ol=new Map([["&&",{type:$e.AND}],["||",{type:$e.OR}],["|",{type:$e.PIPE}],["-",{type:$e.Argument}]]);function Al(e){var t=0,n=[];function o(){for(var s="";vr(e[t])&&t<e.length;)s+=e[t],t++;return{type:$e.Command,value:s}}function i(){for(var s="";mr(e[t])&&t<e.length;)s+=e[t],t++;return Ol.get(s)}function r(){for(var s="";(hr(e[t])||Io(e[t]))&&t<e.length;)s+=e[t],t++;return{type:$e.Argument,value:s}}function a(){var s=e[t],d=e[t];for(t++;e[t]!==s&&t<e.length;)d+=e[t],t++;return d+=e[t],t++,{type:$e.String,value:d}}function u(){for(var s={},d=function(){for(var f="",v="";e[t]!=="="&&t<e.length;)f+=e[t],t++;for(e[t]==="="&&t++;e[t]!==" "&&t<e.length;)v+=e[t],t++;s[f]=v};gr(e[t])&&t<e.length;)d(),t++;return{type:$e.EnvVar,value:s}}for(;t<e.length;){var l=e[t];if($l(l)){t++;continue}switch(!0){case gr(l):n.push(u());break;case vr(l):n.push(o());break;case mr(l):n.push(i());break;case hr(l):n.push(r());break;case Tl(l):n.push(a());break;default:throw new Error("Unknown character: ".concat(l))}}return n}var Ml=0;function _o(){var e=Date.now(),t=Math.round(Math.random()*1e4),n=Ml+=1;return(+"".concat(e).concat(t).concat(n)).toString(16)}var jt=function(e){return typeof e=="string"?new TextEncoder().encode(e):e},Kt=function(e){return typeof e=="string"?e:new TextDecoder().decode(e)},Do=function(e){return Object.entries(e).reduce(function(t,n){var o=n[0],i=n[1];return t[o]=jt(i.code),t},{})},Ll=function(e){var t={},n=["dev","start"];try{t=JSON.parse(e).scripts}catch(a){throw Ge("Could not parse package.json file: "+a.message)}jr(t,"Failed to start. Please provide a `start` or `dev` script on the package.json");for(var o=function(a){if(n[a]in t){var u=n[a],l=t[u],s={},d="",f=[];return Al(l).forEach(function(v){var m=d==="";v.type===$e.EnvVar&&(s=v.value),v.type===$e.Command&&m&&(d=v.value),(v.type===$e.Argument||!m&&v.type===$e.Command)&&f.push(v.value)}),{value:[d,f,{env:s}]}}},i=0;i<n.length;i++){var r=o(i);if(typeof r=="object")return r.value}throw Ge("Failed to start. Please provide a `start` or `dev` script on the package.json")},br=function(e){return typeof e=="string"?e:typeof e=="object"&&"message"in e?e.message:Ge("The server could not be reached. Make sure that the node script is running and that a port has been started.")},Fo=`var t="undefined"!=typeof globalThis?globalThis:"undefined"!=typeof window?window:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{};function r(t){return t&&t.__esModule&&Object.prototype.hasOwnProperty.call(t,"default")?t.default:t}var e={},n={};!function(t){t.__esModule=!0,t.default=["log","debug","info","warn","error","table","clear","time","timeEnd","count","assert","command","result"]}(n);var a,o={},i={};(a=i).__esModule=!0,a.default=function(){var t=function(){return(65536*(1+Math.random())|0).toString(16).substring(1)};return t()+t()+"-"+t()+"-"+t()+"-"+t()+"-"+t()+"-"+Date.now()};var u={},s={__esModule:!0};s.update=s.state=void 0,s.update=function(t){s.state=t};var f={},c={};!function(r){var e=t&&t.__assign||function(){return e=Object.assign||function(t){for(var r,e=1,n=arguments.length;e<n;e++)for(var a in r=arguments[e])Object.prototype.hasOwnProperty.call(r,a)&&(t[a]=r[a]);return t},e.apply(this,arguments)};r.__esModule=!0,r.initialState=void 0,r.initialState={timings:{},count:{}};var n=function(){return"undefined"!=typeof performance&&performance.now?performance.now():Date.now()};r.default=function(t,a){var o,i,u;switch(void 0===t&&(t=r.initialState),a.type){case"COUNT":var s=t.count[a.name]||0;return e(e({},t),{count:e(e({},t.count),(o={},o[a.name]=s+1,o))});case"TIME_START":return e(e({},t),{timings:e(e({},t.timings),(i={},i[a.name]={start:n()},i))});case"TIME_END":var f=t.timings[a.name],c=n(),l=c-f.start;return e(e({},t),{timings:e(e({},t.timings),(u={},u[a.name]=e(e({},f),{end:c,time:l}),u))});default:return t}}}(c),function(r){var e=t&&t.__importDefault||function(t){return t&&t.__esModule?t:{default:t}};r.__esModule=!0;var n=e(c),a=s;r.default=function(t){a.update(n.default(a.state,t))}}(f);var l={__esModule:!0};l.timeEnd=l.timeStart=l.count=void 0,l.count=function(t){return{type:"COUNT",name:t}},l.timeStart=function(t){return{type:"TIME_START",name:t}},l.timeEnd=function(t){return{type:"TIME_END",name:t}};var d=t&&t.__importDefault||function(t){return t&&t.__esModule?t:{default:t}};u.__esModule=!0,u.stop=u.start=void 0;var p=s,h=d(f),m=l;u.start=function(t){h.default(m.timeStart(t))},u.stop=function(t){var r=null===p.state||void 0===p.state?void 0:p.state.timings[t];return r&&!r.end?(h.default(m.timeEnd(t)),{method:"log",data:[t+": "+p.state.timings[t].time+"ms"]}):{method:"warn",data:["Timer '"+t+"' does not exist"]}};var y={},v=t&&t.__importDefault||function(t){return t&&t.__esModule?t:{default:t}};y.__esModule=!0,y.increment=void 0;var _=s,b=v(f),g=l;y.increment=function(t){return b.default(g.count(t)),{method:"log",data:[t+": "+_.state.count[t]]}};var M={},T=t&&t.__spreadArrays||function(){for(var t=0,r=0,e=arguments.length;r<e;r++)t+=arguments[r].length;var n=Array(t),a=0;for(r=0;r<e;r++)for(var o=arguments[r],i=0,u=o.length;i<u;i++,a++)n[a]=o[i];return n};M.__esModule=!0,M.test=void 0,M.test=function(t){for(var r=[],e=1;e<arguments.length;e++)r[e-1]=arguments[e];return!t&&(0===r.length&&r.push("console.assert"),{method:"error",data:T(["Assertion failed:"],r)})},function(r){var e=t&&t.__assign||function(){return e=Object.assign||function(t){for(var r,e=1,n=arguments.length;e<n;e++)for(var a in r=arguments[e])Object.prototype.hasOwnProperty.call(r,a)&&(t[a]=r[a]);return t},e.apply(this,arguments)},n=t&&t.__createBinding||(Object.create?function(t,r,e,n){void 0===n&&(n=e),Object.defineProperty(t,n,{enumerable:!0,get:function(){return r[e]}})}:function(t,r,e,n){void 0===n&&(n=e),t[n]=r[e]}),a=t&&t.__setModuleDefault||(Object.create?function(t,r){Object.defineProperty(t,"default",{enumerable:!0,value:r})}:function(t,r){t.default=r}),o=t&&t.__importStar||function(t){if(t&&t.__esModule)return t;var r={};if(null!=t)for(var e in t)"default"!==e&&Object.prototype.hasOwnProperty.call(t,e)&&n(r,t,e);return a(r,t),r},s=t&&t.__spreadArrays||function(){for(var t=0,r=0,e=arguments.length;r<e;r++)t+=arguments[r].length;var n=Array(t),a=0;for(r=0;r<e;r++)for(var o=arguments[r],i=0,u=o.length;i<u;i++,a++)n[a]=o[i];return n},f=t&&t.__importDefault||function(t){return t&&t.__esModule?t:{default:t}};r.__esModule=!0;var c=f(i),l=o(u),d=o(y),p=o(M);r.default=function(t,r,n){var a=n||c.default();switch(t){case"clear":return{method:t,id:a};case"count":return!!(o="string"==typeof r[0]?r[0]:"default")&&e(e({},d.increment(o)),{id:a});case"time":case"timeEnd":var o;return!!(o="string"==typeof r[0]?r[0]:"default")&&("time"===t?(l.start(o),!1):e(e({},l.stop(o)),{id:a}));case"assert":if(0!==r.length){var i=p.test.apply(p,s([r[0]],r.slice(1)));if(i)return e(e({},i),{id:a})}return!1;case"error":return{method:t,id:a,data:r.map((function(t){try{return t.stack||t}catch(r){return t}}))};default:return{method:t,id:a,data:r}}}}(o);var S={},O={};!function(t){var r;t.__esModule=!0,function(t){t[t.infinity=0]="infinity",t[t.minusInfinity=1]="minusInfinity",t[t.minusZero=2]="minusZero"}(r||(r={})),t.default={type:"Arithmetic",lookup:Number,shouldTransform:function(t,r){return"number"===t&&(r===1/0||r===-1/0||function(t){return 1/t==-1/0}(r))},toSerializable:function(t){return t===1/0?r.infinity:t===-1/0?r.minusInfinity:r.minusZero},fromSerializable:function(t){return t===r.infinity?1/0:t===r.minusInfinity?-1/0:t===r.minusZero?-0:t}}}(O);var w={};!function(t){t.__esModule=!0,t.default={type:"Function",lookup:Function,shouldTransform:function(t,r){return"function"==typeof r},toSerializable:function(t){var r="";try{r=t.toString().substring(r.indexOf("{")+1,r.lastIndexOf("}"))}catch(t){}return{name:t.name,body:r,proto:Object.getPrototypeOf(t).constructor.name}},fromSerializable:function(t){try{var r=function(){};return"string"==typeof t.name&&Object.defineProperty(r,"name",{value:t.name,writable:!1}),"string"==typeof t.body&&Object.defineProperty(r,"body",{value:t.body,writable:!1}),"string"==typeof t.proto&&(r.constructor={name:t.proto}),r}catch(r){return t}}}}(w);var A={};!function(t){var r;function e(t){for(var r={},e=0,n=t.attributes;e<n.length;e++){var a=n[e];r[a.name]=a.value}return r}t.__esModule=!0,t.default={type:"HTMLElement",shouldTransform:function(t,r){return r&&r.children&&"string"==typeof r.innerHTML&&"string"==typeof r.tagName},toSerializable:function(t){return{tagName:t.tagName.toLowerCase(),attributes:e(t),innerHTML:t.innerHTML}},fromSerializable:function(t){try{var e=(r||(r=document.implementation.createHTMLDocument("sandbox"))).createElement(t.tagName);e.innerHTML=t.innerHTML;for(var n=0,a=Object.keys(t.attributes);n<a.length;n++){var o=a[n];try{e.setAttribute(o,t.attributes[o])}catch(t){}}return e}catch(r){return t}}}}(A);var j={};!function(r){var e=t&&t.__assign||function(){return e=Object.assign||function(t){for(var r,e=1,n=arguments.length;e<n;e++)for(var a in r=arguments[e])Object.prototype.hasOwnProperty.call(r,a)&&(t[a]=r[a]);return t},e.apply(this,arguments)};r.__esModule=!0,r.default={type:"Map",shouldTransform:function(t,r){return r&&r.constructor&&"Map"===r.constructor.name},toSerializable:function(t){var r={};return t.forEach((function(t,e){var n="object"==typeof e?JSON.stringify(e):e;r[n]=t})),{name:"Map",body:r,proto:Object.getPrototypeOf(t).constructor.name}},fromSerializable:function(t){var r=t.body,n=e({},r);return"string"==typeof t.proto&&(n.constructor={name:t.proto}),n}}}(j);var z={};!function(t){t.__esModule=!0;var r="@t",e=/^#*@(t|r)$/,n=(0,eval)("this"),a="function"==typeof ArrayBuffer,o="function"==typeof Map,i="function"==typeof Set,u=["Int8Array","Uint8Array","Uint8ClampedArray","Int16Array","Uint16Array","Int32Array","Uint32Array","Float32Array","Float64Array"],s=Array.prototype.slice,f={serialize:function(t){return JSON.stringify(t)},deserialize:function(t){return JSON.parse(t)}},c=function(){function t(t,r){this.references=t,this.transforms=r,this.transformsMap=this._makeTransformsMap(),this.circularCandidates=[],this.circularCandidatesDescrs=[],this.circularRefCount=0}return t._createRefMark=function(t){var r=Object.create(null);return r["@r"]=t,r},t.prototype._createCircularCandidate=function(t,r,e){this.circularCandidates.push(t),this.circularCandidatesDescrs.push({parent:r,key:e,refIdx:-1})},t.prototype._applyTransform=function(t,e,n,a){var o=Object.create(null),i=a.toSerializable(t);return"object"==typeof i&&this._createCircularCandidate(t,e,n),o[r]=a.type,o.data=this._handleValue((function(){return i}),e,n),o},t.prototype._handleArray=function(t){for(var r=[],e=function(e){r[e]=n._handleValue((function(){return t[e]}),r,e)},n=this,a=0;a<t.length;a++)e(a);return r},t.prototype._handlePlainObject=function(t){var r,n,a=Object.create(null),o=function(r){if(Reflect.has(t,r)){var n=e.test(r)?"#"+r:r;a[n]=i._handleValue((function(){return t[r]}),a,n)}},i=this;for(var u in t)o(u);var s=null===(n=null===(r=null==t?void 0:t.__proto__)||void 0===r?void 0:r.constructor)||void 0===n?void 0:n.name;return s&&"Object"!==s&&(a.constructor={name:s}),a},t.prototype._handleObject=function(t,r,e){return this._createCircularCandidate(t,r,e),Array.isArray(t)?this._handleArray(t):this._handlePlainObject(t)},t.prototype._ensureCircularReference=function(r){var e=this.circularCandidates.indexOf(r);if(e>-1){var n=this.circularCandidatesDescrs[e];return-1===n.refIdx&&(n.refIdx=n.parent?++this.circularRefCount:0),t._createRefMark(n.refIdx)}return null},t.prototype._handleValue=function(t,r,e){try{var n=t(),a=typeof n,o="object"===a&&null!==n;if(o){var i=this._ensureCircularReference(n);if(i)return i}var u=this._findTransform(a,n);return u?this._applyTransform(n,r,e,u):o?this._handleObject(n,r,e):n}catch(t){try{return this._handleValue((function(){return t instanceof Error?t:new Error(t)}),r,e)}catch(t){return null}}},t.prototype._makeTransformsMap=function(){if(o){var t=new Map;return this.transforms.forEach((function(r){r.lookup&&t.set(r.lookup,r)})),t}},t.prototype._findTransform=function(t,r){if(o&&r&&r.constructor&&(null==(a=this.transformsMap.get(r.constructor))?void 0:a.shouldTransform(t,r)))return a;for(var e=0,n=this.transforms;e<n.length;e++){var a;if((a=n[e]).shouldTransform(t,r))return a}},t.prototype.transform=function(){for(var r=this,e=[this._handleValue((function(){return r.references}),null,null)],n=0,a=this.circularCandidatesDescrs;n<a.length;n++){var o=a[n];o.refIdx>0&&(e[o.refIdx]=o.parent[o.key],o.parent[o.key]=t._createRefMark(o.refIdx))}return e},t}(),l=function(){function t(t,r){this.activeTransformsStack=[],this.visitedRefs=Object.create(null),this.references=t,this.transformMap=r}return t.prototype._handlePlainObject=function(t){var r=Object.create(null);for(var n in"constructor"in t&&(t.constructor&&"string"==typeof t.constructor.name||(t.constructor={name:"Object"})),t)t.hasOwnProperty(n)&&(this._handleValue(t[n],t,n),e.test(n)&&(r[n.substring(1)]=t[n],delete t[n]));for(var a in r)t[a]=r[a]},t.prototype._handleTransformedObject=function(t,e,n){var a=t[r],o=this.transformMap[a];if(!o)throw new Error("Can't find transform for \\""+a+'" type.');this.activeTransformsStack.push(t),this._handleValue(t.data,t,"data"),this.activeTransformsStack.pop(),e[n]=o.fromSerializable(t.data)},t.prototype._handleCircularSelfRefDuringTransform=function(t,r,e){var n=this.references;Object.defineProperty(r,e,{val:void 0,configurable:!0,enumerable:!0,get:function(){return void 0===this.val&&(this.val=n[t]),this.val},set:function(t){this.val=t}})},t.prototype._handleCircularRef=function(t,r,e){this.activeTransformsStack.includes(this.references[t])?this._handleCircularSelfRefDuringTransform(t,r,e):(this.visitedRefs[t]||(this.visitedRefs[t]=!0,this._handleValue(this.references[t],this.references,t)),r[e]=this.references[t])},t.prototype._handleValue=function(t,e,n){if("object"==typeof t&&null!==t){var a=t["@r"];if(void 0!==a)this._handleCircularRef(a,e,n);else if(t[r])this._handleTransformedObject(t,e,n);else if(Array.isArray(t))for(var o=0;o<t.length;o++)this._handleValue(t[o],t,o);else this._handlePlainObject(t)}},t.prototype.transform=function(){return this.visitedRefs[0]=!0,this._handleValue(this.references[0],this.references,0),this.references[0]},t}(),d=[{type:"[[NaN]]",shouldTransform:function(t,r){return"number"===t&&isNaN(r)},toSerializable:function(){return""},fromSerializable:function(){return NaN}},{type:"[[undefined]]",shouldTransform:function(t){return"undefined"===t},toSerializable:function(){return""},fromSerializable:function(){}},{type:"[[Date]]",lookup:Date,shouldTransform:function(t,r){return r instanceof Date},toSerializable:function(t){return t.getTime()},fromSerializable:function(t){var r=new Date;return r.setTime(t),r}},{type:"[[RegExp]]",lookup:RegExp,shouldTransform:function(t,r){return r instanceof RegExp},toSerializable:function(t){var r={src:t.source,flags:""};return t.globalThis&&(r.flags+="g"),t.ignoreCase&&(r.flags+="i"),t.multiline&&(r.flags+="m"),r},fromSerializable:function(t){return new RegExp(t.src,t.flags)}},{type:"[[Error]]",lookup:Error,shouldTransform:function(t,r){return r instanceof Error},toSerializable:function(t){var r,e;return t.stack||null===(e=(r=Error).captureStackTrace)||void 0===e||e.call(r,t),{name:t.name,message:t.message,stack:t.stack}},fromSerializable:function(t){var r=new(n[t.name]||Error)(t.message);return r.stack=t.stack,r}},{type:"[[ArrayBuffer]]",lookup:a&&ArrayBuffer,shouldTransform:function(t,r){return a&&r instanceof ArrayBuffer},toSerializable:function(t){var r=new Int8Array(t);return s.call(r)},fromSerializable:function(t){if(a){var r=new ArrayBuffer(t.length);return new Int8Array(r).set(t),r}return t}},{type:"[[TypedArray]]",shouldTransform:function(t,r){if(a)return ArrayBuffer.isView(r)&&!(r instanceof DataView);for(var e=0,o=u;e<o.length;e++){var i=o[e];if("function"==typeof n[i]&&r instanceof n[i])return!0}return!1},toSerializable:function(t){return{ctorName:t.constructor.name,arr:s.call(t)}},fromSerializable:function(t){return"function"==typeof n[t.ctorName]?new n[t.ctorName](t.arr):t.arr}},{type:"[[Map]]",lookup:o&&Map,shouldTransform:function(t,r){return o&&r instanceof Map},toSerializable:function(t){var r=[];return t.forEach((function(t,e){r.push(e),r.push(t)})),r},fromSerializable:function(t){if(o){for(var r=new Map,e=0;e<t.length;e+=2)r.set(t[e],t[e+1]);return r}for(var n=[],a=0;a<t.length;a+=2)n.push([t[e],t[e+1]]);return n}},{type:"[[Set]]",lookup:i&&Set,shouldTransform:function(t,r){return i&&r instanceof Set},toSerializable:function(t){var r=[];return t.forEach((function(t){r.push(t)})),r},fromSerializable:function(t){if(i){for(var r=new Set,e=0;e<t.length;e++)r.add(t[e]);return r}return t}}],p=function(){function t(t){this.transforms=[],this.transformsMap=Object.create(null),this.serializer=t||f,this.addTransforms(d)}return t.prototype.addTransforms=function(t){for(var r=0,e=t=Array.isArray(t)?t:[t];r<e.length;r++){var n=e[r];if(this.transformsMap[n.type])throw new Error('Transform with type "'+n.type+'" was already added.');this.transforms.push(n),this.transformsMap[n.type]=n}return this},t.prototype.removeTransforms=function(t){for(var r=0,e=t=Array.isArray(t)?t:[t];r<e.length;r++){var n=e[r],a=this.transforms.indexOf(n);a>-1&&this.transforms.splice(a,1),delete this.transformsMap[n.type]}return this},t.prototype.encode=function(t){var r=new c(t,this.transforms).transform();return this.serializer.serialize(r)},t.prototype.decode=function(t){var r=this.serializer.deserialize(t);return new l(r,this.transformsMap).transform()},t}();t.default=p}(z);var E=t&&t.__importDefault||function(t){return t&&t.__esModule?t:{default:t}};S.__esModule=!0,S.Decode=P=S.Encode=void 0;var k=E(O),C=E(w),D=E(A),I=E(j),N=E(z),R=[D.default,C.default,k.default,I.default],x=new N.default;x.addTransforms(R);var P=S.Encode=function(t){return JSON.parse(x.encode(t))};S.Decode=function(t){return x.decode(JSON.stringify(t))},function(r){var e=t&&t.__importDefault||function(t){return t&&t.__esModule?t:{default:t}};r.__esModule=!0;var a=e(n),i=e(o),u=S;r.default=function(t,r,e){void 0===e&&(e=!0);for(var n=t,o={pointers:{},src:{npm:"https://npmjs.com/package/console-feed",github:"https://github.com/samdenty99/console-feed"}},s=function(t){var a=n[t];n[t]=function(){a.apply(this,arguments);var n=[].slice.call(arguments);setTimeout((function(){var a=i.default(t,n);if(a){var o=a;e&&(o=u.Encode(a)),r(o,a)}}))},o.pointers[t]=a},f=0,c=a.default;f<c.length;f++)s(c[f]);return n.feed=o,n}}(e),r(e)(window.console,(function(t){var r=P(t);parent.postMessage({type:"console",codesandbox:!0,log:Array.isArray(r)?r[0]:r,channelId:scope.channelId},"*")}));
`;function Rl(e,t){return Ee(this,void 0,void 0,function(){var n,o,i,r,a;return ke(this,function(u){return n=e.contentWindow,We(n,"Failed to await preview iframe: no content window found"),o=9e4,i=20,r=0,[2,new Promise(function(l,s){var d=function(){var f=function(){clearTimeout(a),r=i,l(),e.removeEventListener("load",f)};if(r>=i){s(Ge("Could not able to connect to preview."));return}e.setAttribute("src",t),a=setTimeout(function(){d(),e.removeEventListener("load",f)},o),r=r+1,e.addEventListener("load",f)};e.addEventListener("error",function(){return s(new Error("Iframe error"))}),e.addEventListener("abort",function(){return s(new Error("Aborted"))}),d()})]})})}var Il=function(e,t){e.style.border="0",e.style.width=t.width||"100%",e.style.height=t.height||"100%",e.style.overflow="hidden",e.allow="cross-origin-isolated"};function _l(e){var t=e.scope,n=window.history.__proto__,o=[],i=0,r=function(l){parent.postMessage({type:"urlchange",url:l,back:i>0,forward:i<o.length-1,channelId:t.channelId},"*")};function a(l,s){o.splice(i+1),o.push({url:l,state:s}),i=o.length-1}Object.assign(window.history,{go:function(l){var s=i+l;if(s>=0&&s<=o.length-1){i=s;var d=o[i],f=d.url,v=d.state;n.replaceState.call(window.history,v,"",f);var m=document.location.href;r(m),window.dispatchEvent(new PopStateEvent("popstate",{state:v}))}},back:function(){window.history.go(-1)},forward:function(){window.history.go(1)},pushState:function(l,s,d){n.replaceState.call(window.history,l,s,d),a(d,l),r(document.location.href)},replaceState:function(l,s,d){n.replaceState.call(window.history,l,s,d),o[i]={state:l,url:d},r(document.location.href)}});function u(l){var s=l.data;s.type==="urlback"?history.back():s.type==="urlforward"?history.forward():s.type==="refresh"&&document.location.reload()}window.addEventListener("message",u)}function Dl(e){var t=e.scope,n=0;function o(){if(typeof window>"u")return 0;var u=document.body,l=document.documentElement;return Math.max(u.scrollHeight,u.offsetHeight,l.offsetHeight)}function i(){var u=o();n!==u&&window.parent.postMessage({type:"resize",height:u,codesandbox:!0,channelId:t.channelId},"*"),n=u}i();var r,a=new MutationObserver(function(){r===void 0&&(i(),r=setTimeout(function(){r=void 0},300))});a.observe(document,{attributes:!0,childList:!0,subtree:!0}),setInterval(i,300)}var Fl=[{code:_l.toString(),id:"historyListener"},{code:"function consoleHook({ scope }) {"+Fo+`
};`,id:"consoleHook"},{code:Dl.toString(),id:"watchResize"}],Pl=function(e,t){Fl.forEach(function(n){var o,i=n.code,r=n.id,a={uid:r,type:Vo,code:"exports.activate = ".concat(i),scope:{channelId:t}};(o=e.contentWindow)===null||o===void 0||o.postMessage(a,"*")})},Bl=function(e){xn(t,e);function t(n,o,i){i===void 0&&(i={});var r=e.call(this,n,o,se(se({},i),{bundlerURL:i.bundlerURL}))||this;return r._modulesCache=new Map,r.messageChannelId=_o(),r._initPromise=null,r.emitter=new Ro,r.manageIframes(n),r.emulator=new zo({iframe:r.emulatorIframe,runtimeUrl:r.options.bundlerURL}),r.updateSandbox(o),r}return t.prototype._init=function(n){return Ee(this,void 0,void 0,function(){return ke(this,function(o){switch(o.label){case 0:return[4,this.emulator.connect()];case 1:return o.sent(),[4,this.emulator.fs.init(n)];case 2:return o.sent(),[4,this.globalListeners()];case 3:return o.sent(),[2]}})})},t.prototype.compile=function(n){return Ee(this,void 0,void 0,function(){var o,i;return ke(this,function(r){switch(r.label){case 0:return r.trys.push([0,5,,6]),this.status="initializing",this.dispatch({type:"start",firstLoad:!0}),this._initPromise||(this._initPromise=this._init(n)),[4,this._initPromise];case 1:return r.sent(),this.dispatch({type:"connected"}),[4,this.createShellProcessFromTask(n)];case 2:return o=r.sent().id,[4,this.createPreviewURLFromId(o)];case 3:return r.sent(),[4,this.setLocationURLIntoIFrame()];case 4:return r.sent(),this.dispatchDoneMessage(),[3,6];case 5:return i=r.sent(),this.dispatch({type:"action",action:"notification",notificationType:"error",title:br(i)}),this.dispatch({type:"done",compilatonError:!0}),[3,6];case 6:return[2]}})})},t.prototype.createShellProcessFromTask=function(n){return Ee(this,void 0,void 0,function(){var o,i,r=this;return ke(this,function(a){switch(a.label){case 0:return o=Kt(n["/package.json"]),this.emulatorCommand=Ll(o),this.emulatorShellProcess=this.emulator.shell.create(),[4,this.emulatorShellProcess.on("exit",function(u){r.dispatch({type:"action",action:"notification",notificationType:"error",title:Ge("Error: process.exit(".concat(u,") called."))})})];case 1:return a.sent(),[4,this.emulatorShellProcess.on("progress",function(u){var l,s;if(u.state==="command_running"||u.state==="starting_command"){r.dispatch({type:"shell/progress",data:se(se({},u),{command:[(l=r.emulatorCommand)===null||l===void 0?void 0:l[0],(s=r.emulatorCommand)===null||s===void 0?void 0:s[1].join(" ")].join(" ")})}),r.status="installing-dependencies";return}r.dispatch({type:"shell/progress",data:u})})];case 2:return a.sent(),this.emulatorShellProcess.stdout.on("data",function(u){r.dispatch({type:"stdout",payload:{data:u,type:"out"}})}),this.emulatorShellProcess.stderr.on("data",function(u){r.dispatch({type:"stdout",payload:{data:u,type:"err"}})}),[4,(i=this.emulatorShellProcess).runCommand.apply(i,this.emulatorCommand)];case 3:return[2,a.sent()]}})})},t.prototype.createPreviewURLFromId=function(n){var o;return Ee(this,void 0,void 0,function(){var i;return ke(this,function(r){switch(r.label){case 0:return this.iframePreviewUrl=void 0,[4,this.emulator.preview.getByShellId(n)];case 1:return i=r.sent().url,this.iframePreviewUrl=i+((o=this.options.startRoute)!==null&&o!==void 0?o:""),[2]}})})},t.prototype.manageIframes=function(n){var o;if(typeof n=="string"){var i=document.querySelector(n);We(i,"The element '".concat(n,"' was not found")),this.iframe=document.createElement("iframe"),i==null||i.appendChild(this.iframe)}else this.iframe=n;Il(this.iframe,this.options),We(this.iframe.parentNode,"The given iframe does not have a parent."),this.emulatorIframe=document.createElement("iframe"),this.emulatorIframe.classList.add("sp-bridge-frame"),(o=this.iframe.parentNode)===null||o===void 0||o.appendChild(this.emulatorIframe)},t.prototype.setLocationURLIntoIFrame=function(){return Ee(this,void 0,void 0,function(){return ke(this,function(n){switch(n.label){case 0:return this.iframePreviewUrl?[4,Rl(this.iframe,this.iframePreviewUrl)]:[3,2];case 1:n.sent(),n.label=2;case 2:return[2]}})})},t.prototype.dispatchDoneMessage=function(){this.status="done",this.dispatch({type:"done",compilatonError:!1}),this.iframePreviewUrl&&this.dispatch({type:"urlchange",url:this.iframePreviewUrl,back:!1,forward:!1})},t.prototype.globalListeners=function(){return Ee(this,void 0,void 0,function(){var n=this;return ke(this,function(o){switch(o.label){case 0:return window.addEventListener("message",function(i){i.data.type===Uo&&Pl(n.iframe,n.messageChannelId),i.data.type==="urlchange"&&i.data.channelId===n.messageChannelId?n.dispatch({type:"urlchange",url:i.data.url,back:i.data.back,forward:i.data.forward}):i.data.channelId===n.messageChannelId&&n.dispatch(i.data)}),[4,this.emulator.fs.watch(["*"],[".next","node_modules","build","dist","vendor",".config",".vuepress"],function(i){return Ee(n,void 0,void 0,function(){var r,a,u,l,s,d,f;return ke(this,function(v){switch(v.label){case 0:return i?(r=i,a="newPath"in r?r.newPath:"path"in r?r.path:"",[4,this.emulator.fs.stat(a)]):[2];case 1:if(u=v.sent().type,u!=="file")return[2,null];v.label=2;case 2:switch(v.trys.push([2,10,,11]),l=r.type,l){case"change":return[3,3];case"create":return[3,3];case"remove":return[3,5];case"rename":return[3,6];case"close":return[3,8]}return[3,9];case 3:return[4,this.emulator.fs.readFile(r.path,"utf8")];case 4:return s=v.sent(),this.dispatch({type:"fs/change",path:r.path,content:s}),this._modulesCache.set(r.path,jt(s)),[3,9];case 5:return this.dispatch({type:"fs/remove",path:r.path}),this._modulesCache.delete(r.path),[3,9];case 6:return this.dispatch({type:"fs/remove",path:r.oldPath}),this._modulesCache.delete(r.oldPath),[4,this.emulator.fs.readFile(r.newPath,"utf8")];case 7:return d=v.sent(),this.dispatch({type:"fs/change",path:r.newPath,content:d}),this._modulesCache.set(r.newPath,jt(d)),[3,9];case 8:return[3,9];case 9:return[3,11];case 10:return f=v.sent(),this.dispatch({type:"action",action:"notification",notificationType:"error",title:br(f)}),[3,11];case 11:return[2]}})})})];case 1:return o.sent(),[2]}})})},t.prototype.restartShellProcess=function(){var n;return Ee(this,void 0,void 0,function(){return ke(this,function(o){switch(o.label){case 0:return this.emulatorShellProcess&&this.emulatorCommand?(this.dispatch({type:"start",firstLoad:!0}),this.status="initializing",[4,this.emulatorShellProcess.kill()]):[3,3];case 1:return o.sent(),(n=this.iframe)===null||n===void 0||n.removeAttribute("attr"),this.emulator.fs.rm("/node_modules/.vite",{recursive:!0,force:!0}),[4,this.compile(Object.fromEntries(this._modulesCache))];case 2:o.sent(),o.label=3;case 3:return[2]}})})},t.prototype.updateSandbox=function(n){var o=this,i,r=Do(n.files);if(((i=this.emulatorShellProcess)===null||i===void 0?void 0:i.state)==="running"){Object.entries(r).forEach(function(a){var u=a[0],l=a[1];(!o._modulesCache.get(u)||Kt(l)!==Kt(o._modulesCache.get(u)))&&o.emulator.fs.writeFile(u,l,{recursive:!0})});return}this.dispatch({codesandbox:!0,modules:r,template:n.template,type:"compile"}),Object.entries(r).forEach(function(a){var u=a[0],l=a[1];o._modulesCache.set(u,jt(l))})},t.prototype.dispatch=function(n){var o,i;return Ee(this,void 0,void 0,function(){var r;return ke(this,function(a){switch(a.label){case 0:switch(r=n.type,r){case"compile":return[3,1];case"refresh":return[3,2];case"urlback":return[3,4];case"urlforward":return[3,4];case"shell/restart":return[3,5];case"shell/openPreview":return[3,6]}return[3,7];case 1:return this.compile(n.modules),[3,8];case 2:return[4,this.setLocationURLIntoIFrame()];case 3:return a.sent(),[3,8];case 4:return(i=(o=this.iframe)===null||o===void 0?void 0:o.contentWindow)===null||i===void 0||i.postMessage(n,"*"),[3,8];case 5:return this.restartShellProcess(),[3,8];case 6:return window.open(this.iframePreviewUrl,"_blank"),[3,8];case 7:this.emitter.dispatch(n),a.label=8;case 8:return[2]}})})},t.prototype.listen=function(n){return this.emitter.listener(n)},t.prototype.destroy=function(){this.emulatorIframe.remove(),this.emitter.cleanup()},t}(Ln);const Hl=Object.freeze(Object.defineProperty({__proto__:null,SandpackNode:Bl},Symbol.toStringTag,{value:"Module"}));var Ul=function(e,t,n){var o=e.exec(t);if(o&&o.length>=1){var i=o.index+o[0].length,r=t.substring(0,i),a=t.substring(i);return r+n+a}},Po=function(e){return typeof e=="string"?e:new TextDecoder().decode(e)},zl=function(e){var t=Po(e),n=new DOMParser,o=n.parseFromString(t,"text/html");o.documentElement.getAttribute("lang")||o.documentElement.setAttribute("lang","en");var i=o.documentElement.outerHTML;return`<!DOCTYPE html>
`.concat(i)},Vl=function(e){xn(t,e);function t(n,o,i){i===void 0&&(i={});var r,a=e.call(this,n,o,i)||this;if(a.files=new Map,a.status="initializing",a.emitter=new Ro,a.previewController=new Jo.PreviewController({baseUrl:(r=i.bundlerURL)!==null&&r!==void 0?r:"https://preview.sandpack-static-server.codesandbox.io",getFileContent:function(l){var s=a.files.get(l);if(!s)throw new Error("File not found");if(l.endsWith(".html")||l.endsWith(".htm"))try{s=zl(s),s=a.injectProtocolScript(s),s=a.injectExternalResources(s,i.externalResources),s=a.injectScriptIntoHead(s,{script:Fo,scope:{channelId:_o()}})}catch(d){console.error("Runtime injection failed",d)}return s}}),typeof n=="string"){a.selector=n;var u=document.querySelector(n);a.element=u,a.iframe=document.createElement("iframe")}else a.element=n,a.iframe=n;return a.iframe.getAttribute("sandbox")||(a.iframe.setAttribute("sandbox","allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts allow-downloads allow-pointer-lock"),a.iframe.setAttribute("allow","accelerometer; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; clipboard-read; clipboard-write; xr-spatial-tracking;")),a.eventListener=a.eventListener.bind(a),typeof window<"u"&&window.addEventListener("message",a.eventListener),a.updateSandbox(),a}return t.prototype.injectContentIntoHead=function(n,o){var i;return n=Po(n),n=(i=Ul(/<head[^<>]*>/g,n,`
`+o))!==null&&i!==void 0?i:o+`
`+n,n},t.prototype.injectProtocolScript=function(n){var o=`<script>
  window.addEventListener("message", (message) => {
    if(message.data.type === "refresh") {
      window.location.reload();
    }
  })
<\/script>`;return this.injectContentIntoHead(n,o)},t.prototype.injectExternalResources=function(n,o){o===void 0&&(o=[]);var i=o.map(function(r){var a=r.match(/\.([^.]*)$/),u=a==null?void 0:a[1];if(u==="css"||r.includes("fonts.googleapis"))return'<link rel="stylesheet" href="'.concat(r,'">');if(u==="js")return'<script src="'.concat(r,'"><\/script>');throw new Error("Unable to determine file type for external resource: ".concat(r))}).join(`
`);return this.injectContentIntoHead(n,i)},t.prototype.injectScriptIntoHead=function(n,o){var i=o.script,r=o.scope,a=r===void 0?{}:r,u=`
    <script>
      const scope = `.concat(JSON.stringify(a),`;
      `).concat(i,`
    <\/script>
    `).trim();return this.injectContentIntoHead(n,u)},t.prototype.updateSandbox=function(n,o){n===void 0&&(n=this.sandboxSetup);var i=Do(n.files);this.dispatch({codesandbox:!0,modules:i,template:n.template,type:"compile"})},t.prototype.compile=function(n){return Ee(this,void 0,void 0,function(){var o;return ke(this,function(i){switch(i.label){case 0:return this.files=new Map(Object.entries(n)),[4,this.previewController.initPreview()];case 1:return o=i.sent(),this.iframe.setAttribute("src",o),this.status="done",this.dispatch({type:"done",compilatonError:!1}),this.dispatch({type:"urlchange",url:o,back:!1,forward:!1}),[2]}})})},t.prototype.eventListener=function(n){if(n.source===this.iframe.contentWindow){var o=n.data;o.codesandbox&&this.dispatch(o)}},t.prototype.dispatch=function(n){var o;switch(n.type){case"compile":this.compile(n.modules);break;default:(o=this.iframe.contentWindow)===null||o===void 0||o.postMessage(n,"*"),this.emitter.dispatch(n)}},t.prototype.listen=function(n){return this.emitter.listener(n)},t.prototype.destroy=function(){this.emitter.cleanup(),typeof window<"u"&&window.removeEventListener("message",this.eventListener)},t}(Ln);const Jl=Object.freeze(Object.defineProperty({__proto__:null,SandpackStatic:Vl},Symbol.toStringTag,{value:"Module"}));var Wl=function(){function e(t,n,o){var i=this;this.type=t,this.handleMessage=n,this.protocol=o,this._disposeMessageListener=this.protocol.channelListen(function(r){return Ee(i,void 0,void 0,function(){var a,u,s,l,s;return ke(this,function(d){switch(d.label){case 0:if(!(r.type===this.getTypeId()&&r.method))return[3,4];a=r,d.label=1;case 1:return d.trys.push([1,3,,4]),[4,this.handleMessage(a)];case 2:return u=d.sent(),s={type:this.getTypeId(),msgId:a.msgId,result:u},this.protocol.dispatch(s),[3,4];case 3:return l=d.sent(),s={type:this.getTypeId(),msgId:a.msgId,error:{message:l.message}},this.protocol.dispatch(s),[3,4];case 4:return[2]}})})})}return e.prototype.getTypeId=function(){return"protocol-".concat(this.type)},e.prototype.dispose=function(){this._disposeMessageListener()},e}(),Yl=function(){function e(t,n){this.globalListeners={},this.globalListenersCount=0,this.channelListeners={},this.channelListenersCount=0,this.channelId=Math.floor(Math.random()*1e6),this.frameWindow=t.contentWindow,this.origin=n,this.globalListeners=[],this.channelListeners=[],this.eventListener=this.eventListener.bind(this),typeof window<"u"&&window.addEventListener("message",this.eventListener)}return e.prototype.cleanup=function(){window.removeEventListener("message",this.eventListener),this.globalListeners={},this.channelListeners={},this.globalListenersCount=0,this.channelListenersCount=0},e.prototype.register=function(){this.frameWindow&&this.frameWindow.postMessage({type:"register-frame",origin:document.location.origin,id:this.channelId},this.origin)},e.prototype.dispatch=function(t){this.frameWindow&&this.frameWindow.postMessage(se({$id:this.channelId,codesandbox:!0},t),this.origin)},e.prototype.globalListen=function(t){var n=this;if(typeof t!="function")return function(){};var o=this.globalListenersCount;return this.globalListeners[o]=t,this.globalListenersCount++,function(){delete n.globalListeners[o]}},e.prototype.channelListen=function(t){var n=this;if(typeof t!="function")return function(){};var o=this.channelListenersCount;return this.channelListeners[o]=t,this.channelListenersCount++,function(){delete n.channelListeners[o]}},e.prototype.eventListener=function(t){if(t.source===this.frameWindow){var n=t.data;n.codesandbox&&(Object.values(this.globalListeners).forEach(function(o){return o(n)}),n.$id===this.channelId&&Object.values(this.channelListeners).forEach(function(o){return o(n)}))}},e}(),Bo=new Map,Zl=Object.entries(Wo);for(var Xt=0,yr=Zl;Xt<yr.length;Xt++){var xr=yr[Xt],ql=xr[0],wr=xr[1];if(wr.extensions){var Sr=wr.extensions;if(Sr.length)for(var Qt=0,Cr=Sr;Qt<Cr.length;Qt++){var Gl=Cr[Qt];Bo.set(Gl,ql)}}}var Kl=Bo,wt="$CSB_RELAY",Xl=50;function Ql(e,t){if(!e)return"static";var n=e.dependencies,o=n===void 0?{}:n,i=e.devDependencies,r=i===void 0?{}:i,a=Tt(Tt([],Object.keys(o),!0),Object.keys(r),!0),u=Object.keys(t),l=["@adonisjs/framework","@adonisjs/core"];if(a.some(function(g){return l.indexOf(g)>-1}))return"adonis";var s=["nuxt","nuxt-edge","nuxt-ts","nuxt-ts-edge","nuxt3"];if(a.some(function(g){return s.indexOf(g)>-1}))return"nuxt";if(a.indexOf("next")>-1)return"next";var d=["apollo-server","apollo-server-express","apollo-server-hapi","apollo-server-koa","apollo-server-lambda","apollo-server-micro"];if(a.some(function(g){return d.indexOf(g)>-1}))return"apollo";if(a.indexOf("mdx-deck")>-1)return"mdx-deck";if(a.indexOf("gridsome")>-1)return"gridsome";if(a.indexOf("vuepress")>-1)return"vuepress";if(a.indexOf("ember-cli")>-1)return"ember";if(a.indexOf("sapper")>-1)return"sapper";if(a.indexOf("gatsby")>-1)return"gatsby";if(a.indexOf("quasar")>-1)return"quasar";if(a.indexOf("@docusaurus/core")>-1)return"docusaurus";if(a.indexOf("remix")>-1)return"remix";if(a.indexOf("astro")>-1)return"node";if(u.some(function(g){return g.endsWith(".re")}))return"reason";var f=["parcel-bundler","parcel"];if(a.some(function(g){return f.indexOf(g)>-1}))return"parcel";var v=["@dojo/core","@dojo/framework"];if(a.some(function(g){return v.indexOf(g)>-1}))return"@dojo/cli-create-app";if(a.indexOf("@nestjs/core")>-1||a.indexOf("@nestjs/common")>-1)return"nest";if(a.indexOf("react-styleguidist")>-1)return"styleguidist";if(a.indexOf("react-scripts")>-1)return"create-react-app";if(a.indexOf("react-scripts-ts")>-1)return"create-react-app-typescript";if(a.indexOf("@angular/core")>-1)return"angular-cli";if(a.indexOf("preact-cli")>-1)return"preact-cli";if(a.indexOf("@sveltech/routify")>-1||a.indexOf("@roxi/routify")>-1||a.indexOf("vite")>-1||a.indexOf("@frontity/core")>-1)return"node";if(a.indexOf("svelte")>-1)return"svelte";if(a.indexOf("vue")>-1)return"vue-cli";if(a.indexOf("cx")>-1)return"cxjs";var m=["express","koa","nodemon","ts-node","@tensorflow/tfjs-node","webpack-dev-server","snowpack"];if(a.some(function(g){return m.indexOf(g)>-1})||Object.keys(o).length>=Xl)return"node"}function eu(e){var t=e.split(".");if(t.length<=1)return"";var n=t[t.length-1];return n}var en,yn="-{{suffix}}",tu="https://".concat((en="2.19.8")===null||en===void 0?void 0:en.replace(/\./g,"-")).concat(yn,"-sandpack.codesandbox.io/"),nu=function(e){xn(t,e);function t(n,o,i){i===void 0&&(i={});var r=e.call(this,n,o,i)||this;if(r.getTranspilerContext=function(){return new Promise(function(u){var l=r.listen(function(s){s.type==="transpiler-context"&&(u(s.data),l())});r.dispatch({type:"get-transpiler-context"})})},r.getTranspiledFiles=function(){return new Promise(function(u){var l=r.listen(function(s){s.type==="all-modules"&&(u(s.data),l())});r.dispatch({type:"get-modules"})})},r.bundlerURL=r.createBundlerURL(),r.bundlerState=void 0,r.errors=[],r.status="initializing",typeof n=="string"){r.selector=n;var a=document.querySelector(n);We(a,"The element '".concat(n,"' was not found")),r.element=a,r.iframe=document.createElement("iframe"),r.initializeElement()}else r.element=n,r.iframe=n;return r.iframe.getAttribute("sandbox")||(r.iframe.setAttribute("sandbox","allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts allow-downloads allow-pointer-lock"),r.iframe.setAttribute("allow","accelerometer; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; clipboard-read; clipboard-write; xr-spatial-tracking;")),r.setLocationURLIntoIFrame(),r.iframeProtocol=new Yl(r.iframe,r.bundlerURL),r.unsubscribeGlobalListener=r.iframeProtocol.globalListen(function(u){u.type!=="initialized"||!r.iframe.contentWindow||(r.iframeProtocol.register(),r.options.fileResolver&&(r.fileResolverProtocol=new Wl("fs",function(l){return Ee(r,void 0,void 0,function(){return ke(this,function(s){if(l.method==="isFile")return[2,this.options.fileResolver.isFile(l.params[0])];if(l.method==="readFile")return[2,this.options.fileResolver.readFile(l.params[0])];throw new Error("Method not supported")})})},r.iframeProtocol)),r.updateSandbox(r.sandboxSetup,!0))}),r.unsubscribeChannelListener=r.iframeProtocol.channelListen(function(u){switch(u.type){case"start":{r.errors=[];break}case"status":{r.status=u.status;break}case"action":{u.action==="show-error"&&(r.errors=Tt(Tt([],r.errors,!0),[Sn(u)],!1));break}case"done":{r.status="done";break}case"state":{r.bundlerState=u.state;break}}}),i.experimental_enableServiceWorker&&r.serviceWorkerHandshake(),r}return t.prototype.createBundlerURL=function(){var n,o=this.options.bundlerURL||tu;if(this.options.bundlerURL)return o;if(this.options.teamId&&(o=o.replace("https://","https://"+this.options.teamId+"-")+"?cache=".concat(Date.now())),this.options.experimental_enableServiceWorker){var i=[];i.push(Math.random().toString(36).slice(4)),o=o.replace(yn,"-".concat((n=this.options.experimental_stableServiceWorkerId)!==null&&n!==void 0?n:i.join("-")))}else o=o.replace(yn,"");return o},t.prototype.serviceWorkerHandshake=function(){var n=this,o=new MessageChannel,i=this.iframe.contentWindow;if(!i)throw new Error("Could not get iframe contentWindow");var r=o.port1;r.onmessage=function(u){if(typeof u.data=="object"&&u.data.$channel===wt)switch(u.data.$type){case"preview/ready":break;case"preview/request":n.handleWorkerRequest(u.data,r);break}};var a=function(){var u={$channel:wt,$type:"preview/init"};i.postMessage(u,"*",[o.port2]),n.iframe.removeEventListener("load",a)};this.iframe.addEventListener("load",a)},t.prototype.handleWorkerRequest=function(n,o){return Ee(this,void 0,void 0,function(){var i,r,a,u,l,s,d,f,v,m,g;return ke(this,function(h){switch(h.label){case 0:i=function(){var S={$channel:wt,$type:"preview/response",id:n.id,headers:{"Content-Type":"text/html; charset=utf-8"},status:404,body:"File not found"};o.postMessage(S)},h.label=1;case 1:return h.trys.push([1,4,,5]),r=new URL(n.url,this.bundlerURL).pathname,a={},u=this.getFiles(),l=u[r],l?[3,3]:[4,this.getTranspiledFiles()];case 2:if(s=h.sent(),l=s.find(function(S){return S.path.endsWith(r)}),!l)return i(),[2];h.label=3;case 3:return d=l.code,a["Content-Type"]||(f=eu(r),v=Kl.get(f),v&&(a["Content-Type"]=v)),m={$channel:wt,$type:"preview/response",id:n.id,headers:a,status:200,body:d},o.postMessage(m),[3,5];case 4:return g=h.sent(),console.error(g),i(),[3,5];case 5:return[2]}})})},t.prototype.setLocationURLIntoIFrame=function(){var n,o=this.options.startRoute?new URL(this.options.startRoute,this.bundlerURL).toString():this.bundlerURL;(n=this.iframe.contentWindow)===null||n===void 0||n.location.replace(o),this.iframe.src=o},t.prototype.destroy=function(){this.unsubscribeChannelListener(),this.unsubscribeGlobalListener(),this.iframeProtocol.cleanup()},t.prototype.updateOptions=function(n){Lt(this.options,n)||(this.options=n,this.updateSandbox())},t.prototype.updateSandbox=function(n,o){var i,r,a,u;n===void 0&&(n=this.sandboxSetup),this.sandboxSetup=se(se({},this.sandboxSetup),n);var l=this.getFiles(),s=Object.keys(l).reduce(function(v,m){var g;return se(se({},v),(g={},g[m]={code:l[m].code,path:m},g))},{}),d=JSON.parse(Zr(this.sandboxSetup.dependencies,this.sandboxSetup.devDependencies,this.sandboxSetup.entry));try{d=JSON.parse(l["/package.json"].code)}catch(v){console.error(Ge("could not parse package.json file: "+v.message))}var f=Object.keys(l).reduce(function(v,m){var g;return se(se({},v),(g={},g[m]={content:l[m].code,path:m},g))},{});this.dispatch(se(se({},this.options),{type:"compile",codesandbox:!0,version:3,isInitializationCompile:o,modules:s,reactDevTools:this.options.reactDevTools,externalResources:this.options.externalResources||[],hasFileResolver:!!this.options.fileResolver,disableDependencyPreprocessing:this.sandboxSetup.disableDependencyPreprocessing,experimental_enableServiceWorker:this.options.experimental_enableServiceWorker,template:this.sandboxSetup.template||Ql(d,f),showOpenInCodeSandbox:(i=this.options.showOpenInCodeSandbox)!==null&&i!==void 0?i:!0,showErrorScreen:(r=this.options.showErrorScreen)!==null&&r!==void 0?r:!0,showLoadingScreen:(a=this.options.showLoadingScreen)!==null&&a!==void 0?a:!1,skipEval:this.options.skipEval||!1,clearConsoleDisabled:!this.options.clearConsoleOnFirstCompile,logLevel:(u=this.options.logLevel)!==null&&u!==void 0?u:nn.Info,customNpmRegistries:this.options.customNpmRegistries,teamId:this.options.teamId,sandboxId:this.options.sandboxId}))},t.prototype.dispatch=function(n){n.type==="refresh"&&(this.setLocationURLIntoIFrame(),this.options.experimental_enableServiceWorker&&this.serviceWorkerHandshake()),this.iframeProtocol.dispatch(n)},t.prototype.listen=function(n){return this.iframeProtocol.channelListen(n)},t.prototype.getCodeSandboxURL=function(){var n=this.getFiles(),o=Object.keys(n).reduce(function(i,r){var a;return se(se({},i),(a={},a[r.replace("/","")]={content:n[r].code,isBinary:!1},a))},{});return fetch("https://codesandbox.io/api/v1/sandboxes/define?json=1",{method:"POST",body:JSON.stringify({files:o}),headers:{Accept:"application/json","Content-Type":"application/json"}}).then(function(i){return i.json()}).then(function(i){return{sandboxId:i.sandbox_id,editorUrl:"https://codesandbox.io/s/".concat(i.sandbox_id),embedUrl:"https://codesandbox.io/embed/".concat(i.sandbox_id)}})},t.prototype.getFiles=function(){var n=this.sandboxSetup;return n.files["/package.json"]===void 0?wn(n.files,n.dependencies,n.devDependencies,n.entry):this.sandboxSetup.files},t.prototype.initializeElement=function(){this.iframe.style.border="0",this.iframe.style.width=this.options.width||"100%",this.iframe.style.height=this.options.height||"100%",this.iframe.style.overflow="hidden",We(this.element.parentNode,"The given iframe does not have a parent."),this.element.parentNode.replaceChild(this.iframe,this.element)},t}(Ln);const ru=Object.freeze(Object.defineProperty({__proto__:null,SandpackRuntime:nu},Symbol.toStringTag,{value:"Module"}));export{au as S,Bt as _,su as a,cu as b,lu as c,ce as u};
