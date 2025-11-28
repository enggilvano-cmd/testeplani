/**
 * Lazy loading utilities for heavy libraries
 * Reduces initial bundle size by ~1MB
 */

let xlsxModule: typeof import('xlsx') | null = null;
let jsPDFModule: typeof import('jspdf') | null = null;
let htmlToImageModule: typeof import('html-to-image') | null = null;

/**
 * Lazy load XLSX library
 * Used for Excel import/export functionality
 */
export async function loadXLSX() {
  if (!xlsxModule) {
    xlsxModule = await import('xlsx');
  }
  return xlsxModule;
}

/**
 * Lazy load jsPDF library
 * Used for PDF generation
 */
export async function loadJsPDF() {
  if (!jsPDFModule) {
    jsPDFModule = await import('jspdf');
  }
  return jsPDFModule;
}

/**
 * Lazy load html-to-image library
 * Used for converting HTML elements to images
 */
export async function loadHtmlToImage() {
  if (!htmlToImageModule) {
    htmlToImageModule = await import('html-to-image');
  }
  return htmlToImageModule;
}
