import { query } from '../db.js';

const variantJson = `JSON_OBJECT('id',v.id,'name',v.name,'sku',v.sku,'price',v.price,'currency',v.currency,'quantityDescription',v.quantity_description,'unitsPerSale',v.units_per_sale)`;

/**
 * Turns the raw product row into the shape the storefront consumes, adding
 * stock-derived fields. Stock is a single packet count on the product; each
 * variant can only be bought in whole multiples of its unitsPerSale.
 */
function shapeProduct(row) {
  const variants = (Array.isArray(row.variants) ? row.variants : JSON.parse(row.variants || '[]')).filter(Boolean);
  const stockPackets = Number(row.stock_packets ?? 0);

  return {
    ...row,
    stockPackets,
    inStock: stockPackets > 0,
    lowStock: stockPackets > 0 && stockPackets <= Number(row.low_stock_threshold ?? 0),
    variants: variants.map(v => {
      const unitsPerSale = Number(v.unitsPerSale || 1);
      const maxQuantity = Math.floor(stockPackets / unitsPerSale);
      return { ...v, unitsPerSale, maxQuantity, inStock: maxQuantity > 0 };
    })
  };
}

const select = `SELECT p.*, COALESCE(JSON_ARRAYAGG(${variantJson}),JSON_ARRAY()) variants
                  FROM products p
                  LEFT JOIN product_variants v ON v.product_id=p.id AND v.is_active=1
                 WHERE p.is_active=1`;

export default async function productRoutes(app) {
  app.get('/api/products', async request => {
    const params = [], where = [];

    if (request.query.family) {
      params.push(request.query.family);
      where.push(`p.family=$${params.length}`);
    }
    if (request.query.collection) {
      params.push(request.query.collection);
      where.push(`p.collection=$${params.length}`);
    }
    if (request.query.q?.trim()) {
      params.push(`%${request.query.q.trim()}%`);
      where.push(`(p.name LIKE $${params.length} OR p.description LIKE $${params.length} OR p.collection LIKE $${params.length} OR p.family LIKE $${params.length})`);
    }
    if (request.query.inStock === 'true') {
      where.push('p.stock_packets > 0');
    }

    const r = await query(
      `${select}${where.length ? ' AND ' + where.join(' AND ') : ''} GROUP BY p.id ORDER BY p.collection,p.name`,
      params
    );
    return { products: r.rows.map(shapeProduct) };
  });

  app.get('/api/products/:slug', async (request, reply) => {
    const r = await query(
      `SELECT p.*, JSON_ARRAYAGG(${variantJson}) variants
         FROM products p
         LEFT JOIN product_variants v ON v.product_id=p.id AND v.is_active=1
        WHERE p.slug=$1 AND p.is_active=1
        GROUP BY p.id`,
      [request.params.slug]
    );
    if (!r.rows[0]) return reply.code(404).send({ error: 'Product not found' });
    return { product: shapeProduct(r.rows[0]) };
  });
}