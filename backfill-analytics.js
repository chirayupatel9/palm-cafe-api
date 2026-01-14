require('dotenv').config();
const { pool } = require('./config/database');
const CafeDailyMetrics = require('./models/cafeDailyMetrics');
const logger = require('./config/logger');

/**
 * Backfill Analytics Data
 * 
 * This script recomputes and populates cafe_daily_metrics
 * for all existing orders and customers.
 */
async function backfillAnalytics() {
  try {
    logger.info('Starting analytics backfill...');

    // Check if cafe_daily_metrics table exists
    const [tableExists] = await pool.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'cafe_daily_metrics'
    `);

    if (tableExists.length === 0) {
      logger.error('cafe_daily_metrics table does not exist. Please run migration first.');
      process.exit(1);
    }

    // Check if cafes table exists
    const [cafesTable] = await pool.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'cafes'
    `);

    if (cafesTable.length === 0) {
      logger.warn('Cafes table does not exist. Skipping backfill.');
      process.exit(0);
    }

    // Get all cafes
    const [cafes] = await pool.execute('SELECT id FROM cafes');
    logger.info(`Found ${cafes.length} cafes to process`);

    // Check if orders table has cafe_id
    const [ordersColumns] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'orders' 
      AND COLUMN_NAME = 'cafe_id'
    `);

    if (ordersColumns.length === 0) {
      logger.warn('Orders table does not have cafe_id column. Skipping backfill.');
      process.exit(0);
    }

    // Get date range from orders
    const [dateRange] = await pool.execute(`
      SELECT 
        MIN(DATE(created_at)) as min_date,
        MAX(DATE(created_at)) as max_date
      FROM orders
      WHERE cafe_id IS NOT NULL
    `);

    if (!dateRange[0].min_date) {
      logger.info('No orders found. Nothing to backfill.');
      process.exit(0);
    }

    const minDate = new Date(dateRange[0].min_date);
    const maxDate = new Date(dateRange[0].max_date);
    logger.info(`Date range: ${minDate.toISOString().split('T')[0]} to ${maxDate.toISOString().split('T')[0]}`);

    // Process each cafe
    for (const cafe of cafes) {
      const cafeId = cafe.id;
      logger.info(`Processing cafe ${cafeId}...`);

      // Get all unique dates for this cafe
      const [dates] = await pool.execute(
        `SELECT DISTINCT DATE(created_at) as date 
         FROM orders 
         WHERE cafe_id = ? 
         ORDER BY date ASC`,
        [cafeId]
      );

      logger.info(`  Found ${dates.length} unique dates`);

      // Recompute metrics for each date
      let processed = 0;
      for (const row of dates) {
        const date = row.date.toISOString().split('T')[0];
        try {
          await CafeDailyMetrics.recompute(cafeId, date);
          processed++;
          
          if (processed % 10 === 0) {
            logger.info(`  Processed ${processed}/${dates.length} dates...`);
          }
        } catch (error) {
          logger.error(`  Error recomputing metrics for ${date}:`, error.message);
        }
      }

      logger.info(`  Completed cafe ${cafeId}: ${processed}/${dates.length} dates processed`);
    }

    logger.info('Analytics backfill completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during analytics backfill:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  backfillAnalytics();
}

module.exports = backfillAnalytics;
