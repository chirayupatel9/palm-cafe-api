const PDFDocument = require('pdfkit');
const CurrencySettings = require('../models/currencySettings');
const CafeSettings = require('../models/cafeSettings');
const logger = require('../config/logger');

/**
 * Generate a PDF invoice and return it as a base64-encoded string.
 * @param {Object} invoice - Invoice data (e.g., invoice_number, items, subtotal, tax_amount, total_amount, cafe_id, customer details, payment_method).
 * @returns {string} Base64-encoded PDF representing the rendered invoice.
 */
async function generatePDF(invoice) {
  let currencySymbol = '₹';
  const pdfCafeId = invoice.cafe_id || null;
  try {
    const currencySettings = await CurrencySettings.getCurrent(pdfCafeId);

    if (currencySettings && currencySettings.currency_symbol) {
      const symbol = String(currencySettings.currency_symbol).trim();
      if (symbol && symbol.length > 0) {
        currencySymbol = symbol;
      }
    }
  } catch (error) {
    logger.error('Error fetching currency settings for PDF:', error);
  }

  let cafeSettings = {
    cafe_name: 'Cafe',
    logo_url: null
  };
  try {
    const settings = await CafeSettings.getCurrent(pdfCafeId);
    if (settings) {
      cafeSettings = settings;
      if (!cafeSettings.cafe_name) {
        cafeSettings.cafe_name = 'Cafe';
      }
    }
  } catch (error) {
    logger.error('Error fetching cafe settings for PDF:', error);
  }

  const formatCurrency = (amount) => {
    const num = parseFloat(amount || 0).toFixed(2);
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
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {
      const result = Buffer.concat(chunks);
      resolve(result.toString('base64'));
    });

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = 40;
    const contentWidth = pageWidth - (margin * 2);

    doc.rect(0, 0, pageWidth, 70).fill('#f4e1ba');

    try {
      const logoUrl = cafeSettings.logo_url;
      if (logoUrl && typeof logoUrl === 'string') {
        const logoPath = logoUrl.startsWith('/') ?
          `./public${logoUrl}` :
          `./public/images/${logoUrl}`;
        doc.image(logoPath, margin, 10, { width: 50, height: 50 });
      } else {
        throw new Error('No logo URL');
      }
    } catch (error) {
      if (error.message !== 'No logo URL') {
        logger.error('Error adding logo to PDF:', error);
      }
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
    (invoice.items || []).forEach((item, idx) => {
      if (currentY > pageHeight - 120) {
        doc.addPage();
        currentY = margin + 50;
      }
      const rowColor = idx % 2 === 0 ? '#f8f8f8' : '#ffffff';
      doc.rect(margin, currentY, contentWidth, 16).fill(rowColor);
      doc.fontSize(9).font('Helvetica').fill('#153059');
      doc.text(item.name || item.item_name || 'Unknown Item', margin + 10, currentY + 4, { width: 200 });
      doc.text(item.quantity.toString(), margin + 220, currentY + 4, { width: 60, align: 'right' });
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

    if (parseFloat(invoice.tax_amount || 0) > 0) {
      doc.text('Tax:', margin + 290, currentY, { width: 80, align: 'right' });
      doc.text(formatCurrency(invoice.tax_amount), margin + 380, currentY, { width: 80, align: 'right' });
      currentY += 15;
    }

    if (parseFloat(invoice.tip_amount || 0) > 0) {
      doc.text('Tip:', margin + 290, currentY, { width: 80, align: 'right' });
      doc.text(formatCurrency(invoice.tip_amount), margin + 380, currentY, { width: 80, align: 'right' });
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
    const paymentLabels = {
      'cash': 'Cash',
      'card': 'Card',
      'upi': 'UPI',
      'online': 'Online'
    };
    doc.fontSize(10).font('Helvetica').fill('#153059').text(paymentLabels[paymentMethod] || 'Cash', margin + 120, currentY);

    const footerY = pageHeight - 60;
    doc.rect(0, footerY, pageWidth, 60).fill('#153059');

    try {
      const logoPath = cafeSettings.logo_url.startsWith('/') ?
        `./public${cafeSettings.logo_url}` :
        `./public/images/${cafeSettings.logo_url}`;
      doc.image(logoPath, margin, footerY + 5, { width: 15, height: 15 });
    } catch (error) {
      doc.circle(margin + 7, footerY + 12, 7).fill('#f4e1ba');
    }

    doc.fontSize(9).font('Helvetica-Bold').fill('#ffffff').text(`Thank you for visiting ${cafeName}!`, 0, footerY + 20, { align: 'center', width: pageWidth });

    doc.end();
  });
}

module.exports = { generatePDF };
