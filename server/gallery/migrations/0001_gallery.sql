CREATE TABLE IF NOT EXISTS gallery_entries (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, request_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL, consent_version TEXT NOT NULL, rights_confirmed INTEGER NOT NULL, title TEXT NOT NULL, author TEXT NOT NULL,
 description TEXT NOT NULL, category TEXT NOT NULL, kind TEXT NOT NULL,
 allow_remix INTEGER NOT NULL DEFAULT 0, allow_pdf INTEGER NOT NULL DEFAULT 0,
 settings_json TEXT NOT NULL, status TEXT NOT NULL,
 safety_passed INTEGER NOT NULL DEFAULT 0, error_code TEXT, review_note TEXT NOT NULL DEFAULT '',
 width INTEGER NOT NULL DEFAULT 0, height INTEGER NOT NULL DEFAULT 0,
 source_ready INTEGER NOT NULL DEFAULT 0, photo_ready INTEGER NOT NULL DEFAULT 0,
 pdf_ready INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 approved_at INTEGER, cleaned_at INTEGER, UNIQUE(owner,request_id)
);
CREATE INDEX IF NOT EXISTS gallery_public ON gallery_entries(status,approved_at DESC,id);
CREATE INDEX IF NOT EXISTS gallery_owner ON gallery_entries(owner,created_at DESC);
CREATE TABLE IF NOT EXISTS gallery_reports (
 id TEXT PRIMARY KEY, entry_id TEXT NOT NULL, reporter TEXT NOT NULL, reason TEXT NOT NULL,
 detail TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL,
 UNIQUE(entry_id,reporter,status)
);
CREATE TABLE IF NOT EXISTS gallery_audit (
 id TEXT PRIMARY KEY, entry_id TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
 note TEXT NOT NULL, created_at INTEGER NOT NULL
);
