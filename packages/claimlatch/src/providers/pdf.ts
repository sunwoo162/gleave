import { getDocument, VerbosityLevel } from "pdfjs-dist/legacy/build/pdf.mjs";

export interface PdfPageText {
  page: number;
  text: string;
}

export type PdfTextParser = (data: Uint8Array) => Promise<PdfPageText[]>;

export const extractPdfPages: PdfTextParser = async (data) => {
  const loadingTask = getDocument({
    data,
    verbosity: VerbosityLevel.ERRORS,
  });
  const document = await loadingTask.promise;
  const pages: PdfPageText[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        const rawText = content.items
          .map((item) => {
            if (!("str" in item)) return "";
            return `${item.str}${item.hasEOL ? "\n" : " "}`;
          })
          .join("");
        const text = collapseWhitespace(rawText);
        if (text) pages.push({ page: pageNumber, text });
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await document.destroy();
  }

  return pages;
};

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
