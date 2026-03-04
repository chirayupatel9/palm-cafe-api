import { pool } from '../config/database';
import { RowDataPacket } from 'mysql2';

export interface PromoBannerRow {
  id: number;
  cafe_id: number;
  image_url: string;
  link_url: string | null;
  priority: number;
  active: boolean;
  created_at?: Date;
}

export interface PromoBannerCreateData {
  cafe_id: number;
  image_url: string;
  link_url?: string | null;
  priority?: number;
  active?: boolean;
}

export interface PromoBannerUpdateData {
  image_url?: string;
  link_url?: string | null;
  priority?: number;
  active?: boolean;
}

class PromoBanner {
  static async getByCafeId(cafeId: number): Promise<PromoBannerRow[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT id, cafe_id, image_url, link_url, priority, active, created_at FROM promo_banners WHERE cafe_id = ? ORDER BY priority ASC, id ASC',
      [cafeId]
    );
    return (rows as RowDataPacket[]).map((r: RowDataPacket) => ({
      ...r,
      active: Boolean(r.active)
    })) as PromoBannerRow[];
  }

  static async getActiveByCafeId(cafeId: number): Promise<
    { id: number; image_url: string; link_url: string | null; priority: number; active: boolean }[]
  > {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT id, image_url, link_url, priority, active FROM promo_banners WHERE cafe_id = ? AND active = 1 ORDER BY priority ASC, id ASC',
      [cafeId]
    );
    return (rows as RowDataPacket[]).map((r: RowDataPacket) => ({
      id: r.id as number,
      image_url: r.image_url as string,
      link_url: (r.link_url as string) || null,
      priority: r.priority as number,
      active: true
    }));
  }

  static async getByIdAndCafe(id: number, cafeId: number): Promise<PromoBannerRow | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT id, cafe_id, image_url, link_url, priority, active, created_at FROM promo_banners WHERE id = ? AND cafe_id = ?',
      [id, cafeId]
    );
    if (rows.length === 0) return null;
    const r = rows[0] as RowDataPacket;
    return { ...r, active: Boolean(r.active) } as PromoBannerRow;
  }

  static async create(data: PromoBannerCreateData): Promise<PromoBannerRow> {
    const cafeId = data.cafe_id;
    const imageUrl = data.image_url;
    const linkUrl = data.link_url == null ? null : (data.link_url.trim() || null);
    const priority =
      typeof data.priority === 'number' && !Number.isNaN(data.priority) ? data.priority : 0;
    const active = data.active !== false ? 1 : 0;

    const [result] = await pool.execute<RowDataPacket[] & { insertId: number }>(
      'INSERT INTO promo_banners (cafe_id, image_url, link_url, priority, active) VALUES (?, ?, ?, ?, ?)',
      [cafeId, imageUrl, linkUrl, priority, active]
    );
    const created = await this.getByIdAndCafe(result.insertId, cafeId);
    if (!created) throw new Error('Failed to fetch created promo banner');
    return created;
  }

  static async update(
    id: number,
    cafeId: number,
    data: PromoBannerUpdateData
  ): Promise<PromoBannerRow | null> {
    const existing = await this.getByIdAndCafe(id, cafeId);
    if (!existing) return null;

    const imageUrl = data.image_url !== undefined ? data.image_url : existing.image_url;
    const linkUrl =
      data.link_url !== undefined
        ? data.link_url == null || data.link_url === ''
          ? null
          : data.link_url.trim()
        : existing.link_url;
    const priority =
      data.priority !== undefined
        ? typeof data.priority === 'number' && !Number.isNaN(data.priority)
          ? data.priority
          : existing.priority
        : existing.priority;
    const active = data.active !== undefined ? (data.active ? 1 : 0) : (existing.active ? 1 : 0);

    await pool.execute(
      'UPDATE promo_banners SET image_url = ?, link_url = ?, priority = ?, active = ? WHERE id = ? AND cafe_id = ?',
      [imageUrl, linkUrl, priority, active, id, cafeId]
    );
    return this.getByIdAndCafe(id, cafeId);
  }

  static async delete(id: number, cafeId: number): Promise<boolean> {
    const [result] = await pool.execute<RowDataPacket[] & { affectedRows: number }>(
      'DELETE FROM promo_banners WHERE id = ? AND cafe_id = ?',
      [id, cafeId]
    );
    return result.affectedRows > 0;
  }
}

export default PromoBanner;
