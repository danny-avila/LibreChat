import dedent from 'dedent';

const layoutAndSpacing = {
  title: 'Layout & Spacing',
  content: dedent`
    The slide is 13.333 x 7.5 inches. EVERY content element must stay within the canvas: x + w ≤ 13.333 AND y + h ≤ 7.5. Before adding any element, verify both constraints — elements that extend past the right or bottom edge get clipped and hidden in PowerPoint. Size w and h to fit actual content, not fixed large values. Use 0.5" minimum margins from all slide edges (content area is roughly x: 0.5 to 12.8, y: 0.5 to 7.0). Leave 0.3–0.5" gaps between content blocks — pick one gap size and use it consistently throughout. When using footers (y ≈ 7.1), ensure all content above ends before that y. Elements overlap visibly in PowerPoint — never stack text boxes on each other. Leave breathing room — don't fill every inch of every slide. Decorative background shapes (large ovals, gradient rectangles) may extend past edges intentionally, but all text, charts, and interactive content must be fully within bounds.
  `,
};

const typography = {
  title: 'Typography',
  content: dedent`
    Choose an interesting font pairing — don't default to Arial. Pick a header font with personality and pair it with a clean body font:
    Georgia + Calibri, Arial Black + Arial, Calibri + Calibri Light, Cambria + Calibri, Trebuchet MS + Calibri, Impact + Arial, Palatino + Garamond, Consolas + Calibri.
    Size hierarchy: slide titles 36–44pt bold, section headers 20–24pt bold, body text 14–16pt, captions/footers 10–12pt muted. Don't skimp on size contrast — titles need 36pt+ to stand out from 14–16pt body. Left-align body text and lists; center only titles.
  `,
};

const design = {
  title: 'Design',
  content: dedent`
    Don't create boring slides. Plain bullets on a white background won't impress anyone.
    Before starting: pick a bold, content-informed color palette — the palette should feel designed for THIS topic. If swapping your colors into a completely different presentation would still "work," you haven't made specific enough choices. Use one dominant color (60–70% visual weight), 1–2 supporting tones, and one sharp accent. Never give all colors equal weight. Consider dark backgrounds for title + conclusion slides and light for content ("sandwich" structure), or commit to dark throughout for a premium feel.
    Commit to a visual motif: pick ONE distinctive element and repeat it across every slide — rounded cards, icons in colored circles, thick single-side borders, colored header bars, etc.
    Every slide needs a visual element — shape, chart, icon, or colored card. Text-only slides are forgettable.
    Layout options: two-column (text left, visual right), icon + text rows (icon in colored circle, bold header, description below), 2x2 or 2x3 grid of content blocks, half-bleed colored area with content overlay.
    Data display: large stat callouts (60–72pt numbers with small 12pt labels below), comparison columns (before/after, pros/cons, side-by-side), timeline or process flow (numbered steps with arrows or dots).
    Visual polish: icons in small colored circles next to section headers, italic accent text for key stats or taglines.
  `,
};

const charts = {
  title: 'Charts',
  content: dedent`
    Keep chart height ≤ 4.5 inches to leave room for axis labels and padding. Leave at least 0.3" between chart edge and slide edge for label overflow. Use barDir: "bar" for horizontal bars, barDir: "col" for vertical columns. Limit to 5–6 data points per chart for readability. Set catAxisLabelFontSize: 11 or higher so category labels are legible. Use a dataLabelColor that contrasts with bar colors (dark labels on light bars, light on dark). Don't set valAxisHidden: true unless you also show data labels — the viewer needs at least one reference scale. For single-series charts, use one chartColors value, not one per data point.
  `,
};

const avoid = {
  title: 'Avoid',
  content: dedent`
    Don't repeat the same layout on every slide — vary columns, cards, and callouts across slides. Don't use accent/decorative lines under titles — these are a hallmark of AI-generated slides; use whitespace or background color instead. Don't use low-contrast elements — both icons AND text need strong contrast against the background. Don't center body text — left-align paragraphs and lists; center only titles. Don't fill every inch — leave breathing room. Don't mix spacing randomly — choose 0.3" or 0.5" gaps and use consistently. Don't style one slide and leave the rest plain — commit fully or keep it simple throughout. When placing shapes behind text, account for text box padding by setting margin: 0 or offsetting the shape. Don't create text-only slides with plain title + bullets.
  `,
};

const commonMistakes = {
  title: 'Common API Mistakes',
  content: dedent`
    line: { type: "none" } is NOT valid PptxGenJS — to hide borders, omit the line property entirely or use line: { width: 0 }. Line width is set with width, not pt (e.g., line: { color: "4F46E5", width: 2 } not line: { color: "4F46E5", pt: 2 }). rectRadius is the correct property for ROUNDED_RECTANGLE corner radius. Do not use shadow: { type: "none" } — omit shadow entirely if not wanted.
  `,
};

const colorPalettes = {
  title: 'Example Color Palettes',
  content: dedent`
    Choose colors that match your topic — don't default to generic blue:
    Midnight Executive (1E2761 navy / CADCFC ice / FFFFFF white), Forest & Moss (2C5F2D / 97BC62 / F5F5F5), Coral Energy (F96167 / F9E795 / 2F3C7E), Warm Terracotta (B85042 / E7E8D1 / A7BEAE), Ocean Gradient (065A82 / 1C7293 / 21295C), Charcoal Minimal (36454F / F2F2F2 / 212121), Teal Trust (028090 / 00A896 / 02C39A), Berry & Cream (6D2E46 / A26769 / ECE2D0), Sage Calm (84B59F / 69A297 / 50808E), Cherry Bold (990011 / FCF6F5 / 2F3C7E).
  `,
};

const sections = [layoutAndSpacing, typography, design, charts, avoid, commonMistakes, colorPalettes];

/**
 * Generate design guidance prompt for PPTX artifact generation.
 * Appended to the base artifacts prompt to improve slide layout quality.
 * @param options.useXML - Use XML formatting for Anthropic, markdown for others
 */
export function generatePptxDesignPrompt(options: { useXML?: boolean }): string {
  const { useXML = false } = options;

  const formattedSections = sections
    .map((section) => {
      if (useXML) {
        return dedent`
          <section>
            <name>${section.title}</name>
            <guidance>${section.content.trim()}</guidance>
          </section>
        `;
      }
      return dedent`
        ### ${section.title}
        ${section.content.trim()}
      `;
    })
    .join('\n\n');

  if (useXML) {
    return dedent`

      <pptx-design-guidance>
        ${formattedSections}
      </pptx-design-guidance>
    `;
  }

  return dedent`

    ## PPTX Design Guidance for "application/vnd.pptx"

    ${formattedSections}
  `;
}

/**
 * PPTX type definition to inject into the base artifacts prompt.
 * Inserted after the Mermaid type definition in the artifact type list.
 */
export const pptxTypeDefinition = `
    - PowerPoint Presentations: "application/vnd.pptx"
      - The user interface will render a slide preview and allow downloading the generated .pptx file.
      - The artifact content must be PptxGenJS JavaScript code that builds a presentation.
      - The code receives two pre-initialized variables: \\\`pptxgen\\\` (the PptxGenJS class) and \\\`pres\\\` (a new presentation instance). Do NOT import or require pptxgenjs — use the provided variables.
      - Always set \\\`pres.layout = "LAYOUT_WIDE";\\\` at the start of your code.
      - Always end the code with \\\`await pres.writeFile({ fileName: "presentation.pptx" });\\\` to trigger the download.
      - Use hex colors WITHOUT the \\\`#\\\` prefix (e.g., \\\`"363636"\\\` not \\\`"#363636"\\\`).
      - NEVER use template literals (backticks) for strings — backticks are stripped during artifact parsing and will cause syntax errors. Use string concatenation instead: \\\`"Report ID: " + reportId\\\` not \\\`\\\\\\\`Report ID: \\\${reportId}\\\\\\\`\\\`.
      - Use \\\`breakLine: true\\\` in text arrays for multi-line text.
      - Use \\\`bullet: true\\\` for bullet points — never use unicode bullet characters.
      - Available methods: \\\`pres.addSlide()\\\`, \\\`slide.addText()\\\`, \\\`slide.addShape()\\\`, \\\`slide.addImage()\\\`, \\\`slide.addChart()\\\`, \\\`slide.addTable()\\\`.
      - Valid shape names: \\\`RECTANGLE\\\`, \\\`ROUNDED_RECTANGLE\\\`, \\\`OVAL\\\`, \\\`LINE\\\`, \\\`ISOSCELES_TRIANGLE\\\`, \\\`RIGHT_TRIANGLE\\\`, \\\`DIAMOND\\\`, \\\`HEXAGON\\\`, \\\`PENTAGON\\\`, \\\`ARC\\\`, \\\`STAR_5_POINT\\\`, \\\`RIGHT_ARROW\\\`, \\\`CHEVRON\\\`, \\\`CLOUD\\\`, \\\`HEART\\\`, \\\`LIGHTNING_BOLT\\\` (access via \\\`pres.shapes.RECTANGLE\\\` etc.). Do NOT use ROUND_RECT, FREEFORM, STAR5, or TRIANGLE — these are invalid and will throw errors.
      - Chart types: \\\`pres.charts.BAR\\\`, \\\`pres.charts.BAR3D\\\`, \\\`pres.charts.LINE\\\`, \\\`pres.charts.PIE\\\`, \\\`pres.charts.DOUGHNUT\\\`, \\\`pres.charts.AREA\\\`, \\\`pres.charts.SCATTER\\\`, \\\`pres.charts.RADAR\\\`, \\\`pres.charts.BUBBLE\\\`.`;

const pptxExampleCode = `pres.layout = "LAYOUT_WIDE";

      let slide1 = pres.addSlide();
      slide1.background = { color: "1E2761" };
      slide1.addText("Our Team", {
        x: 0.5, y: 1.5, w: 9, h: 2,
        fontSize: 44, fontFace: "Arial",
        color: "FFFFFF", bold: true, align: "center"
      });

      let slide2 = pres.addSlide();
      slide2.addText("Team Members", {
        x: 0.5, y: 0.3, w: 9, h: 0.8,
        fontSize: 32, fontFace: "Arial",
        color: "1E2761", bold: true
      });
      slide2.addText([
        { text: "Alice - Engineering Lead", options: { bullet: true, breakLine: true } },
        { text: "Bob - Product Manager", options: { bullet: true, breakLine: true } },
        { text: "Carol - Designer", options: { bullet: true } }
      ], { x: 0.5, y: 1.5, w: 9, h: 3, fontSize: 18, color: "363636" });

      await pres.writeFile({ fileName: "team-presentation.pptx" });`;

/**
 * PPTX example for Anthropic prompt (XML format).
 */
export const pptxExampleAnthropic = `

  <example>
    <user_query>Create a simple presentation about our team</user_query>

    <assistant_response>
      Here's a simple presentation about your team:

      :::artifact{identifier="team-deck" type="application/vnd.pptx" title="Team Presentation"}
      \\\`\\\`\\\`
${pptxExampleCode}
      \\\`\\\`\\\`
      :::

      This creates a 2-slide presentation with a title slide and a team members slide. You can click the download button to get the .pptx file.
    </assistant_response>
  </example>`;

/**
 * PPTX example for OpenAI prompt (Markdown format).
 */
export const pptxExampleOpenAI = `

---

### Example 4
    User: Create a simple presentation about our team
    Assistant: Here's a simple presentation about your team:

      :::artifact{identifier="team-deck" type="application/vnd.pptx" title="Team Presentation"}
      \\\`\\\`\\\`
${pptxExampleCode}
      \\\`\\\`\\\`
      :::

      This creates a 2-slide presentation with a title slide and a team members slide. You can click the download button to get the .pptx file.`;
