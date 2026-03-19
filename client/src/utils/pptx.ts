import dedent from 'dedent';

const pptxPreviewComponent = dedent(`import React, { useEffect, useState, useRef } from "react";

// Default slide dimensions in inches for LAYOUT_16x9
const DEFAULT_SLIDE_W = 13.333;
const DEFAULT_SLIDE_H = 7.5;
const EMU_PER_INCH = 914400;

// ---------- Code cleaning ----------
function cleanPptxCode(code: string): string {
  return code
    .replace(/^\\s*(const|let|var)\\s+\\w+\\s*=\\s*require\\(\\s*["']pptxgenjs["']\\s*\\)\\s*;?/gm, "")
    .replace(/^\\s*import\\s+.*\\s+from\\s+["']pptxgenjs["']\\s*;?/gm, "")
    .replace(/^\\s*(const|let|var)\\s+pres\\s*=\\s*new\\s+\\w+\\(\\s*\\)\\s*;?/gm, "");
}

// ---------- Color helpers ----------
function hexToCSS(hex?: string, transparency?: number): string | undefined {
  if (!hex) return undefined;
  const h = hex.replace(/^#/, "");
  if (h.length < 6) return "#" + h;
  const t = typeof transparency === "number" ? transparency : 0;
  if (t >= 100) return "transparent";
  if (t <= 0) return "#" + h;
  const alpha = Math.round((1 - t / 100) * 255).toString(16).padStart(2, "0");
  return "#" + h + alpha;
}

// ---------- Font helpers ----------
// Office fonts that aren't on Google Fonts → closest Google Fonts alternative
const FONT_FALLBACK: Record<string, { google: string; css: string }> = {
  "Calibri": { google: "Carlito", css: "Carlito, sans-serif" },
  "Cambria": { google: "Caladea", css: "Caladea, serif" },
  "Segoe UI": { google: "Noto Sans", css: "'Noto Sans', sans-serif" },
  "Consolas": { google: "Source Code Pro", css: "'Source Code Pro', monospace" },
  "Palatino Linotype": { google: "EB Garamond", css: "'EB Garamond', serif" },
  "Book Antiqua": { google: "EB Garamond", css: "'EB Garamond', serif" },
  "Franklin Gothic Medium": { google: "Libre Franklin", css: "'Libre Franklin', sans-serif" },
  "Gill Sans MT": { google: "Lato", css: "Lato, sans-serif" },
  "Century Gothic": { google: "Questrial", css: "Questrial, sans-serif" },
  "Tw Cen MT": { google: "Questrial", css: "Questrial, sans-serif" },
};

// Fonts we know are NOT on Google Fonts (skip loading attempts)
const SKIP_GOOGLE_FONTS = new Set([
  ...Object.keys(FONT_FALLBACK),
  "Arial", "Helvetica", "Times New Roman", "Courier New", "Verdana",
  "Georgia", "Trebuchet MS", "Impact", "Comic Sans MS", "Tahoma",
  "system-ui", "sans-serif", "serif", "monospace",
]);

function resolveFontFamily(fontFace?: string): string {
  if (!fontFace) return "system-ui, sans-serif";
  const fb = FONT_FALLBACK[fontFace];
  if (fb) return fb.css;
  return "'" + fontFace + "', system-ui, sans-serif";
}

let loadedGoogleFonts = new Set<string>();

function loadGoogleFonts(fontNames: Set<string>) {
  const resolved = new Set<string>();
  for (const f of fontNames) {
    const fb = FONT_FALLBACK[f];
    if (fb) { resolved.add(fb.google); }
    else if (!SKIP_GOOGLE_FONTS.has(f)) { resolved.add(f); }
  }
  const toLoad = [...resolved].filter(f => !loadedGoogleFonts.has(f));
  if (toLoad.length === 0) return;
  toLoad.forEach(f => loadedGoogleFonts.add(f));
  const families = toLoad.map(f => "family=" + encodeURIComponent(f).replace(/%20/g, "+")).join("&");
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?" + families + "&display=swap";
  document.head.appendChild(link);
}

// ---------- Read slide data from pres internal state ----------
interface ParsedSlide {
  background?: string;
  elements: ParsedElement[];
}

interface ParsedElement {
  type: string;       // "text" | "image" | "chart" | "table"
  shape?: string;     // "rect" | "roundRect" | "oval" | "line" | "arc" | etc.
  x: number; y: number; w: number; h: number;
  // Text fields
  textContent?: string;
  fontSize?: number;
  fontFace?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  align?: string;
  valign?: string;
  // Shape/common fields
  fillColor?: string;
  fillTransparency?: number;
  lineColor?: string;
  lineWidth?: number;
  lineTransparency?: number;
  // Image
  imageSrc?: string;
  // Chart
  chartType?: string;
}

interface ParsedPresentation {
  slides: ParsedSlide[];
  slideW: number;
  slideH: number;
}

function parseSlides(pres: any): ParsedPresentation {
  let slideW = DEFAULT_SLIDE_W;
  let slideH = DEFAULT_SLIDE_H;
  try {
    const layout = pres.presLayout;
    if (layout?.width && layout?.height) {
      slideW = layout.width / EMU_PER_INCH;
      slideH = layout.height / EMU_PER_INCH;
    }
  } catch (_) {}

  const slides: ParsedSlide[] = [];

  for (const slide of (pres.slides || [])) {
    const parsed: ParsedSlide = { elements: [] };

    // Background
    const bg = slide._background;
    if (bg?.color) parsed.background = bg.color;
    else if (bg?.fill?.color) parsed.background = bg.fill.color;

    // Elements
    for (const obj of (slide._slideObjects || [])) {
      const opts = obj.options || {};
      const el: ParsedElement = {
        type: obj._type || "text",
        shape: obj.shape,
        x: opts.x ?? 0,
        y: opts.y ?? 0,
        w: opts.w ?? 1,
        h: opts.h ?? 1,
        fillColor: opts.fill?.color,
        fillTransparency: opts.fill?.transparency,
        lineColor: opts.line?.color,
        lineWidth: opts.line?.width,
        lineTransparency: opts.line?.transparency,
      };

      // Extract text content
      if (obj.text && Array.isArray(obj.text)) {
        el.textContent = obj.text
          .map((t: any) => {
            const text = typeof t === "string" ? t : t?.text || "";
            const br = (typeof t !== "string" && t?.options?.breakLine) ? "\\n" : "";
            return text + br;
          })
          .join("");
        // Use styling from first text run or from options
        const firstRun = obj.text[0]?.options || opts;
        el.fontSize = firstRun.fontSize ?? opts.fontSize;
        el.fontFace = firstRun.fontFace ?? opts.fontFace;
        el.color = firstRun.color ?? opts.color;
        el.bold = firstRun.bold ?? opts.bold;
        el.italic = firstRun.italic ?? opts.italic;
        el.align = firstRun.align ?? opts.align;
        el.valign = opts._bodyProp?.anchor === "t" ? "top"
                   : opts._bodyProp?.anchor === "b" ? "bottom"
                   : opts._bodyProp?.anchor === "ctr" ? "middle"
                   : (opts.valign || undefined);
      } else if (typeof obj.text === "string") {
        el.textContent = obj.text;
        el.fontSize = opts.fontSize;
        el.fontFace = opts.fontFace;
        el.color = opts.color;
        el.bold = opts.bold;
        el.italic = opts.italic;
        el.align = opts.align;
      }

      // Image
      if (obj._type === "image") {
        el.imageSrc = obj.image || undefined;
      }

      // Chart
      if (obj._type === "chart") {
        el.chartType = opts._type || "chart";
      }

      parsed.elements.push(el);
    }

    slides.push(parsed);
  }

  return { slides, slideW, slideH };
}

// ---------- Render a single element ----------
function renderElement(el: ParsedElement, idx: number, scale: number) {
  const px = (v: number) => v * scale;
  const base: React.CSSProperties = {
    position: "absolute",
    left: px(el.x),
    top: px(el.y),
    width: px(el.w),
    height: px(el.h),
    boxSizing: "border-box",
    overflow: "hidden",
    pointerEvents: "none",
  };

  const shapeName = (el.shape || "").toLowerCase();

  // --- LINE ---
  if (shapeName === "line") {
    const color = hexToCSS(el.lineColor || el.fillColor || "888888", el.lineTransparency) || "#888";
    const w = el.lineWidth || 2;
    return <div key={idx} style={{
      ...base,
      height: Math.max(px(el.h), w),
      background: "transparent",
      borderTop: w + "px solid " + color,
    }} />;
  }

  // --- SHAPE (no text) ---
  if (el.type === "text" && !el.textContent && el.shape && el.shape !== "rect") {
    const fill = hexToCSS(el.fillColor, el.fillTransparency) || "transparent";
    const hasBorder = el.lineColor && (el.lineTransparency ?? 0) < 100;
    const border = hasBorder
      ? (el.lineWidth || 1) + "px solid " + hexToCSS(el.lineColor, el.lineTransparency)
      : "none";

    let borderRadius = "0";
    if (shapeName === "oval" || shapeName === "ellipse" || shapeName === "arc") borderRadius = "50%";
    else if (shapeName.includes("round")) borderRadius = "8px";

    return <div key={idx} style={{ ...base, background: fill, border, borderRadius }} />;
  }

  // --- SHAPE WITH TEXT or plain TEXT ---
  if (el.type === "text") {
    // If it has a fill or shape, render the background
    const hasFill = el.fillColor && (el.fillTransparency ?? 0) < 100;
    const hasBorder = el.lineColor && (el.lineTransparency ?? 0) < 100;
    const fill = hasFill ? hexToCSS(el.fillColor, el.fillTransparency) : "transparent";
    const border = hasBorder
      ? (el.lineWidth || 1) + "px solid " + hexToCSS(el.lineColor, el.lineTransparency)
      : "none";

    let borderRadius = "0";
    if (shapeName === "oval" || shapeName === "ellipse") borderRadius = "50%";
    else if (shapeName.includes("round")) borderRadius = "8px";

    // Font size: PptxGenJS fontSize is in points (1pt = 1/72 inch).
    // scale is px-per-inch for the preview, so: pts * (scale / 72) = CSS px.
    const rawFontSize = el.fontSize || 14;
    const scaledFontSize = rawFontSize * (scale / 72);

    const color = hexToCSS(el.color) || "#000000";
    const textAlign = el.align === "center" ? "center"
                    : el.align === "right" ? "right"
                    : "left";
    const alignItems = el.valign === "middle" ? "center"
                     : el.valign === "bottom" ? "flex-end"
                     : "flex-start";

    return (
      <div key={idx} style={{
        ...base,
        background: fill || "transparent",
        border,
        borderRadius,
        display: "flex",
        alignItems,
        padding: "2px 4px",
      }}>
        <div style={{
          width: "100%",
          color,
          fontSize: scaledFontSize,
          fontFamily: resolveFontFamily(el.fontFace),
          fontWeight: el.bold ? 700 : 400,
          fontStyle: el.italic ? "italic" : "normal",
          textAlign: textAlign as any,
          lineHeight: 1.25,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          overflow: "hidden",
        }}>
          {el.textContent || ""}
        </div>
      </div>
    );
  }

  // --- IMAGE ---
  if (el.type === "image") {
    if (el.imageSrc && (el.imageSrc.startsWith("data:") || el.imageSrc.startsWith("http"))) {
      return <img key={idx} src={el.imageSrc} alt="" style={{ ...base, objectFit: "cover" }} />;
    }
    return (
      <div key={idx} style={{
        ...base, background: "rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#666", fontSize: 11, border: "1px dashed rgba(255,255,255,0.15)",
      }}>
        Image
      </div>
    );
  }

  // --- CHART ---
  if (el.type === "chart") {
    return (
      <div key={idx} style={{
        ...base, background: "rgba(255,255,255,0.04)",
        border: "1px dashed rgba(255,255,255,0.12)", borderRadius: 4,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#777", fontSize: 11,
      }}>
        {(el.chartType || "chart").toUpperCase()} chart
      </div>
    );
  }

  return null;
}

// ---------- Main component ----------
const PptxPreview: React.FC<{ code: string }> = ({ code }) => {
  const [slides, setSlides] = useState<ParsedSlide[]>([]);
  const [slideW, setSlideW] = useState(DEFAULT_SLIDE_W);
  const [slideH, setSlideH] = useState(DEFAULT_SLIDE_H);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [containerWidth, setContainerWidth] = useState(640);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const measure = () => {
      if (containerRef.current) setContainerWidth(containerRef.current.offsetWidth - 32);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    const run = async () => {
      try {
        const pptxgen = (await import("pptxgenjs")).default;
        const pres = new pptxgen();

        // Neutralize file-writing so code doesn't trigger download
        pres.writeFile = async () => "";
        const origWrite = pres.write.bind(pres);
        pres.write = async (opts: any) => {
          if (opts?.outputType === "blob") return new Blob();
          return "";
        };

        // Execute user code
        const cleanedCode = cleanPptxCode(code);
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        const fn = new AsyncFunction("pptxgen", "pres", "require", cleanedCode);
        await fn(pptxgen, pres, () => pptxgen);

        // Read internal state after execution
        const result = parseSlides(pres);

        // Load any referenced fonts from Google Fonts
        const fonts = new Set<string>();
        result.slides.forEach(s => s.elements.forEach(el => {
          if (el.fontFace) fonts.add(el.fontFace);
        }));
        if (fonts.size > 0) loadGoogleFonts(fonts);

        setSlides(result.slides);
        setSlideW(result.slideW);
        setSlideH(result.slideH);
        if (result.slides.length > 0) setCurrentSlide(0);
        setLoaded(true);
      } catch (err: any) {
        setError(err.message || "Failed to execute presentation code");
        setLoaded(true);
      }
    };
    if (code) {
      run();
    } else {
      setLoaded(true);
    }
  }, [code]);

  if (error) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", background: "#1E1E2E", color: "#F38BA8", padding: 32,
        fontFamily: "monospace", fontSize: 14,
      }}>
        <div>
          <div style={{ fontSize: 18, marginBottom: 12, color: "#CDD6F4" }}>Error</div>
          <pre style={{ whiteSpace: "pre-wrap", maxWidth: 600 }}>{error}</pre>
        </div>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", background: "#1E1E2E", color: "#A6ADC8",
      }}>
        Loading presentation...
      </div>
    );
  }

  if (slides.length === 0) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", background: "#1E1E2E", color: "#A6ADC8",
      }}>
        No slides found. Check the presentation code.
      </div>
    );
  }

  const slide = slides[currentSlide];
  const previewW = Math.min(containerWidth, 900);
  const scale = previewW / slideW;
  const previewH = slideH * scale;

  return (
    <div ref={containerRef} style={{
      height: "100vh", display: "flex", flexDirection: "column",
      background: "#1E1E2E", color: "#CDD6F4", fontFamily: "system-ui, sans-serif",
    }}>
      {/* Slide preview */}
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, overflow: "auto",
      }}>
        <div style={{
          position: "relative",
          width: previewW,
          height: previewH,
          background: hexToCSS(slide.background) || "#FFFFFF",
          boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
          overflow: "hidden",
          flexShrink: 0,
        }}>
          {slide.elements.map((el, idx) => renderElement(el, idx, scale))}
        </div>
      </div>

      {/* Approximate label + controls */}
      <div style={{
        padding: "8px 16px", display: "flex", alignItems: "center",
        justifyContent: "space-between", borderTop: "1px solid #313244",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))}
            disabled={currentSlide === 0}
            style={{
              background: "none", border: "1px solid #45475A", color: "#CDD6F4",
              padding: "5px 10px", borderRadius: 4,
              cursor: currentSlide === 0 ? "default" : "pointer",
              opacity: currentSlide === 0 ? 0.4 : 1,
            }}
          >&#9664;</button>
          <span style={{ fontSize: 13, color: "#A6ADC8" }}>
            {currentSlide + 1} / {slides.length}
          </span>
          <button
            onClick={() => setCurrentSlide(Math.min(slides.length - 1, currentSlide + 1))}
            disabled={currentSlide === slides.length - 1}
            style={{
              background: "none", border: "1px solid #45475A", color: "#CDD6F4",
              padding: "5px 10px", borderRadius: 4,
              cursor: currentSlide === slides.length - 1 ? "default" : "pointer",
              opacity: currentSlide === slides.length - 1 ? 0.4 : 1,
            }}
          >&#9654;</button>
          <span style={{ fontSize: 11, color: "#585B70", marginLeft: 6 }}>
            Approximate preview
          </span>
        </div>
      </div>
    </div>
  );
};

export default PptxPreview;`);

const wrapPptxCode = (code: string) => {
  const escaped = code.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
  return dedent(`import React from 'react';
import PptxPreview from '/components/ui/PptxPreview';

const code = \`${escaped}\`;

export default function App() {
  return <PptxPreview code={code} />;
}
`);
};

const pptxCSS = `
body {
  margin: 0;
  padding: 0;
  background-color: #1E1E2E;
}
`;

export const getPptxFiles = (content: string) => {
  return {
    'presentation.js': content || '// No presentation code provided',
    'App.tsx': wrapPptxCode(content),
    'index.tsx': dedent(`import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./pptx.css";

import App from "./App";

const root = createRoot(document.getElementById("root"));
root.render(<App />);
;`),
    '/components/ui/PptxPreview.tsx': pptxPreviewComponent,
    'pptx.css': pptxCSS,
  };
};
