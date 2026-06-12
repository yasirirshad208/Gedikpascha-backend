# Payments migrations

Apply these in numeric order via Supabase SQL editor. Idempotent (`IF NOT EXISTS`); safe to re-run.

| # | File | Purpose |
|---|---|---|
| 001 | `001_create_payment_transactions.sql` | One row per Iyzico checkout-form session (source of truth). |
| 002 | `002_create_payment_splits.sql` | Per-seller slices for commissions and payout tracking. |
| 003 | `003_create_payment_events.sql` | Idempotent webhook ingest table. |
| 004 | `004_create_sub_merchants.sql` | Marketplace sub-merchant registry (used from Phase 2). |
| 005 | `005_create_commission_rules.sql` | Layered commission configuration. |
| 006 | `006_create_payout_settings.sql` | Payout-release window configuration. |
| 007 | `007_alter_retail_orders_add_payment_columns.sql` | Wire `retail_orders` to `payment_transactions` + refund window. |
| 008 | `008_alter_retail_order_items_add_vat.sql` | KDV/VAT columns on retail order items (locked to `included`). |
| 009 | `009_seed_commission_and_payout_defaults.sql` | Seed 10% commission + T+30 payout per client decision. |

## Phase 2-6 additions

| # | File | Phase | Purpose |
|---|---|---|---|
| 010 | `010_alter_brands_add_sub_merchant.sql` | 2 | Add `sub_merchant_id` + `payout_status` to wholesale/retail brands and social profiles. |
| 011 | `011_alter_wholesale_orders_add_payment_columns.sql` | 4 | Payment columns + VAT mode on wholesale orders; `delivered_at` on retail too. |
| 012 | `012_alter_social_sales_orders_add_payment_columns.sql` | 5 | Payment columns + VAT lock (`none`) on social orders. |
| 013 | `013_create_refund_requests.sql` | 6 | Buyer-initiated refund / 14-day withdrawal requests. |
| 014 | `014_create_dispute_evidence.sql` | 6 | Seller-uploaded evidence for chargebacks. |
| 015 | `015_payment_splits_add_item_payment_transaction_id.sql` | 3/6 | Track per-item Iyzico paymentTransactionId on each split. |
| 016 | `016_create_dispute_evidence_storage_bucket.sql` | 6 | Supabase storage bucket for evidence uploads. |
