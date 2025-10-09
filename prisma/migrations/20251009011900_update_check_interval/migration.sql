-- Update existing chat settings to use the new default check interval (120 seconds)
UPDATE ChatSettings 
SET checkInterval = 120 
WHERE checkInterval = 300;