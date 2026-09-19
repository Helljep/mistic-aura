-- Stock control for Mistic Aura.
--
-- MODEL: stock is held as ONE number per product, counted in PACKETS
-- (the smallest sellable unit). Each variant declares how many packets it
-- consumes per unit sold, so a single manual entry covers every variant:
--
--   Packet  -> units_per_sale = 1   (sell 1 packet -> stock - 1)
--   Box     -> units_per_sale = 12  (sell 1 box    -> stock - 12)
--
-- Run this ONCE against your Hostinger MySQL before deploying the code.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS stock_packets INT NOT NULL DEFAULT 0 AFTER is_best_seller,
  ADD COLUMN IF NOT EXISTS low_stock_threshold INT NOT NULL DEFAULT 24 AFTER stock_packets,
  ADD COLUMN IF NOT EXISTS stock_updated_at DATETIME(3) NULL AFTER low_stock_threshold;

ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS units_per_sale INT NOT NULL DEFAULT 1 AFTER quantity_description;

-- Seed the multipliers for the two existing variant names.
UPDATE product_variants SET units_per_sale = 12 WHERE name = 'Box';
UPDATE product_variants SET units_per_sale = 1  WHERE name = 'Packet';

-- Never allow a negative multiplier or negative stock.
ALTER TABLE products
  ADD CONSTRAINT chk_products_stock_non_negative CHECK (stock_packets >= 0);

ALTER TABLE product_variants
  ADD CONSTRAINT chk_variant_units_positive CHECK (units_per_sale >= 1);

-- Audit trail of every manual stock change and every sale-driven decrement.
CREATE TABLE IF NOT EXISTS stock_movements (
  id CHAR(36) NOT NULL PRIMARY KEY,
  product_id CHAR(36) NOT NULL,
  change_packets INT NOT NULL,
  balance_after INT NOT NULL,
  reason ENUM('manual_set','manual_adjust','sale','cancellation','correction') NOT NULL,
  order_id CHAR(36) NULL,
  admin_user_id CHAR(36) NULL,
  note VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_stock_movements_product (product_id),
  INDEX idx_stock_movements_created (created_at),
  CONSTRAINT fk_stock_movements_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_stock_movements_admin FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;