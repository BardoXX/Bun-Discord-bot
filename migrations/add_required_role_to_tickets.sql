-- Add required_role_id to ticket configurations
ALTER TABLE ticket_configs ADD COLUMN required_role_id TEXT;

-- Update existing configurations (optional, set to NULL by default)
-- You can set a default role ID here if needed
-- UPDATE ticket_configs SET required_role_id = 'YOUR_DEFAULT_ROLE_ID' WHERE required_role_id IS NULL;
