import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { query } from '../db.js';
import { getSession, verifyCsrf } from '../auth.js';
import { randomToken, sha256 } from '../crypto.js';

const itemSchema = z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(99) });

async function getCart({ userId, guestToken }) {
  if (userId) {
    let r = await query('SELECT * FROM carts WHERE user_id=$1', [userId]);
    if (!r.rows[0]) {
      const id = randomUUID();
      await query('INSERT INTO carts(id,user_id) VALUES($1,$2)', [id, userId]);
      r = await query('SELECT * FROM carts WHERE id=$1', [id]);
    }
    return r.rows[0];
  }
  if (!guestToken) return null;
  const r = await query('SELECT * FROM carts WHERE guest_token_hash=$1', [sha256(guestToken)]);
  return r.rows[0] || null;
}

async function payload(id) {
  if (!id) return { items: [], subtotal: 0, currency: 'AUD' };
  const r = await query(
    `SELECT ci.id, ci.quantity, v.id variant_id, v.name variant_name, v.sku, v.price, v.currency,
            p.id product_id, p.slug, p.name, p.image_url, p.collection, p.family
       FROM cart_items ci
       JOIN product_variants v ON v.id = ci.product_variant_id
       JOIN products p ON p.id = v.product_id
      WHERE ci.cart_id = $1
      ORDER BY ci.created_at`,
    [id]
  );
  const items = r.rows.map(x => ({ ...x, price: Number(x.price), lineTotal: Number(x.price) * x.quantity }));
  return { items, subtotal: items.reduce((s, x) => s + x.lineTotal, 0), currency: 'AUD' };
}

function setGuest(reply, raw) {
  reply.setCookie('mistic_guest', raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30
  });
}

/**
 * Looks up how many packets one unit of this variant consumes and how many
 * packets the product currently has, so we can cap a cart line at what is
 * actually on the shelf. Returns null if the variant does not exist or is
 * inactive.
 */
async function stockCeiling(variantId) {
  const r = await query(
    `SELECT v.units_per_sale, p.stock_packets, p.name AS product_name
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
      WHERE v.id = $1 AND v.is_active = 1`,
    [variantId]
  );
  if (!r.rows[0]) return null;
  const unitsPerSale = Math.max(1, Number(r.rows[0].units_per_sale) || 1);
  const stockPackets = Number(r.rows[0].stock_packets) || 0;
  return {
    productName: r.rows[0].product_name,
    maxQuantity: Math.floor(stockPackets / unitsPerSale)
  };
}

export default async function cartRoutes(app) {
  app.get('/api/cart', async request => {
    const s = await getSession(request);
    const c = await getCart({ userId: s?.user_id, guestToken: request.cookies.mistic_guest });
    return payload(c?.id);
  });

  app.post('/api/cart/items', async (request, reply) => {
    verifyCsrf(request);
    const b = itemSchema.parse(request.body);

    const ceiling = await stockCeiling(b.variantId);
    if (!ceiling) return reply.code(404).send({ error: 'Product variant not found' });

    const s = await getSession(request);
    let c = await getCart({ userId: s?.user_id, guestToken: request.cookies.mistic_guest });
    if (!c) {
      const raw = randomToken(32);
      const id = randomUUID();
      await query('INSERT INTO carts(id,guest_token_hash) VALUES($1,$2)', [id, sha256(raw)]);
      c = (await query('SELECT * FROM carts WHERE id=$1', [id])).rows[0];
      setGuest(reply, raw);
    }

    const existing = await query('SELECT id,quantity FROM cart_items WHERE cart_id=$1 AND product_variant_id=$2', [c.id, b.variantId]);
    const currentQty = existing.rows[0]?.quantity || 0;

    if (currentQty >= ceiling.maxQuantity) {
      return reply.code(409).send({ error: `${ceiling.productName} is out of stock right now.` });
    }

    const targetQty = Math.min(99, ceiling.maxQuantity, currentQty + b.quantity);

    if (existing.rows[0]) {
      await query('UPDATE cart_items SET quantity=$1,updated_at=NOW(3) WHERE id=$2', [targetQty, existing.rows[0].id]);
    } else {
      await query('INSERT INTO cart_items(id,cart_id,product_variant_id,quantity) VALUES($1,$2,$3,$4)', [randomUUID(), c.id, b.variantId, targetQty]);
    }

    await query('UPDATE carts SET updated_at=NOW(3) WHERE id=$1', [c.id]);
    return payload(c.id);
  });

  app.patch('/api/cart/items/:id', async (request, reply) => {
    verifyCsrf(request);
    const b = z.object({ quantity: z.number().int().min(1).max(99) }).parse(request.body);

    const s = await getSession(request);
    const c = await getCart({ userId: s?.user_id, guestToken: request.cookies.mistic_guest });
    if (!c) return reply.code(404).send({ error: 'Cart not found' });

    const line = await query('SELECT product_variant_id FROM cart_items WHERE id=$1 AND cart_id=$2', [request.params.id, c.id]);
    if (!line.rows[0]) return reply.code(404).send({ error: 'Cart item not found' });

    const ceiling = await stockCeiling(line.rows[0].product_variant_id);
    const targetQty = ceiling ? Math.min(b.quantity, ceiling.maxQuantity) : b.quantity;

    if (ceiling && targetQty <= 0) {
      await query('DELETE FROM cart_items WHERE id=$1 AND cart_id=$2', [request.params.id, c.id]);
      return payload(c.id);
    }

    await query('UPDATE cart_items SET quantity=$1,updated_at=NOW(3) WHERE id=$2 AND cart_id=$3', [targetQty, request.params.id, c.id]);
    return payload(c.id);
  });

  app.delete('/api/cart/items/:id', async (request, reply) => {
    verifyCsrf(request);
    const s = await getSession(request);
    const c = await getCart({ userId: s?.user_id, guestToken: request.cookies.mistic_guest });
    if (!c) return reply.code(404).send({ error: 'Cart not found' });
    await query('DELETE FROM cart_items WHERE id=$1 AND cart_id=$2', [request.params.id, c.id]);
    return payload(c.id);
  });
}