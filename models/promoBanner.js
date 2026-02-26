const { pool } = require('../config/database');

/**
 * PromoBanner model: multiple promotional banners per cafe for customer menu.
 */
class PromoBanner {
  /**
   * Get all banners for a cafe, ordered by priority ASC then id.
   * @param {number} cafeId
   * @returns {Promise<Array<{ id, cafe_id, image_url, link_url, priority, active, created_at }>>}
   */
  static async getByCafeId(cafeId) {
    const [rows] = await pool.execute(
      'SELECT id, cafe_id, image_url, link_url, priority, active, created_at FROM promo_banners WHERE cafe_id = ? ORDER BY priority ASC, id ASC',
      [cafeId]
    );
    return rows.map((r) => ({
      ...r,
      active: Boolean(r.active)
    }));
  }

  /**
   * Get active banners only for public display (e.g. branding endpoint).
   * @param {number} cafeId
   * @returns {Promise<Array<{ id, image_url, link_url, priority, active }>>}
   */
  static async getActiveByCafeId(cafeId) {
    const [rows] = await pool.execute(
      'SELECT id, image_url, link_url, priority, active FROM promo_banners WHERE cafe_id = ? AND active = 1 ORDER BY priority ASC, id ASC',
      [cafeId]
    );
    return rows.map((r) => ({
      id: r.id,
      image_url: r.image_url,
      link_url: r.link_url || null,
      priority: r.priority,
      active: true
    }));
  }

  /**
   * Get one banner by id and cafe (for ownership check).
   * @param {number} id
   * @param {number} cafeId
   * @returns {Promise<object|null>}
   */
  static async getByIdAndCafe(id, cafeId) {
    const [rows] = await pool.execute(
      'SELECT id, cafe_id, image_url, link_url, priority, active, created_at FROM promo_banners WHERE id = ? AND cafe_id = ?',
      [id, cafeId]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return { ...r, active: Boolean(r.active) };
  }

  /**
   * Create a banner.
   * @param {Object} data - { cafe_id, image_url, link_url?, priority?, active? }
   * @returns {Promise<{ id, cafe_id, image_url, link_url, priority, active, created_at }>}
   */
  static async create(data) {
    const cafeId = data.cafe_id;
    const imageUrl = data.image_url;
    const linkUrl = data.link_url == null ? null : (data.link_url.trim() || null);
    const priority = typeof data.priority === 'number' && !Number.isNaN(data.priority) ? data.priority : 0;
    const active = data.active !== false ? 1 : 0;

    const [result] = await pool.execute(
      'INSERT INTO promo_banners (cafe_id, image_url, link_url, priority, active) VALUES (?, ?, ?, ?, ?)',
      [cafeId, imageUrl, linkUrl, priority, active]
    );
    const created = await this.getByIdAndCafe(result.insertId, cafeId);
    return created;
  }

  /**
   * Update a banner. Only provided fields are updated.
   * @param {number} id
   * @param {number} cafeId
   * @param {Object} data - { image_url?, link_url?, priority?, active? }
   * @returns {Promise<object|null>}
   */
  static async update(id, cafeId, data) {
    const existing = await this.getByIdAndCafe(id, cafeId);
    if (!existing) return null;

    const imageUrl = data.image_url !== undefined ? data.image_url : existing.image_url;
    const linkUrl = data.link_url !== undefined ? (data.link_url == null || data.link_url === '' ? null : data.link_url.trim()) : existing.link_url;
    const priority = data.priority !== undefined ? (typeof data.priority === 'number' && !Number.isNaN(data.priority) ? data.priority : existing.priority) : existing.priority;
    const active = data.active !== undefined ? (data.active ? 1 : 0) : (existing.active ? 1 : 0);

    await pool.execute(
      'UPDATE promo_banners SET image_url = ?, link_url = ?, priority = ?, active = ? WHERE id = ? AND cafe_id = ?',
      [imageUrl, linkUrl, priority, active, id, cafeId]
    );
    return this.getByIdAndCafe(id, cafeId);
  }

  /**
   * Delete a banner.
   * @param {number} id
   * @param {number} cafeId
   * @returns {Promise<boolean>}
   */
  static async delete(id, cafeId) {
    const [result] = await pool.execute('DELETE FROM promo_banners WHERE id = ? AND cafe_id = ?', [id, cafeId]);
    return result.affectedRows > 0;
  }
}

module.exports = PromoBanner;
