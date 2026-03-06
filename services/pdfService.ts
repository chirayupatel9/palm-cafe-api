import path from 'path';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import puppeteer, { Browser } from 'puppeteer';
import CurrencySettings from '../models/currencySettings';
import CafeSettings from '../models/cafeSettings';
import logger from '../config/logger';

const PUBLIC_ROOT = path.resolve(__dirname, '..', 'public');
const PUBLIC_IMAGES = path.resolve(__dirname, '..', 'public', 'images');

export interface InvoiceItem {
  name?: string;
  item_name?: string;
  quantity: number;
  price: number;
  total: number;
}

export interface InvoiceForPdf {
  cafe_id?: number | null;
  invoice_number?: string;
  invoiceNumber?: string;
  invoice_date: string | number | Date;
  order_number?: string;
  customer_name?: string;
  customerName?: string;
  customer_phone?: string;
  customerPhone?: string;
  items?: InvoiceItem[];
  subtotal: number;
  tax_amount?: number;
  tip_amount?: number;
  total_amount: number;
  payment_method?: string;
}

/**
 * Resolve logo_url to a safe filesystem path under public (or public/images).
 * Returns null if invalid or if path would escape the allowed directory.
 */
export function resolveLogoPath(logoUrl: string | null | undefined): string | null {
  if (!logoUrl || typeof logoUrl !== 'string') return null;
  const trimmed = logoUrl.trim();
  if (!trimmed) return null;
  if (trimmed.includes('\\')) return null;
  const baseDir = trimmed.startsWith('/') ? PUBLIC_ROOT : PUBLIC_IMAGES;
  const relativePart = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
  const normalized = path.normalize(relativePart);
  if (normalized.includes('..')) return null;
  const resolved = path.resolve(baseDir, normalized);
  const rel = path.relative(baseDir, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  if (!fs.existsSync(resolved)) return null;
  return resolved;
}

function getMimeTypeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

function escapeHtml(value: unknown): string {
  const input = String(value ?? '');
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

type PdfCafeSettings = {
  cafe_name: string;
  logo_url?: string | null;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  light_background_color?: string;
  light_text_color?: string;
  light_surface_color?: string;
};

function buildInvoiceHtml(invoice: InvoiceForPdf, cafeSettings: PdfCafeSettings, currencySymbol: string): string {
  const primary = cafeSettings.primary_color || '#75826b';
  const secondary = cafeSettings.secondary_color || '#153059';
  const accent = cafeSettings.accent_color || '#e0a066';
  const bg = cafeSettings.light_background_color || '#ffffff';
  const text = cafeSettings.light_text_color || '#1f2937';
  const surface = cafeSettings.light_surface_color || '#f8fafc';

  const invoiceDate = new Date(invoice.invoice_date || new Date());
  const createdDate = invoiceDate.toLocaleDateString('en-IN');
  const dueDate = createdDate;
  const invoiceNumber = invoice.invoice_number || invoice.invoiceNumber || 'N/A';
  const customerName = invoice.customer_name || invoice.customerName || 'Walk-in Customer';
  const customerPhone = invoice.customer_phone || invoice.customerPhone || '-';
  const orderNumber = invoice.order_number || '-';

  const formatAmount = (amount: number | string | undefined) => {
    const num = Number(amount || 0);
    return `${currencySymbol}${num.toFixed(2)}`;
  };

  const itemsHtml = (invoice.items || [])
    .map((item) => {
      const name = item.name || item.item_name || 'Unknown Item';
      return `
        <tr>
          <td>${escapeHtml(name)}</td>
          <td style="text-align: right;">${escapeHtml(item.quantity)}</td>
          <td style="text-align: right;">${escapeHtml(formatAmount(item.price))}</td>
        </tr>
      `;
    })
    .join('');

  let logoHtml = '';
  const logoPath = resolveLogoPath(cafeSettings.logo_url);
  if (logoPath) {
    const logoBuffer = fs.readFileSync(logoPath);
    const mimeType = getMimeTypeFromPath(logoPath);
    const logoDataUri = `data:${mimeType};base64,${logoBuffer.toString('base64')}`;
    logoHtml = `<img src="${logoDataUri}" alt="Cafe Logo" class="logo" />`;
  } else {
    const initial = escapeHtml((cafeSettings.cafe_name || 'Cafe').charAt(0).toUpperCase());
    logoHtml = `<div class="logo-fallback">${initial}</div>`;
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice</title>
  <style>
    :root {
      --pdf-primary: ${primary};
      --pdf-secondary: ${secondary};
      --pdf-accent: ${accent};
      --pdf-bg: ${bg};
      --pdf-text: ${text};
      --pdf-surface: ${surface};
    }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: var(--pdf-bg); color: var(--pdf-text); }
    .header { background: linear-gradient(135deg, var(--pdf-secondary) 0%, var(--pdf-primary) 100%); color: #ffffff; padding: 28px 34px; display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; }
    .logo { width: 56px; height: 56px; object-fit: contain; border-radius: 10px; background: rgba(255, 255, 255, 0.15); padding: 4px; }
    .logo-fallback { width: 56px; height: 56px; border-radius: 50%; background: rgba(255, 255, 255, 0.15); display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 700; }
    .header-left { display: flex; gap: 14px; align-items: center; }
    .cafe-name { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
    .invoice-title { font-size: 36px; font-weight: 800; margin-bottom: 10px; text-align: right; }
    .invoice-meta { font-size: 13px; line-height: 1.6; text-align: right; }
    .content { padding: 28px 34px; }
    .parties { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 24px; background: var(--pdf-surface); border: 1px solid rgba(0, 0, 0, 0.07); padding: 18px; border-radius: 12px; }
    .party { width: 48%; font-size: 13px; line-height: 1.6; }
    .party h3 { color: var(--pdf-secondary); font-size: 12px; margin: 0 0 8px 0; font-weight: 700; letter-spacing: 0.05em; }
    .party strong { color: var(--pdf-secondary); font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th { background: var(--pdf-primary); color: white; padding: 12px; text-align: left; font-size: 13px; font-weight: 600; }
    td { padding: 11px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
    .totals { width: 340px; margin-left: auto; border: 1px solid rgba(0, 0, 0, 0.08); border-radius: 10px; overflow: hidden; }
    .totals table { margin: 0; }
    .totals td { border-bottom: 1px solid #e5e7eb; padding: 10px 12px; }
    .totals tr:last-child td { border-bottom: none; }
    .total-row td { font-weight: 700; font-size: 18px; color: #ffffff; background: var(--pdf-primary); }
    .notes { margin-top: 24px; padding: 16px; background: linear-gradient(180deg, var(--pdf-surface), var(--pdf-bg)); border: 1px solid rgba(0, 0, 0, 0.08); border-radius: 12px; font-size: 12px; line-height: 1.6; }
    .notes strong { color: var(--pdf-secondary); }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      ${logoHtml}
      <div>
        <div class="cafe-name">${escapeHtml(cafeSettings.cafe_name || 'Cafe')}</div>
        <div style="font-size:12px; opacity:0.95;">${escapeHtml(cafeSettings.address || '')}</div>
      </div>
    </div>
    <div>
      <div class="invoice-title">INVOICE</div>
      <div class="invoice-meta">
        <div><strong>Invoice #:</strong> ${escapeHtml(invoiceNumber)}</div>
        <div><strong>Date:</strong> ${escapeHtml(createdDate)}</div>
        <div><strong>Due:</strong> ${escapeHtml(dueDate)}</div>
      </div>
    </div>
  </div>

  <div class="content">
    <div class="parties">
      <div class="party">
        <h3>FROM</h3>
        <strong>${escapeHtml(cafeSettings.cafe_name || 'Cafe')}</strong><br>
        ${escapeHtml(cafeSettings.address || '-')}<br>
        ${escapeHtml(cafeSettings.phone || '-')}<br>
        ${escapeHtml(cafeSettings.email || '-')}
      </div>
      <div class="party" style="text-align: right;">
        <h3>TO</h3>
        <strong>${escapeHtml(customerName)}</strong><br>
        Phone: ${escapeHtml(customerPhone)}<br>
        Order #: ${escapeHtml(orderNumber)}<br>
        Payment: ${escapeHtml(invoice.payment_method || 'cash')}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th style="text-align: right;">Qty</th>
          <th style="text-align: right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml || '<tr><td colspan="3" style="text-align:center;">No items</td></tr>'}
      </tbody>
    </table>

    <div class="totals">
      <table>
        <tr><td>Subtotal:</td><td style="text-align: right;">${escapeHtml(formatAmount(invoice.subtotal))}</td></tr>
        <tr><td>Tax:</td><td style="text-align: right;">${escapeHtml(formatAmount(invoice.tax_amount || 0))}</td></tr>
        <tr><td>Tip:</td><td style="text-align: right;">${escapeHtml(formatAmount(invoice.tip_amount || 0))}</td></tr>
        <tr class="total-row"><td>Total:</td><td style="text-align: right;">${escapeHtml(formatAmount(invoice.total_amount))}</td></tr>
      </table>
    </div>

    <div class="notes">
      <strong>Notes:</strong><br>
      Thank you for visiting ${escapeHtml(cafeSettings.cafe_name || 'our cafe')}.<br>
      ${escapeHtml(cafeSettings.website || '')}
    </div>
  </div>
</body>
</html>
  `;
}

async function tryGenerateHtmlPdf(invoice: InvoiceForPdf, cafeSettings: PdfCafeSettings, currencySymbol: string): Promise<string> {
  const html = buildInvoiceHtml(invoice, cafeSettings, currencySymbol);
  let browser: Browser | null = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '10mm',
        right: '10mm',
        bottom: '10mm',
        left: '10mm'
      }
    });
    return Buffer.from(pdfBuffer).toString('base64');
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Generate a PDF invoice as base64 string.
 */
export async function generatePDF(invoice: InvoiceForPdf): Promise<string> {
  let currencySymbol = '₹';
  const pdfCafeId = invoice.cafe_id ?? null;

  try {
    const currencySettings = await CurrencySettings.getCurrent(pdfCafeId);

    if (currencySettings && currencySettings.currency_symbol) {
      const symbol = String(currencySettings.currency_symbol).trim();
      if (symbol && symbol.length > 0) {
        currencySymbol = symbol;
      }
    }
  } catch (error) {
    logger.error('Error fetching currency settings for PDF:', error as Error);
  }

  let cafeSettings: PdfCafeSettings = {
    cafe_name: 'Cafe',
    logo_url: null
  };
  try {
    const settings = await CafeSettings.getCurrent(pdfCafeId);
    if (settings) {
      cafeSettings = { ...settings, cafe_name: settings.cafe_name ?? 'Cafe' };
    }
  } catch (error) {
    logger.error('Error fetching cafe settings for PDF:', error as Error);
  }

  try {
    return await tryGenerateHtmlPdf(invoice, cafeSettings, currencySymbol);
  } catch (error) {
    logger.error('HTML PDF render failed, using PDFKit fallback:', error as Error);
  }

  const formatCurrency = (amount: number | string): string => {
    const num = parseFloat(String(amount || 0)).toFixed(2);
    let symbol = currencySymbol;
    if (currencySymbol === '₹') {
      symbol = 'Rs.';
    } else if (currencySymbol === '€') {
      symbol = 'EUR';
    } else if (currencySymbol === '£') {
      symbol = 'GBP';
    } else if (currencySymbol === '¥') {
      symbol = 'JPY';
    }
    return `${symbol}${num}`;
  };

  return new Promise((resolve) => {
    const doc = new PDFDocument({
      margin: 20,
      size: 'A4',
      autoFirstPage: true
    });

    doc.font('Helvetica');
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => {
      const result = Buffer.concat(chunks);
      resolve(result.toString('base64'));
    });

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = 40;
    const contentWidth = pageWidth - margin * 2;

    doc.rect(0, 0, pageWidth, 70).fill('#f4e1ba');

    try {
      const logoPath = resolveLogoPath(cafeSettings.logo_url);
      if (logoPath) {
        doc.image(logoPath, margin, 10, { width: 50, height: 50 });
      } else {
        const cafeInitial = cafeSettings.cafe_name ? cafeSettings.cafe_name.charAt(0).toUpperCase() : 'C';
        doc.circle(margin + 25, 35, 25).fill('#153059');
        doc.circle(margin + 25, 35, 25).stroke('#f4e1ba').lineWidth(2);
        doc.fontSize(12).font('Helvetica-Bold').fill('#f4e1ba').text(cafeInitial, margin + 25, 30, { align: 'center' });
      }
    } catch (error) {
      logger.error('Error adding logo to PDF:', error as Error);
      const cafeInitial = cafeSettings.cafe_name ? cafeSettings.cafe_name.charAt(0).toUpperCase() : 'C';
      doc.circle(margin + 25, 35, 25).fill('#153059');
      doc.circle(margin + 25, 35, 25).stroke('#f4e1ba').lineWidth(2);
      doc.fontSize(12).font('Helvetica-Bold').fill('#f4e1ba').text(cafeInitial, margin + 25, 30, { align: 'center' });
    }

    const cafeName = cafeSettings.cafe_name || 'Cafe';
    doc.fontSize(20).font('Helvetica-Bold').fill('#153059').text(cafeName.toUpperCase(), margin + 380, 25, { width: 200 });

    doc.fontSize(14).font('Helvetica-Bold').fill('#75826b').text('INVOICE', 0, 85, { align: 'center', width: pageWidth });

    let currentY = 110;

    doc.fontSize(11).font('Helvetica-Bold').fill('#153059').text('Invoice #:', margin, currentY);
    doc.fontSize(11).font('Helvetica').text(invoice.invoice_number || invoice.invoiceNumber || 'N/A', margin + 70, currentY);

    if (invoice.order_number) {
      doc.fontSize(9).font('Helvetica-Bold').fill('#153059').text('Order #:', margin, currentY + 15);
      doc.fontSize(9).font('Helvetica').text(invoice.order_number, margin + 70, currentY + 15);
      doc.fontSize(9).font('Helvetica').text(`Date: ${new Date(invoice.invoice_date).toLocaleDateString()}`, margin, currentY + 25);
      doc.fontSize(9).font('Helvetica').text(`Time: ${new Date(invoice.invoice_date).toLocaleTimeString()}`, margin, currentY + 35);
    } else {
      doc.fontSize(9).font('Helvetica').text(`Date: ${new Date(invoice.invoice_date).toLocaleDateString()}`, margin, currentY + 15);
      doc.fontSize(9).font('Helvetica').text(`Time: ${new Date(invoice.invoice_date).toLocaleTimeString()}`, margin, currentY + 25);
    }

    const customerY = invoice.order_number ? currentY + 10 : currentY;
    doc.fontSize(11).font('Helvetica-Bold').fill('#153059').text('Customer:', margin + 300, customerY);
    doc.fontSize(11).font('Helvetica').text(invoice.customerName || invoice.customer_name || 'Walk-in Customer', margin + 370, customerY);

    if (invoice.customerPhone || invoice.customer_phone) {
      doc.fontSize(9).font('Helvetica').text(`Phone: ${invoice.customerPhone || invoice.customer_phone}`, margin + 300, customerY + 15);
    }

    currentY += invoice.order_number ? 50 : 40;

    doc.roundedRect(margin, currentY, contentWidth, 20, 5).fill('#f4e1ba');
    doc.fontSize(10).font('Helvetica-Bold').fill('#153059');
    doc.text('Item', margin + 10, currentY + 6, { width: 200 });
    doc.text('Qty', margin + 220, currentY + 6, { width: 60, align: 'right' });
    doc.text('Price', margin + 290, currentY + 6, { width: 80, align: 'right' });
    doc.text('Total', margin + 380, currentY + 6, { width: 80, align: 'right' });

    currentY += 20;
    (invoice.items || []).forEach((item: InvoiceItem, idx: number) => {
      if (currentY > pageHeight - 120) {
        doc.addPage();
        currentY = margin + 50;
      }
      const rowColor = idx % 2 === 0 ? '#f8f8f8' : '#ffffff';
      doc.rect(margin, currentY, contentWidth, 16).fill(rowColor);
      doc.fontSize(9).font('Helvetica').fill('#153059');
      doc.text(item.name || item.item_name || 'Unknown Item', margin + 10, currentY + 4, { width: 200 });
      doc.text(String(item.quantity), margin + 220, currentY + 4, { width: 60, align: 'right' });
      doc.text(formatCurrency(item.price), margin + 290, currentY + 4, { width: 80, align: 'right' });
      doc.text(formatCurrency(item.total), margin + 380, currentY + 4, { width: 80, align: 'right' });
      currentY += 16;
    });

    currentY += 10;
    if (currentY > pageHeight - 100) {
      doc.addPage();
      currentY = margin + 50;
    }

    doc.fontSize(11).font('Helvetica-Bold').fill('#75826b');
    doc.text('Subtotal:', margin + 290, currentY, { width: 80, align: 'right' });
    doc.text(formatCurrency(invoice.subtotal), margin + 380, currentY, { width: 80, align: 'right' });
    currentY += 15;

    if (parseFloat(String(invoice.tax_amount || 0)) > 0) {
      doc.text('Tax:', margin + 290, currentY, { width: 80, align: 'right' });
      doc.text(formatCurrency(invoice.tax_amount!), margin + 380, currentY, { width: 80, align: 'right' });
      currentY += 15;
    }

    if (parseFloat(String(invoice.tip_amount || 0)) > 0) {
      doc.text('Tip:', margin + 290, currentY, { width: 80, align: 'right' });
      doc.text(formatCurrency(invoice.tip_amount!), margin + 380, currentY, { width: 80, align: 'right' });
      currentY += 15;
    }

    doc.roundedRect(margin, currentY, contentWidth, 20, 5).fill('#75826b');
    doc.fontSize(12).font('Helvetica-Bold').fill('#ffffff');
    doc.text('Total:', margin + 290, currentY + 5, { width: 80, align: 'right' });
    doc.text(formatCurrency(invoice.total_amount), margin + 380, currentY + 5, { width: 80, align: 'right' });

    currentY += 25;
    if (currentY > pageHeight - 120) {
      doc.addPage();
      currentY = margin + 50;
    }

    doc.fontSize(10).font('Helvetica-Bold').fill('#153059').text('Payment Method:', margin, currentY);
    const paymentMethod = invoice.payment_method || 'cash';
    const paymentLabels: Record<string, string> = {
      cash: 'Cash',
      card: 'Card',
      upi: 'UPI',
      online: 'Online'
    };
    doc.fontSize(10).font('Helvetica').fill('#153059').text(paymentLabels[paymentMethod] || 'Cash', margin + 120, currentY);

    const footerY = pageHeight - 60;
    doc.rect(0, footerY, pageWidth, 60).fill('#153059');

    try {
      const logoPath = resolveLogoPath(cafeSettings.logo_url);
      if (logoPath) {
        doc.image(logoPath, margin, footerY + 5, { width: 15, height: 15 });
      } else {
        doc.circle(margin + 7, footerY + 12, 7).fill('#f4e1ba');
      }
    } catch (error) {
      logger.error('Error adding footer logo to PDF:', error as Error);
      doc.circle(margin + 7, footerY + 12, 7).fill('#f4e1ba');
    }

    doc.fontSize(9).font('Helvetica-Bold').fill('#ffffff').text(`Thank you for visiting ${cafeName}!`, 0, footerY + 20, { align: 'center', width: pageWidth });

    doc.end();
  });
}
