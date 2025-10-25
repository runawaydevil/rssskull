; RSS-Bridge Configuration for RSS Skull Bot
; This file configures RSS-Bridge for Instagram and other social media feeds

; === GLOBAL SETTINGS ===
[system]
enable_debug_mode = false
whitelist_mode = false        ; false = all bridges active (or set true and whitelist only what you want)
allow_public_override = true  ; allows passing cache_timeout via query when enabled

; === CACHE SETTINGS ===
[caches]
; FileCache is default; keep cache directory writable

; === INSTAGRAM BRIDGE ===
[InstagramBridge]
session_id = ${INSTAGRAM_SESSION_ID}
ds_user_id = ${INSTAGRAM_DS_USER_ID}
; Increase cache_timeout to reduce 429 errors (default is 3600s = 1h)
cache_timeout = 3600

; === GENERAL NOTES ===
; 
; Important notes:
; 
; Instagram: Cookies are required (session_id, ds_user_id) for stable feed; 
;             higher cache_timeout helps avoid 429 errors.
; 
; Enable all bridges: Set whitelist_mode = false (or true and whitelist only what you want to expose).
; 
; Cache per bridge: Time can vary from 5 minutes to 24 hours depending on the bridge;
;                   you can also allow override via query.
; 
; After editing, restart the container to apply changes.

