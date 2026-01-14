-- Function to auto-create/update retail products when wholesale order is delivered
CREATE OR REPLACE FUNCTION auto_create_retail_products_from_order()
RETURNS TRIGGER AS $$
DECLARE
  v_retail_brand_id UUID;
  v_order_item RECORD;
  v_wholesale_product RECORD;
  v_existing_retail_product RECORD;
  v_retail_product_id UUID;
  v_unit_price DECIMAL(10,2);
  v_total_quantity INTEGER;
  v_variation RECORD;
  v_image RECORD;
  v_combination_key TEXT;
BEGIN
  -- Only proceed if status changed to 'delivered' and sell_as_retailer is true
  IF NEW.status = 'delivered' AND NEW.sell_as_retailer = true AND 
     (OLD.status IS NULL OR OLD.status != 'delivered') THEN
    
    -- Get the retail brand for this user
    SELECT id INTO v_retail_brand_id
    FROM retail_brands
    WHERE user_id = NEW.user_id AND status = 'approved'
    LIMIT 1;
    
    -- If user doesn't have an approved retail brand, skip
    IF v_retail_brand_id IS NULL THEN
      RETURN NEW;
    END IF;
    
    -- Process each order item
    FOR v_order_item IN 
      SELECT * FROM wholesale_order_items WHERE order_id = NEW.id
    LOOP
      -- Get wholesale product details
      SELECT * INTO v_wholesale_product
      FROM wholesale_products
      WHERE id = v_order_item.product_id;
      
      -- Skip if wholesale product not found
      IF v_wholesale_product.id IS NULL THEN
        CONTINUE;
      END IF;
      
      -- Calculate unit price (pack_price / pack_quantity)
      v_unit_price := v_order_item.pack_price / NULLIF(v_order_item.pack_quantity, 0);
      
      -- Calculate total quantity purchased (quantity * pack_quantity)
      v_total_quantity := v_order_item.quantity * v_order_item.pack_quantity;
      
      -- Check if retail product already exists for this wholesale product
      SELECT * INTO v_existing_retail_product
      FROM retail_products
      WHERE retail_brand_id = v_retail_brand_id
        AND source_wholesale_product_id = v_wholesale_product.id
        AND deleted_at IS NULL
      LIMIT 1;
      
      IF v_existing_retail_product.id IS NOT NULL THEN
        -- Product exists - ADD STOCK
        v_retail_product_id := v_existing_retail_product.id;
        
        -- Update total stock quantity
        UPDATE retail_products
        SET stock_quantity = stock_quantity + v_total_quantity,
            updated_at = NOW()
        WHERE id = v_retail_product_id;
        
      ELSE
        -- Product doesn't exist - CREATE NEW
        INSERT INTO retail_products (
          retail_brand_id,
          name,
          slug,
          sku,
          description,
          short_description,
          cost_price,
          retail_price,
          stock_quantity,
          source_wholesale_product_id,
          source_wholesale_slug,
          is_auto_imported,
          status,
          meta_title,
          meta_description
        ) VALUES (
          v_retail_brand_id,
          v_wholesale_product.name,
          v_wholesale_product.slug || '-' || substring(md5(random()::text) from 1 for 6), -- Make unique slug
          'RTL-' || substring(md5(random()::text) from 1 for 8), -- Generate unique SKU
          v_wholesale_product.description,
          v_wholesale_product.short_description,
          v_unit_price, -- cost_price (what they paid)
          NULL, -- retail_price (user must set)
          v_total_quantity,
          v_wholesale_product.id,
          v_wholesale_product.slug,
          true,
          'draft', -- Requires user to set retail_price and activate
          v_wholesale_product.meta_title,
          v_wholesale_product.meta_description
        ) RETURNING id INTO v_retail_product_id;
        
        -- Copy images
        FOR v_image IN 
          SELECT * FROM wholesale_product_images 
          WHERE product_id = v_wholesale_product.id
          ORDER BY display_order
        LOOP
          INSERT INTO retail_product_images (
            product_id,
            image_url,
            display_order,
            alt_text,
            is_primary
          ) VALUES (
            v_retail_product_id,
            v_image.image_url,
            v_image.display_order,
            v_image.alt_text,
            v_image.is_primary
          );
        END LOOP;
        
        -- Copy product-level variations
        FOR v_variation IN 
          SELECT * FROM wholesale_product_variations 
          WHERE product_id = v_wholesale_product.id
          ORDER BY display_order
        LOOP
          INSERT INTO retail_product_variations (
            product_id,
            variation_type,
            name,
            value,
            display_order
          ) VALUES (
            v_retail_product_id,
            v_variation.variation_type,
            v_variation.name,
            v_variation.value,
            v_variation.display_order
          );
        END LOOP;
      END IF;
      
      -- Add inventory tracking (for variation combinations if any)
      IF v_order_item.selected_variations IS NOT NULL AND 
         jsonb_typeof(v_order_item.selected_variations) = 'object' THEN
        
        -- Build combination key from selected variations
        SELECT string_agg(value::text, '-' ORDER BY key)
        INTO v_combination_key
        FROM jsonb_each_text(v_order_item.selected_variations);
        
        -- Insert or update inventory for this combination
        INSERT INTO retail_product_inventory (
          product_id,
          combination_key,
          stock_quantity,
          source_wholesale_order_item_id,
          added_at
        ) VALUES (
          v_retail_product_id,
          COALESCE(v_combination_key, 'default'),
          v_total_quantity,
          v_order_item.id,
          NOW()
        )
        ON CONFLICT (product_id, combination_key, source_wholesale_order_item_id)
        DO UPDATE SET
          stock_quantity = retail_product_inventory.stock_quantity + v_total_quantity,
          updated_at = NOW();
      ELSE
        -- No variations, use default combination
        INSERT INTO retail_product_inventory (
          product_id,
          combination_key,
          stock_quantity,
          source_wholesale_order_item_id,
          added_at
        ) VALUES (
          v_retail_product_id,
          'default',
          v_total_quantity,
          v_order_item.id,
          NOW()
        )
        ON CONFLICT (product_id, combination_key, source_wholesale_order_item_id)
        DO UPDATE SET
          stock_quantity = retail_product_inventory.stock_quantity + v_total_quantity,
          updated_at = NOW();
      END IF;
      
    END LOOP;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on wholesale_orders
DROP TRIGGER IF EXISTS trigger_auto_create_retail_products ON wholesale_orders;

CREATE TRIGGER trigger_auto_create_retail_products
  AFTER UPDATE ON wholesale_orders
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_retail_products_from_order();

-- Add comment
COMMENT ON FUNCTION auto_create_retail_products_from_order() IS 'Automatically creates or updates retail products when wholesale order status becomes delivered and sell_as_retailer is true';
