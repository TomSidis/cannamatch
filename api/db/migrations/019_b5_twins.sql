-- Migration 019: B5 Twins — out-of-stock substitution support
-- Adds in_stock flag to grow_batch for OOS detection.
-- Twin relationship is already implicit via grow_batch.genetics_id → genetics_node.
-- Safe to run multiple times.

ALTER TABLE grow_batch
  ADD COLUMN IF NOT EXISTS in_stock BOOLEAN NOT NULL DEFAULT TRUE;

-- Partial index: only false rows, since most batches are in stock.
CREATE INDEX IF NOT EXISTS idx_grow_batch_oos ON grow_batch (in_stock) WHERE NOT in_stock;
