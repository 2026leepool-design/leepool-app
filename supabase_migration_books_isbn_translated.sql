-- Add isbn and translated_titles columns to books table
-- Run this in Supabase SQL Editor (Supabase Dashboard > SQL Editor)

ALTER TABLE books ADD COLUMN isbn TEXT;
ALTER TABLE books ADD COLUMN translated_titles JSONB;

-- Optional: Add comments for documentation
-- COMMENT ON COLUMN books.isbn IS 'ISBN number of the book';
-- COMMENT ON COLUMN books.translated_titles IS 'Array of titles in other languages, e.g. [{"lang":"tr","title":"Dune","isOriginal":true},{"lang":"es","title":"Duna"}]';
