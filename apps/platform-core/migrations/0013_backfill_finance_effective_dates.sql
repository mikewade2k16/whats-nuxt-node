SET search_path TO platform_core, public;

UPDATE finance_lines fl
SET effective_date = to_char(COALESCE(fs.updated_at, fs.created_at, now()) AT TIME ZONE 'UTC', 'YYYY-MM-DD')
FROM finance_sheets fs
WHERE fs.id = fl.sheet_id
  AND fl.effective = true
  AND btrim(COALESCE(fl.effective_date, '')) = '';
