/**
 * Unit tests for pdfService.generatePDF (mocked dependencies).
 */
jest.mock('../../../models/currencySettings', () => ({
  getCurrent: jest.fn().mockResolvedValue({ currency_symbol: '₹' })
}));
jest.mock('../../../models/cafeSettings', () => ({
  getCurrent: jest.fn().mockResolvedValue({ cafe_name: 'Test Cafe', logo_url: null })
}));
jest.mock('../../../config/logger', () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }));

const { generatePDF } = require('../../../services/pdfService');

describe('pdfService generatePDF', () => {
  it('returns a base64 string for valid invoice', async () => {
    const invoice = {
      invoice_number: 'INV-001',
      items: [{ name: 'Coffee', quantity: 2, price: 4.5 }],
      subtotal: 9,
      tax_amount: 0.9,
      total_amount: 9.9,
      cafe_id: 1
    };
    const result = await generatePDF(invoice);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(Buffer.from(result, 'base64').length).toBeGreaterThan(0);
  });

  it('handles missing cafe_id', async () => {
    const invoice = {
      invoice_number: 'INV-002',
      items: [],
      subtotal: 0,
      tax_amount: 0,
      total_amount: 0
    };
    const result = await generatePDF(invoice);
    expect(typeof result).toBe('string');
  });
});
