-- Enable helpful extensions (idempotent)
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create indexes only if the table/columns exist (works for Product or Listing)
DO $$
BEGIN
  -- If you use a Product model with `name` and `description`
  IF to_regclass('"Product"') IS NOT NULL THEN
    -- name trigram index
    EXECUTE 'CREATE INDEX IF NOT EXISTS product_name_trgm_idx ON "Product" USING gin ("name" gin_trgm_ops)';
    -- description trigram index
    EXECUTE 'CREATE INDEX IF NOT EXISTS product_desc_trgm_idx ON "Product" USING gin ("description" gin_trgm_ops)';
  END IF;

  -- If you use a Listing model with `title` and `description`
  IF to_regclass('"Listing"') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS listing_title_trgm_idx ON "Listing" USING gin (title gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS listing_desc_trgm_idx ON "Listing" USING gin (description gin_trgm_ops)';
  END IF;
END
$$;

-- (Optional) tiny synonyms dictionary
CREATE TABLE IF NOT EXISTS "Synonym" (
  id serial PRIMARY KEY,
  term text NOT NULL UNIQUE,
  expands_to text[] NOT NULL
);

INSERT INTO "Synonym"(term, expands_to) VALUES
('kabambe', ARRAY['feature phone','button phone']),
('matwana', ARRAY['car','vehicle'])
ON CONFLICT (term) DO NOTHING;
