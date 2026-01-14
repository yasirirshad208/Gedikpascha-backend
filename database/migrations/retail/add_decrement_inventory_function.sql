-- Function to decrement retail product inventory
CREATE OR REPLACE FUNCTION decrement_retail_inventory(
  p_product_id UUID,
  p_combination_key VARCHAR,
  p_quantity INTEGER
)
RETURNS VOID AS $$
BEGIN
  UPDATE retail_product_inventory
  SET quantity = quantity - p_quantity
  WHERE product_id = p_product_id
    AND combination_key = p_combination_key
    AND quantity >= p_quantity;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient inventory for product % with combination %', p_product_id, p_combination_key;
  END IF;
END;
$$ LANGUAGE plpgsql;
