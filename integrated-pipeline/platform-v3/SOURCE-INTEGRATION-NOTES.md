# Source integration notes

Selected source modules from `hendy-video-studio-new-pro` were moved into this isolated profile. They are not automatically deployed by root Render. The main root Express stack has the actively integrated image OCR and public-video metadata APIs; the optional Ktor profile includes additional Telegram Mini App authentication, feature-toggle commands, event streaming, Gemini OCR/translation and FFmpeg wrappers.

Some source functionality was intentionally not imported: legacy Telegram bot implementation containing a literal token, Scrapy arbitrary-URL extraction agent, large nested CapCut source archive and UI components hardcoding credentials. Those are excluded to avoid copying secrets, creating SSRF exposure, or duplicating unrelated/licensing-sensitive binary source.
