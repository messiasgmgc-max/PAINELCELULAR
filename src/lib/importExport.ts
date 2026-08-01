"use client";

import * as XLSX from "xlsx";

export type ExportFormat = "csv" | "xls" | "pdf";

export interface ExportColumn {
  key: string;
  label: string;
}

const PDF_JSON_BEGIN = "PAINELCELULAR_EXPORT_JSON_BEGIN";
const PDF_JSON_END = "PAINELCELULAR_EXPORT_JSON_END";

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeCsv(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function inferFormatByName(fileName: string): "csv" | "xls" | "xlsx" | "pdf" | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".xls")) return "xls";
  if (lower.endsWith(".xlsx")) return "xlsx";
  if (lower.endsWith(".pdf")) return "pdf";
  return null;
}

function seemsHeaderRow(cells: string[]): boolean {
  const hints = new Set([
    "id",
    "nome",
    "email",
    "telefone",
    "cpf",
    "cnpj",
    "cliente",
    "vendedor",
    "codigo",
    "codigounico",
    "descricao",
    "fornecedor",
    "custo",
    "venda",
    "estoque",
    "valor",
    "status",
    "data",
    "datacadastro",
    "datapagamento",
    "metodo",
  ]);

  const normalized = cells.map((cell) => normalizeHeader(cell)).filter(Boolean);
  if (normalized.length === 0) return false;

  const hits = normalized.filter((cell) => {
    if (hints.has(cell)) return true;
    for (const hint of hints) {
      if (cell.startsWith(hint)) return true;
    }
    return false;
  }).length;

  return hits >= Math.max(2, Math.ceil(normalized.length * 0.25));
}

function matrixToRecords(matrix: Array<Array<string | number | boolean | null | undefined>>): Record<string, string>[] {
  if (!matrix.length) return [];

  const firstRow = (matrix[0] || []).map((cell) => String(cell ?? "").trim());
  const hasHeader = seemsHeaderRow(firstRow);

  const headers = hasHeader
    ? firstRow
    : firstRow.map((_, index) => `_col${index + 1}`);

  const startIndex = hasHeader ? 1 : 0;
  const records: Record<string, string>[] = [];

  for (let rowIndex = startIndex; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex] || [];
    const record: Record<string, string> = {};

    headers.forEach((header, colIndex) => {
      record[header] = String(row[colIndex] ?? "").trim();
    });

    const hasAnyValue = Object.values(record).some((v) => v !== "");
    if (hasAnyValue) records.push(record);
  }

  return records;
}

async function parsePdfRecords(file: File): Promise<Record<string, string>[]> {
  const pdfModule = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const arrayBuffer = await file.arrayBuffer();

  const loadingTask = pdfModule.getDocument({
    data: new Uint8Array(arrayBuffer),
    disableWorker: true,
  });

  const pdf = await loadingTask.promise;
  let allText = "";

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: any) => (typeof item.str === "string" ? item.str : ""))
      .join("\n");

    allText += `${text}\n`;
  }

  const begin = allText.indexOf(PDF_JSON_BEGIN);
  const end = allText.indexOf(PDF_JSON_END);

  if (begin >= 0 && end > begin) {
    const payload = allText
      .slice(begin + PDF_JSON_BEGIN.length, end)
      .trim();

    try {
      const parsed = JSON.parse(payload);
      if (Array.isArray(parsed)) {
        return parsed.map((row) => {
          const normalized: Record<string, string> = {};
          Object.entries(row || {}).forEach(([key, value]) => {
            normalized[String(key)] = String(value ?? "");
          });
          return normalized;
        });
      }
    } catch {
      // Fallback para parser de linhas abaixo.
    }
  }

  const lines = allText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const matrix: string[][] = [];

  for (const line of lines) {
    const cells = line
      .split(/\s{2,}|\t|;|\|/)
      .map((cell) => cell.trim())
      .filter(Boolean);

    if (cells.length >= 2) {
      matrix.push(cells);
    }
  }

  return matrixToRecords(matrix);
}

export async function parseImportFile(file: File): Promise<Record<string, string>[]> {
  const format = inferFormatByName(file.name);
  if (!format) {
    throw new Error("Formato não suportado. Use CSV, XLS ou XLSX.");
  }

  if (format === "pdf") {
    return parsePdfRecords(file);
  }

  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, {
    type: "array",
    cellDates: true,
  });

  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(firstSheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as Array<Array<string | number | boolean | null | undefined>>;

  return matrixToRecords(matrix);
}

export function findByAliases(record: Record<string, string>, aliases: string[]): string {
  const aliasMap = new Map<string, string>();
  Object.entries(record).forEach(([key, value]) => {
    aliasMap.set(normalizeHeader(key), value);
  });

  for (const alias of aliases) {
    const match = aliasMap.get(normalizeHeader(alias));
    if (match !== undefined) return String(match).trim();
  }

  return "";
}

export function parseCurrencyLike(value: string): number {
  if (!value) return 0;

  const sanitized = value
    .replace(/r\$/gi, "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");

  const parsed = Number(sanitized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function exportDataset(options: {
  fileNameBase: string;
  title: string;
  format: ExportFormat;
  columns: ExportColumn[];
  rows: Array<Record<string, unknown>>;
}): Promise<void> {
  const { fileNameBase, title, format, columns, rows } = options;

  if (format === "csv") {
    const headers = columns.map((col) => col.label);
    const csvRows = rows.map((row) => columns.map((col) => row[col.key] ?? ""));
    const content = [
      headers.map((cell) => escapeCsv(cell)).join(","),
      ...csvRows.map((row) => row.map((cell) => escapeCsv(cell)).join(",")),
    ].join("\n");

    downloadBlob(new Blob([content], { type: "text/csv;charset=utf-8;" }), `${fileNameBase}.csv`);
    return;
  }

  if (format === "xls") {
    const jsonRows = rows.map((row) => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col) => {
        obj[col.label] = row[col.key] ?? "";
      });
      return obj;
    });

    const sheet = XLSX.utils.json_to_sheet(jsonRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "dados");
    XLSX.writeFile(workbook, `${fileNameBase}.xls`, { bookType: "biff8" });
    return;
  }

  const html2pdf = (await import("html2pdf.js")).default as any;
  const container = document.createElement("div");

  const tableHeader = columns
    .map((col) => `<th style="border:1px solid #ddd;padding:8px;text-align:left;">${escapeHtml(col.label)}</th>`)
    .join("");

  const tableBody = rows
    .map(
      (row) =>
        `<tr>${columns
          .map((col) => `<td style="border:1px solid #ddd;padding:8px;">${escapeHtml(row[col.key] ?? "")}</td>`)
          .join("")}</tr>`
    )
    .join("");

  const payload = JSON.stringify(rows);
  container.innerHTML = `
    <div style="font-family:Arial,sans-serif;color:#111;padding:20px;">
      <h1 style="margin:0 0 14px 0;font-size:18px;">${escapeHtml(title)}</h1>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr>${tableHeader}</tr></thead>
        <tbody>${tableBody}</tbody>
      </table>
      <pre style="font-size:1px;color:transparent;line-height:1;margin-top:8px;white-space:pre-wrap;">${PDF_JSON_BEGIN}${escapeHtml(payload)}${PDF_JSON_END}</pre>
    </div>
  `;

  await html2pdf()
    .set({
      margin: 8,
      filename: `${fileNameBase}.pdf`,
      html2canvas: { scale: 2 },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    })
    .from(container)
    .save();
}
