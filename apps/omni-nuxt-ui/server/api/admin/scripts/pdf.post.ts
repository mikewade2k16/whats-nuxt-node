import { randomUUID } from 'node:crypto'
import { createError, readBody, setHeader } from 'h3'
import { requireScopedFeatureAccess } from '~~/server/utils/admin-route-auth'

interface PdfRowInput {
  id?: unknown
  audio?: unknown
  video?: unknown
}

interface PdfRequestBody {
  scriptId?: unknown
  title?: unknown
  notes?: unknown
  rows?: unknown
}

interface PdfNormalizedRow {
  id: string
  audio: string
  video: string
}

interface PdfPayload {
  scriptId: number
  title: string
  notes: string
  rows: PdfNormalizedRow[]
  fileName: string
}

const A4_WIDTH = 595.28
const A4_HEIGHT = 841.89
const PAGE_MARGIN = 36
const TITLE_FONT_SIZE = 21
const META_FONT_SIZE = 10
const BODY_FONT_SIZE = 10
const BODY_LINE_HEIGHT = 13
const CELL_PADDING = 6

function normalizeText(value: unknown, maxLength = 18000) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, maxLength)
}

function normalizeRows(input: unknown): PdfNormalizedRow[] {
  if (!Array.isArray(input)) return []

  const rows = input
    .map((raw, index) => {
      const row = (raw ?? {}) as PdfRowInput
      return {
        id: normalizeText(row.id, 80) || `row-${index + 1}`,
        audio: normalizeText(row.audio, 18000),
        video: normalizeText(row.video, 18000)
      }
    })
    .filter(row => row.audio.length > 0 || row.video.length > 0)

  if (rows.length > 0) return rows
  return [{
    id: 'row-1',
    audio: '',
    video: ''
  }]
}

function sanitizeFileName(rawTitle: string, scriptId = 0) {
  const normalized = String(rawTitle ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
    .slice(0, 120)

  const fallback = `roteiro-${scriptId > 0 ? scriptId : 'draft'}`
  const base = normalized || fallback
  return `${base}.pdf`
}

function normalizePdfPayload(body: PdfRequestBody): PdfPayload {
  const scriptIdRaw = Number.parseInt(String(body?.scriptId ?? ''), 10)
  const scriptId = Number.isFinite(scriptIdRaw) ? scriptIdRaw : 0
  const title = normalizeText(body?.title, 180) || 'Novo roteiro'
  const notes = normalizeText(body?.notes, 20000)
  const rows = normalizeRows(body?.rows)
  const fileName = sanitizeFileName(title, scriptId)

  return {
    scriptId,
    title,
    notes,
    rows,
    fileName
  }
}

function toAscii(value: string) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E\n]/g, ' ')
}

function escapePdfText(value: string) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

function wrapByChars(text: string, maxChars: number) {
  const raw = String(text ?? '')
  const chunks = raw.split('\n')
  const lines: string[] = []

  for (const chunk of chunks) {
    const normalized = chunk.trim()
    if (!normalized) {
      lines.push('')
      continue
    }

    const words = normalized.split(/\s+/)
    let current = ''

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (candidate.length <= maxChars) {
        current = candidate
        continue
      }

      if (current) lines.push(current)
      current = ''

      if (word.length <= maxChars) {
        current = word
        continue
      }

      for (let i = 0; i < word.length; i += maxChars) {
        const part = word.slice(i, i + maxChars)
        if (part.length === maxChars) {
          lines.push(part)
        } else {
          current = part
        }
      }
    }

    if (current) lines.push(current)
  }

  return lines.length > 0 ? lines : ['']
}

function buildFallbackPageLines(payload: PdfPayload) {
  const lines: string[] = []
  lines.push(`ROTEIRO: ${toAscii(payload.title).toUpperCase()}`)
  lines.push(`GERADO EM: ${new Date().toLocaleString('pt-BR')} | SCRIPT #${payload.scriptId > 0 ? payload.scriptId : 'draft'}`)
  lines.push('')

  if (payload.notes) {
    lines.push('OBSERVACOES')
    lines.push('----------------------------------------------')
    wrapByChars(toAscii(payload.notes), 88).forEach(line => lines.push(line))
    lines.push('')
  }

  lines.push('AUDIO                                         | VIDEO')
  lines.push('----------------------------------------------+----------------------------------------------')

  for (const row of payload.rows) {
    const left = wrapByChars(toAscii(row.audio || '-'), 44)
    const right = wrapByChars(toAscii(row.video || '-'), 44)
    const max = Math.max(left.length, right.length, 1)

    for (let i = 0; i < max; i++) {
      const l = (left[i] || '').padEnd(44, ' ')
      const r = (right[i] || '').padEnd(44, ' ')
      lines.push(`${l} | ${r}`)
    }
    lines.push('----------------------------------------------+----------------------------------------------')
  }

  return lines
}

function buildSimplePdfBuffer(pageLines: string[][]) {
  const objects: Array<{ id: number, body: string }> = []

  function addObject(body: string) {
    const id = objects.length + 1
    objects.push({ id, body })
    return id
  }

  const catalogId = addObject('')
  const pagesId = addObject('')
  const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>')

  const pageObjectIds: number[] = []

  for (const lines of pageLines) {
    const safeLines = lines.map(line => escapePdfText(toAscii(line)))
    const contentParts: string[] = []
    contentParts.push('BT')
    contentParts.push('/F1 10 Tf')
    contentParts.push('14 TL')
    contentParts.push('36 802 Td')
    safeLines.forEach((line, index) => {
      if (index === 0) {
        contentParts.push(`(${line}) Tj`)
      } else {
        contentParts.push('T*')
        contentParts.push(`(${line}) Tj`)
      }
    })
    contentParts.push('ET')

    const stream = `${contentParts.join('\n')}\n`
    const streamLength = Buffer.byteLength(stream, 'utf8')
    const contentId = addObject(`<< /Length ${streamLength} >>\nstream\n${stream}endstream`)
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`)
    pageObjectIds.push(pageId)
  }

  const kids = pageObjectIds.map(id => `${id} 0 R`).join(' ')
  objects[pagesId - 1]!.body = `<< /Type /Pages /Count ${pageObjectIds.length} /Kids [ ${kids} ] >>`
  objects[catalogId - 1]!.body = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`

  let pdf = '%PDF-1.4\n'
  const offsets = new Array(objects.length + 1).fill(0)

  for (const obj of objects) {
    offsets[obj.id] = Buffer.byteLength(pdf, 'utf8')
    pdf += `${obj.id} 0 obj\n${obj.body}\nendobj\n`
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8')
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'

  for (let i = 1; i <= objects.length; i++) {
    const offset = String(offsets[i]).padStart(10, '0')
    pdf += `${offset} 00000 n \n`
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\n`
  pdf += `startxref\n${xrefOffset}\n%%EOF`

  return Buffer.from(pdf, 'utf8')
}

function generateFallbackPdfBuffer(payload: PdfPayload) {
  const allLines = buildFallbackPageLines(payload)
  const maxLinesPerPage = 52
  const pages: string[][] = []

  for (let i = 0; i < allLines.length; i += maxLinesPerPage) {
    pages.push(allLines.slice(i, i + maxLinesPerPage))
  }

  if (pages.length === 0) {
    pages.push(['ROTEIRO VAZIO'])
  }

  return buildSimplePdfBuffer(pages)
}

type DynamicPdfFont = {
  widthOfTextAtSize: (text: string, size: number) => number
}

async function generatePdfWithPdfLib(payload: PdfPayload) {
  const mod = await import('pdf-lib')
  const { PDFDocument, StandardFonts, rgb } = mod

  function wrapText(text: string, maxWidth: number, font: DynamicPdfFont, fontSize: number) {
    const normalized = String(text ?? '').replace(/\r\n/g, '\n')
    const paragraphs = normalized.split('\n')
    const lines: string[] = []

    for (const paragraph of paragraphs) {
      const chunk = paragraph.trim()
      if (!chunk) {
        lines.push('')
        continue
      }

      const words = chunk.split(/\s+/).filter(Boolean)
      let currentLine = ''

      for (const word of words) {
        const candidate = currentLine ? `${currentLine} ${word}` : word
        const candidateWidth = font.widthOfTextAtSize(candidate, fontSize)

        if (candidateWidth <= maxWidth) {
          currentLine = candidate
          continue
        }

        if (currentLine) {
          lines.push(currentLine)
          currentLine = ''
        }

        const wordWidth = font.widthOfTextAtSize(word, fontSize)
        if (wordWidth <= maxWidth) {
          currentLine = word
          continue
        }

        let chunkText = ''
        for (const char of word) {
          const testChunk = `${chunkText}${char}`
          const chunkWidth = font.widthOfTextAtSize(testChunk, fontSize)
          if (chunkWidth <= maxWidth) {
            chunkText = testChunk
            continue
          }

          if (chunkText) lines.push(chunkText)
          chunkText = char
        }
        currentLine = chunkText
      }

      if (currentLine) lines.push(currentLine)
    }

    if (lines.length > 0) return lines
    return ['']
  }

  const pdfDoc = await PDFDocument.create()
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Courier)
  const fontBold = await pdfDoc.embedFont(StandardFonts.CourierBold)

  const tableWidth = A4_WIDTH - (PAGE_MARGIN * 2)
  const colWidth = tableWidth / 2
  let page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT])
  let cursorY = A4_HEIGHT - PAGE_MARGIN

  function addPage() {
    page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT])
    cursorY = A4_HEIGHT - PAGE_MARGIN
  }

  function drawTableHeader() {
    const headerHeight = 22
    if (cursorY - headerHeight < PAGE_MARGIN) addPage()

    const headerBottom = cursorY - headerHeight
    page.drawRectangle({
      x: PAGE_MARGIN,
      y: headerBottom,
      width: colWidth,
      height: headerHeight,
      color: rgb(0.93, 0.9, 0.84),
      borderColor: rgb(0.68, 0.64, 0.55),
      borderWidth: 0.8
    })
    page.drawRectangle({
      x: PAGE_MARGIN + colWidth,
      y: headerBottom,
      width: colWidth,
      height: headerHeight,
      color: rgb(0.93, 0.9, 0.84),
      borderColor: rgb(0.68, 0.64, 0.55),
      borderWidth: 0.8
    })

    page.drawText('AUDIO', {
      x: PAGE_MARGIN + 8,
      y: headerBottom + 6,
      size: 10,
      font: fontBold,
      color: rgb(0.18, 0.16, 0.12)
    })
    page.drawText('VIDEO', {
      x: PAGE_MARGIN + colWidth + 8,
      y: headerBottom + 6,
      size: 10,
      font: fontBold,
      color: rgb(0.18, 0.16, 0.12)
    })

    cursorY = headerBottom
  }

  page.drawText(payload.title.toUpperCase(), {
    x: PAGE_MARGIN,
    y: cursorY - TITLE_FONT_SIZE,
    font: fontBold,
    size: TITLE_FONT_SIZE,
    color: rgb(0.1, 0.1, 0.1)
  })
  cursorY -= 34

  const metaLine = `Gerado em ${new Date().toLocaleString('pt-BR')} | script #${payload.scriptId > 0 ? payload.scriptId : 'draft'}`
  page.drawText(metaLine, {
    x: PAGE_MARGIN,
    y: cursorY - META_FONT_SIZE,
    font: fontRegular,
    size: META_FONT_SIZE,
    color: rgb(0.35, 0.35, 0.35)
  })
  cursorY -= 24

  if (payload.notes) {
    page.drawText('OBSERVACOES', {
      x: PAGE_MARGIN,
      y: cursorY - 10,
      font: fontBold,
      size: 10,
      color: rgb(0.2, 0.2, 0.2)
    })
    cursorY -= 16

    const notesLines = wrapText(payload.notes, tableWidth - 8, fontRegular, BODY_FONT_SIZE)
    for (const noteLine of notesLines) {
      if (cursorY - BODY_LINE_HEIGHT < PAGE_MARGIN) addPage()
      page.drawText(noteLine, {
        x: PAGE_MARGIN + 4,
        y: cursorY - BODY_FONT_SIZE,
        font: fontRegular,
        size: BODY_FONT_SIZE,
        color: rgb(0.16, 0.16, 0.16)
      })
      cursorY -= BODY_LINE_HEIGHT
    }

    cursorY -= 8
  }

  drawTableHeader()

  for (const row of payload.rows) {
    const audioLines = wrapText(row.audio || '-', colWidth - (CELL_PADDING * 2), fontRegular, BODY_FONT_SIZE)
    const videoLines = wrapText(row.video || '-', colWidth - (CELL_PADDING * 2), fontRegular, BODY_FONT_SIZE)
    const maxLines = Math.max(audioLines.length, videoLines.length, 1)
    const rowHeight = Math.max(34, (maxLines * BODY_LINE_HEIGHT) + (CELL_PADDING * 2))

    if (cursorY - rowHeight < PAGE_MARGIN) {
      addPage()
      drawTableHeader()
    }

    const rowBottom = cursorY - rowHeight
    page.drawRectangle({
      x: PAGE_MARGIN,
      y: rowBottom,
      width: colWidth,
      height: rowHeight,
      borderColor: rgb(0.76, 0.73, 0.66),
      borderWidth: 0.7
    })
    page.drawRectangle({
      x: PAGE_MARGIN + colWidth,
      y: rowBottom,
      width: colWidth,
      height: rowHeight,
      borderColor: rgb(0.76, 0.73, 0.66),
      borderWidth: 0.7
    })

    const textStartY = cursorY - CELL_PADDING - BODY_FONT_SIZE
    audioLines.forEach((line, lineIndex) => {
      page.drawText(line, {
        x: PAGE_MARGIN + CELL_PADDING,
        y: textStartY - (lineIndex * BODY_LINE_HEIGHT),
        font: fontRegular,
        size: BODY_FONT_SIZE,
        color: rgb(0.12, 0.12, 0.12)
      })
    })
    videoLines.forEach((line, lineIndex) => {
      page.drawText(line, {
        x: PAGE_MARGIN + colWidth + CELL_PADDING,
        y: textStartY - (lineIndex * BODY_LINE_HEIGHT),
        font: fontRegular,
        size: BODY_FONT_SIZE,
        color: rgb(0.12, 0.12, 0.12)
      })
    })

    cursorY = rowBottom
  }

  const bytes = await pdfDoc.save()
  return Buffer.from(bytes)
}

export default defineEventHandler(async (event) => {
  const access = await requireScopedFeatureAccess(event, '/admin/tools/scripts')

  const startedAt = Date.now()
  const requestId = randomUUID()

  try {
    const body = await readBody<PdfRequestBody>(event)
    const payload = normalizePdfPayload(body ?? {})
    let engine = 'pdf-lib'
    let bytes: Buffer

    try {
      bytes = await generatePdfWithPdfLib(payload)
    } catch (pdfLibError) {
      engine = 'fallback'
      const reason = pdfLibError instanceof Error ? pdfLibError.message : 'pdf-lib indisponivel'
      console.warn('[scripts-pdf] pdf-lib unavailable, using fallback', {
        requestId,
        reason
      })
      bytes = generateFallbackPdfBuffer(payload)
      setHeader(event, 'X-Pdf-Fallback-Reason', toAscii(reason).slice(0, 180))
    }

    const elapsedMs = Date.now() - startedAt

    setHeader(event, 'Content-Type', 'application/pdf')
    setHeader(event, 'Cache-Control', 'no-store')
    setHeader(event, 'X-Pdf-Request-Id', requestId)
    setHeader(event, 'X-Pdf-Generation-Ms', String(elapsedMs))
    setHeader(event, 'X-Pdf-Engine', engine)
    setHeader(event, 'Content-Disposition', `inline; filename="${payload.fileName}"; filename*=UTF-8''${encodeURIComponent(payload.fileName)}`)

    console.info('[scripts-pdf] generated', {
      requestId,
      engine,
      scriptId: payload.scriptId,
      rows: payload.rows.length,
      bytes: bytes.length,
      elapsedMs,
      viewerUserType: access.userType,
      viewerClientId: access.clientId
    })

    return bytes
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao gerar PDF.'
    console.error('[scripts-pdf] failed', {
      requestId,
      message,
      error
    })
    throw createError({
      statusCode: 500,
      statusMessage: 'Falha ao gerar PDF.',
      data: { requestId, message }
    })
  }
})

