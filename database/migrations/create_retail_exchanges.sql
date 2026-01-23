-- Create Retail Product Exchange System Tables
-- Retailers can exchange products with other retailers
-- Products are locked during delivery and released when delivered

-- Main exchanges table
CREATE TABLE IF NOT EXISTS retail_product_exchanges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exchange_code VARCHAR(20) UNIQUE NOT NULL,
    initiator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Exchange status
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    -- pending: waiting for receiver approval
    -- approved: receiver accepted, preparing for shipment
    -- in_transit: products are being delivered
    -- delivered: both parties confirmed delivery
    -- completed: exchange finalized, products released
    -- cancelled: exchange cancelled
    -- rejected: receiver rejected the exchange
    
    -- Delivery tracking
    initiator_delivery_status VARCHAR(50) DEFAULT 'pending',
    receiver_delivery_status VARCHAR(50) DEFAULT 'pending',
    -- pending, shipped, in_transit, delivered, failed
    
    initiator_tracking_number VARCHAR(100),
    receiver_tracking_number VARCHAR(100),
    
    -- Price difference (if any) - receiver pays if positive, initiator pays if negative
    price_difference DECIMAL(10, 2) DEFAULT 0,
    payment_method VARCHAR(50) DEFAULT 'cod', -- cash_on_delivery, online, bank_transfer
    payment_status VARCHAR(50) DEFAULT 'pending', -- pending, paid, failed
    
    -- Addresses
    initiator_address_id UUID,
    receiver_address_id UUID,
    
    -- Notes and communication
    initiator_notes TEXT,
    receiver_notes TEXT,
    cancellation_reason TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP WITH TIME ZONE,
    shipped_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT different_users CHECK (initiator_id != receiver_id),
    CONSTRAINT valid_price_difference CHECK (price_difference >= -999999.99 AND price_difference <= 999999.99)
);

-- Exchange items table - products being exchanged
CREATE TABLE IF NOT EXISTS retail_exchange_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exchange_id UUID NOT NULL REFERENCES retail_product_exchanges(id) ON DELETE CASCADE,
    
    -- Which side of the exchange
    side VARCHAR(20) NOT NULL, -- 'initiator' or 'receiver'
    
    -- Product details
    product_id UUID NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    product_image_url TEXT,
    sku VARCHAR(100),
    
    -- Quantity and pricing
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    
    -- Variation details (if applicable)
    variation_details JSONB,
    
    -- Inventory lock
    is_locked BOOLEAN DEFAULT false,
    locked_at TIMESTAMP WITH TIME ZONE,
    released_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT positive_quantity CHECK (quantity > 0),
    CONSTRAINT positive_prices CHECK (unit_price >= 0 AND total_price >= 0),
    CONSTRAINT valid_side CHECK (side IN ('initiator', 'receiver'))
);

-- Shipping addresses for exchanges
CREATE TABLE IF NOT EXISTS retail_exchange_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Address details
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    country VARCHAR(100) NOT NULL DEFAULT 'India',
    
    -- Address type and status
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Exchange timeline/activity log
CREATE TABLE IF NOT EXISTS retail_exchange_timeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exchange_id UUID NOT NULL REFERENCES retail_product_exchanges(id) ON DELETE CASCADE,
    
    -- Activity details
    action VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_name VARCHAR(255),
    
    -- Additional data
    metadata JSONB,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Inventory holds/locks during exchanges
CREATE TABLE IF NOT EXISTS retail_inventory_holds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exchange_item_id UUID NOT NULL REFERENCES retail_exchange_items(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    
    -- Hold details
    quantity_held INTEGER NOT NULL,
    hold_reason VARCHAR(100) DEFAULT 'exchange',
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    released_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT positive_hold_quantity CHECK (quantity_held > 0)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_exchanges_initiator ON retail_product_exchanges(initiator_id);
CREATE INDEX IF NOT EXISTS idx_exchanges_receiver ON retail_product_exchanges(receiver_id);
CREATE INDEX IF NOT EXISTS idx_exchanges_status ON retail_product_exchanges(status);
CREATE INDEX IF NOT EXISTS idx_exchanges_code ON retail_product_exchanges(exchange_code);
CREATE INDEX IF NOT EXISTS idx_exchanges_created ON retail_product_exchanges(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_exchange_items_exchange ON retail_exchange_items(exchange_id);
CREATE INDEX IF NOT EXISTS idx_exchange_items_product ON retail_exchange_items(product_id);
CREATE INDEX IF NOT EXISTS idx_exchange_items_locked ON retail_exchange_items(is_locked) WHERE is_locked = true;

CREATE INDEX IF NOT EXISTS idx_addresses_user ON retail_exchange_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_addresses_default ON retail_exchange_addresses(user_id, is_default) WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_timeline_exchange ON retail_exchange_timeline(exchange_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_holds_user_product ON retail_inventory_holds(user_id, product_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_inventory_holds_exchange_item ON retail_inventory_holds(exchange_item_id);

-- Function to generate unique exchange code
CREATE OR REPLACE FUNCTION generate_exchange_code()
RETURNS VARCHAR(20) AS $$
DECLARE
    new_code VARCHAR(20);
    code_exists BOOLEAN;
BEGIN
    LOOP
        -- Generate code like EXC-20260123-ABCD
        new_code := 'EXC-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || 
                    UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 4));
        
        -- Check if code already exists
        SELECT EXISTS(SELECT 1 FROM retail_product_exchanges WHERE exchange_code = new_code) INTO code_exists;
        
        EXIT WHEN NOT code_exists;
    END LOOP;
    
    RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate exchange code
CREATE OR REPLACE FUNCTION set_exchange_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.exchange_code IS NULL OR NEW.exchange_code = '' THEN
        NEW.exchange_code := generate_exchange_code();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_exchange_code
    BEFORE INSERT ON retail_product_exchanges
    FOR EACH ROW
    EXECUTE FUNCTION set_exchange_code();

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_exchange_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_exchange_timestamp
    BEFORE UPDATE ON retail_product_exchanges
    FOR EACH ROW
    EXECUTE FUNCTION update_exchange_timestamp();

CREATE TRIGGER trigger_update_address_timestamp
    BEFORE UPDATE ON retail_exchange_addresses
    FOR EACH ROW
    EXECUTE FUNCTION update_exchange_timestamp();

-- Comments
COMMENT ON TABLE retail_product_exchanges IS 'Main table for retailer-to-retailer product exchanges';
COMMENT ON TABLE retail_exchange_items IS 'Products being exchanged in each exchange transaction';
COMMENT ON TABLE retail_exchange_addresses IS 'Shipping addresses for exchanges';
COMMENT ON TABLE retail_exchange_timeline IS 'Activity log for exchange transactions';
COMMENT ON TABLE retail_inventory_holds IS 'Temporary inventory locks during exchanges';

COMMENT ON COLUMN retail_product_exchanges.price_difference IS 'Price difference to be paid via COD - positive means receiver pays, negative means initiator pays';
COMMENT ON COLUMN retail_exchange_items.is_locked IS 'Whether the inventory is currently locked for this exchange';
COMMENT ON COLUMN retail_inventory_holds.is_active IS 'Whether the hold is currently active - released when exchange completes or cancels';
