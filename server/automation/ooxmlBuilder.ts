import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

export interface ZipEntryInput {
  name: string;
  content: string | Buffer;
}

function escapeXml(raw: string): string {
  return String(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function crc32(buf: Buffer): number {
  if (typeof (zlib as unknown as { crc32?: (b: Buffer) => number }).crc32 === 'function') {
    return (zlib as unknown as { crc32: (b: Buffer) => number }).crc32(buf) >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function createZipBuffer(entries: ZipEntryInput[]): Buffer {
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf-8');
    const rawBuf = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content, 'utf-8');
    const compressed = zlib.deflateRawSync(rawBuf);
    const crc = crc32(rawBuf);

    // Local File Header (30 bytes + name)
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4); // version needed
    lfh.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    lfh.writeUInt16LE(8, 8); // deflate compression
    lfh.writeUInt16LE(0, 10); // mod time
    lfh.writeUInt16LE(0x5421, 12); // mod date
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(compressed.length, 18);
    lfh.writeUInt32LE(rawBuf.length, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);

    localChunks.push(lfh, nameBuf, compressed);

    // Central Directory File Header (46 bytes + name)
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0x5421, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(compressed.length, 20);
    cd.writeUInt32LE(rawBuf.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);

    centralChunks.push(cd, nameBuf);
    offset += lfh.length + nameBuf.length + compressed.length;
  }

  const centralDir = Buffer.concat(centralChunks);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, centralDir, eocd]);
}

export function verifyOoxmlZipBuffer(buf: Buffer, requiredEntries: string[]): {
  valid: boolean;
  entries: string[];
  error?: string;
} {
  if (!buf || buf.length < 22 || buf.readUInt32LE(0) !== 0x04034b50) {
    return { valid: false, entries: [], error: 'Missing ZIP PK header' };
  }
  const entries: string[] = [];
  let cursor = 0;
  while (cursor + 30 <= buf.length) {
    const sig = buf.readUInt32LE(cursor);
    if (sig !== 0x04034b50) break;
    const compSize = buf.readUInt32LE(cursor + 18);
    const nameLen = buf.readUInt16LE(cursor + 26);
    const extraLen = buf.readUInt16LE(cursor + 28);
    const nameStart = cursor + 30;
    const name = buf.subarray(nameStart, nameStart + nameLen).toString('utf-8');
    entries.push(name);
    cursor = nameStart + nameLen + extraLen + compSize;
  }
  const missing = requiredEntries.filter((req) => !entries.includes(req));
  if (missing.length > 0) {
    return { valid: false, entries, error: `Missing OOXML entries: ${missing.join(', ')}` };
  }
  return { valid: true, entries };
}

// ---------- Word (.docx) ----------

export interface WordDocumentSpec {
  title: string;
  subtitle?: string;
  sections: Array<{ heading: string; paragraphs: string[] }>;
}

export function buildDocxBuffer(spec: WordDocumentSpec): Buffer {
  const bodyBlocks: string[] = [];

  bodyBlocks.push(`
    <w:p>
      <w:pPr><w:pStyle w:val="Title"/></w:pPr>
      <w:r><w:t xml:space="preserve">${escapeXml(spec.title)}</w:t></w:r>
    </w:p>`);

  if (spec.subtitle) {
    bodyBlocks.push(`
      <w:p>
        <w:r><w:rPr><w:i/><w:color w:val="555577"/></w:rPr><w:t xml:space="preserve">${escapeXml(spec.subtitle)}</w:t></w:r>
      </w:p>`);
  }

  for (const sec of spec.sections) {
    bodyBlocks.push(`
      <w:p>
        <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
        <w:r><w:t xml:space="preserve">${escapeXml(sec.heading)}</w:t></w:r>
      </w:p>`);
    for (const para of sec.paragraphs) {
      bodyBlocks.push(`
        <w:p>
          <w:r><w:t xml:space="preserve">${escapeXml(para)}</w:t></w:r>
        </w:p>`);
    }
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyBlocks.join('\n')}
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>
  </w:body>
</w:document>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr><w:sz w:val="22"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:rPr><w:b/><w:sz w:val="44"/><w:color w:val="4B2E83"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:rPr><w:b/><w:sz w:val="30"/><w:color w:val="2E1065"/></w:rPr>
  </w:style>
</w:styles>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const wordRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  return createZipBuffer([
    { name: '[Content_Types].xml', content: contentTypes },
    { name: '_rels/.rels', content: rootRels },
    { name: 'word/_rels/document.xml.rels', content: wordRels },
    { name: 'word/styles.xml', content: stylesXml },
    { name: 'word/document.xml', content: documentXml },
  ]);
}

// ---------- Excel (.xlsx) ----------

export interface ExcelCellSpec {
  value?: string | number;
  formula?: string;
  styleIndex?: number;
}

export interface ExcelSheetSpec {
  name: string;
  rows: ExcelCellSpec[][];
}

function colIndexToLetters(idx: number): string {
  let n = idx;
  let letters = '';
  while (n >= 0) {
    letters = String.fromCharCode((n % 26) + 65) + letters;
    n = Math.floor(n / 26) - 1;
  }
  return letters;
}

export function buildXlsxBuffer(sheets: ExcelSheetSpec[]): Buffer {
  const safeSheets = sheets.length > 0 ? sheets : [{ name: 'Sheet1', rows: [] }];

  const sheetXmlFiles = safeSheets.map((sheet, idx) => {
    const rowXml = sheet.rows
      .map((row, rIdx) => {
        const rowNum = rIdx + 1;
        const cellsXml = row
          .map((cell, cIdx) => {
            const ref = `${colIndexToLetters(cIdx)}${rowNum}`;
            const styleAttr = cell.styleIndex !== undefined ? ` s="${cell.styleIndex}"` : '';
            if (cell.formula) {
              const cleanFormula = cell.formula.startsWith('=') ? cell.formula.slice(1) : cell.formula;
              const cached = typeof cell.value === 'number' ? `<v>${cell.value}</v>` : '';
              return `<c r="${ref}"${styleAttr}><f>${escapeXml(cleanFormula)}</f>${cached}</c>`;
            }
            if (typeof cell.value === 'number' && Number.isFinite(cell.value)) {
              return `<c r="${ref}"${styleAttr}><v>${cell.value}</v></c>`;
            }
            const textVal = cell.value !== undefined ? String(cell.value) : '';
            return `<c r="${ref}" t="inlineStr"${styleAttr}><is><t xml:space="preserve">${escapeXml(textVal)}</t></is></c>`;
          })
          .join('');
        return `<row r="${rowNum}">${cellsXml}</row>`;
      })
      .join('');

    return {
      name: `xl/worksheets/sheet${idx + 1}.xml`,
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${rowXml}</sheetData>
</worksheet>`,
    };
  });

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${safeSheets
      .map((s, i) => `<sheet name="${escapeXml(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('\n    ')}
  </sheets>
</workbook>`;

  const wbRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${safeSheets
    .map(
      (_s, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
    )
    .join('\n  ')}
  <Relationship Id="rId${safeSheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF4B2E83"/></patternFill></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
  </cellXfs>
</styleSheet>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${safeSheets
    .map(
      (_s, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('\n  ')}
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  return createZipBuffer([
    { name: '[Content_Types].xml', content: contentTypes },
    { name: '_rels/.rels', content: rootRels },
    { name: 'xl/_rels/workbook.xml.rels', content: wbRelsXml },
    { name: 'xl/styles.xml', content: stylesXml },
    { name: 'xl/workbook.xml', content: workbookXml },
    ...sheetXmlFiles,
  ]);
}

// ---------- PowerPoint (.pptx) ----------

export interface PowerPointSlideSpec {
  title: string;
  bullets: string[];
}

export function buildPptxBuffer(slides: PowerPointSlideSpec[]): Buffer {
  const safeSlides =
    slides.length > 0 ? slides : [{ title: 'Presentation Overview', bullets: ['Generated by F.R.I.D.A.Y.'] }];

  const slideFiles = safeSlides.flatMap((slide, idx) => {
    const n = idx + 1;
    const bulletParagraphs = slide.bullets
      .map(
        (b) => `
          <a:p>
            <a:pPr marL="342900" indent="-171450"><a:buChar char="•"/></a:pPr>
            <a:r><a:rPr lang="en-US" sz="2000"><a:solidFill><a:srgbClr val="1E1B4B"/></a:solidFill></a:rPr><a:t>${escapeXml(b)}</a:t></a:r>
          </a:p>`
      )
      .join('');

    const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title ${n}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="685800" y="457200"/><a:ext cx="7772400" cy="1143000"/></a:xfrm></p:spPr>
        <p:txBody>
          <a:bodyPr/><a:lstStyle/>
          <a:p><a:r><a:rPr lang="en-US" sz="3200" b="1"><a:solidFill><a:srgbClr val="4C1D95"/></a:solidFill></a:rPr><a:t>${escapeXml(slide.title)}</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Content ${n}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="685800" y="1828800"/><a:ext cx="7772400" cy="4343400"/></a:xfrm></p:spPr>
        <p:txBody>
          <a:bodyPr/><a:lstStyle/>
          ${bulletParagraphs}
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

    const slideRel = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`;

    return [
      { name: `ppt/slides/slide${n}.xml`, content: slideXml },
      { name: `ppt/slides/_rels/slide${n}.xml.rels`, content: slideRel },
    ];
  });

  const presentationXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>
    ${safeSlides.map((_s, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('\n    ')}
  </p:sldIdLst>
  <p:sldSz cx="9144000" cy="6858000" type="screen4x3"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`;

  const presRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  ${safeSlides
    .map(
      (_s, i) =>
        `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`
    )
    .join('\n  ')}
</Relationships>`;

  const slideMasterXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`;

  const slideMasterRel = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`;

  const slideLayoutXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="obj" preserve="1">
  <p:cSld name="Title and Content"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
</p:sldLayout>`;

  const slideLayoutRel = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  ${safeSlides
    .map(
      (_s, i) =>
        `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
    )
    .join('\n  ')}
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`;

  return createZipBuffer([
    { name: '[Content_Types].xml', content: contentTypes },
    { name: '_rels/.rels', content: rootRels },
    { name: 'ppt/_rels/presentation.xml.rels', content: presRels },
    { name: 'ppt/presentation.xml', content: presentationXml },
    { name: 'ppt/slideMasters/slideMaster1.xml', content: slideMasterXml },
    { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', content: slideMasterRel },
    { name: 'ppt/slideLayouts/slideLayout1.xml', content: slideLayoutXml },
    { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', content: slideLayoutRel },
    ...slideFiles,
  ]);
}

export function writeAndVerifyOfficeFile(params: {
  kind: 'docx' | 'xlsx' | 'pptx';
  outputPath: string;
  buffer: Buffer;
}): { ok: boolean; path: string; sizeBytes: number; entries: string[]; error?: string } {
  const resolved = path.resolve(params.outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, params.buffer);

  const written = fs.readFileSync(resolved);
  const required =
    params.kind === 'docx'
      ? ['[Content_Types].xml', 'word/document.xml']
      : params.kind === 'xlsx'
        ? ['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']
        : ['[Content_Types].xml', 'ppt/presentation.xml', 'ppt/slides/slide1.xml'];

  const check = verifyOoxmlZipBuffer(written, required);
  return {
    ok: check.valid,
    path: resolved,
    sizeBytes: written.length,
    entries: check.entries,
    error: check.error,
  };
}
