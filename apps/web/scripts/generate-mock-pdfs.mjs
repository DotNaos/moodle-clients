import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const outputDir = join(process.cwd(), "public", "mock-pdfs");

const documents = [
  {
    filename: "portrait-text.pdf",
    title: "Portrait Text Fixture",
    size: [595, 842],
    pages: [
      [
        ["Mock PDF Fixture", 28],
        ["Portrait page, fit-to-width baseline.", 16],
        ["This page checks that zoom preserves the document aspect ratio.", 13],
        ["Pinch or Ctrl-wheel over the viewer should zoom the PDF, not the whole website.", 13],
      ],
      [
        ["Dense Text Page", 24],
        ["A longer page makes scroll and current-page detection easier to test.", 13],
        ["Line 1: Moodle preview should stay crisp.", 12],
        ["Line 2: The canvas should never be squeezed horizontally.", 12],
        ["Line 3: The height and width must scale together.", 12],
        ["Line 4: Trackpad pan should still scroll normally.", 12],
        ["Line 5: Drag-to-pan is enabled when zoomed in.", 12],
      ],
      [
        ["Formula-Like Layout", 24],
        ["f(x) = sin(x) + cos(2x)", 18],
        ["Integral from 0 to pi of f(x) dx", 14],
        ["This page is intentionally simple and selectable by page number.", 13],
      ],
      [
        ["Final Page", 24],
        ["If this page looks stretched, the CSS sizing is wrong.", 14],
        ["If browser zoom changes, the wheel or gesture handler is not preventing default.", 14],
      ],
    ],
  },
  {
    filename: "wide-slide.pdf",
    title: "Wide Slide Fixture",
    size: [960, 540],
    pages: [
      [
        ["Wide Slide Fixture", 34],
        ["Landscape pages should fit without being cropped.", 17],
        ["Zooming should reveal horizontal scrolling instead of squashing the slide.", 15],
      ],
      [
        ["Two Column Slide", 28],
        ["Left column: course material", 16],
        ["Right column: PDF preview", 16],
        ["This tests large width at high zoom levels.", 14],
      ],
      [
        ["Chart Placeholder", 28],
        ["[ axis ]  [ bars ]  [ legend ]", 20],
        ["The text should stay proportionally scaled.", 14],
      ],
    ],
  },
];

await mkdir(outputDir, { recursive: true });

for (const document of documents) {
  const data = createPDF(document);
  await writeFile(join(outputDir, document.filename), data);
  console.log(`wrote public/mock-pdfs/${document.filename}`);
}

function createPDF(document) {
  const objects = [];
  const catalogId = 1;
  const pagesId = 2;
  const fontId = 3;
  const pageIds = [];

  for (let index = 0; index < document.pages.length; index += 1) {
    const pageId = 4 + index * 2;
    const contentId = pageId + 1;
    pageIds.push(pageId);

    const [width, height] = document.size;
    const stream = buildPageStream(document.pages[index], width, height, index + 1, document.pages.length);
    objects[pageId] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${byteLength(stream)} >>\nstream\n${stream}\nendstream`;
  }

  objects[catalogId] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  objects[fontId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  const chunks = ["%PDF-1.4\n"];
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = byteLength(chunks.join(""));
    chunks.push(`${id} 0 obj\n${objects[id]}\nendobj\n`);
  }

  const xrefOffset = byteLength(chunks.join(""));
  chunks.push(`xref\n0 ${objects.length}\n`);
  chunks.push("0000000000 65535 f \n");
  for (let id = 1; id < objects.length; id += 1) {
    chunks.push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  chunks.push(`trailer\n<< /Size ${objects.length} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return Buffer.from(chunks.join(""), "utf8");
}

function buildPageStream(lines, width, height, pageNumber, pageCount) {
  const commands = [
    "q",
    "1 1 1 rg",
    `0 0 ${width} ${height} re f`,
    "0 0 0 rg",
    "BT",
  ];
  let y = height - 86;
  for (const [text, size] of lines) {
    commands.push(`/F1 ${size} Tf`);
    commands.push(`72 ${y} Td (${escapePDFText(text)}) Tj`);
    y -= size + 18;
  }
  commands.push("/F1 11 Tf");
  commands.push(`72 42 Td (Page ${pageNumber} of ${pageCount}) Tj`);
  commands.push("ET");
  commands.push("Q");
  return commands.join("\n");
}

function escapePDFText(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function byteLength(value) {
  return Buffer.byteLength(value, "utf8");
}
