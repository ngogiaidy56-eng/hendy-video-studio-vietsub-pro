-- =============================================================================
-- HENDY STUDIO VIETSUB PRO & TELEGRAM CYBERTECH 2026
-- PostgreSQL 16 Initialization & Schema Migration Script
-- Integrated with Ktor Backend Server (Port 8080) & Node.js Gateway (Port 3000)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. TELEGRAM BOT USERS TABLE
CREATE TABLE IF NOT EXISTS telegram_users (
    chat_id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(128),
    first_name VARCHAR(128) NOT NULL DEFAULT 'Khách',
    vip_level INTEGER NOT NULL DEFAULT 0,
    balance BIGINT NOT NULL DEFAULT 50000,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    won_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
    history JSONB NOT NULL DEFAULT '["Khởi tạo tài khoản (+50,000 VNĐ)"]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. TELEGRAM BOT TEMPORARY INPUT STATES (userStates)
CREATE TABLE IF NOT EXISTS telegram_user_states (
    chat_id VARCHAR(64) PRIMARY KEY REFERENCES telegram_users(chat_id) ON DELETE CASCADE,
    action VARCHAR(64) NOT NULL,
    brand VARCHAR(32),
    platform VARCHAR(32),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. LINKED ACCOUNTS BY ALLIANCE / BRAND (SC88, C168, CM88, F8BET, ABCVIP, KJC_CU)
CREATE TABLE IF NOT EXISTS telegram_linked_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id VARCHAR(64) NOT NULL REFERENCES telegram_users(chat_id) ON DELETE CASCADE,
    brand VARCHAR(32) NOT NULL,
    account_identifier VARCHAR(255) NOT NULL,
    verified BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_linked_accounts_chat_brand
    ON telegram_linked_accounts(chat_id, brand);

-- 4. ACCOUNT KHO (RR88, MM88, GG88, U888, J88, 88CLB, ABC8, XX8, ABCVIP, KJC_CU)
CREATE TABLE IF NOT EXISTS telegram_account_kho (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id VARCHAR(64) NOT NULL REFERENCES telegram_users(chat_id) ON DELETE CASCADE,
    brand VARCHAR(32) NOT NULL,
    acc_credentials TEXT NOT NULL,
    is_checked BOOLEAN NOT NULL DEFAULT TRUE,
    checked_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_kho_chat_brand
    ON telegram_account_kho(chat_id, brand);

-- 5. WALLET & SOCIAL SERVICE TRANSACTIONS (Buff Live TikTok/FB, Deposit, GiftCode)
CREATE TABLE IF NOT EXISTS telegram_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id VARCHAR(64) NOT NULL REFERENCES telegram_users(chat_id) ON DELETE CASCADE,
    tx_type VARCHAR(32) NOT NULL, -- 'INITIAL', 'DEPOSIT', 'GIFTCODE', 'SOCIAL_BUFF', 'CODE_PURCHASE'
    amount BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,
    platform VARCHAR(32),
    target_link TEXT,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_chat_created
    ON telegram_transactions(chat_id, created_at DESC);

-- 6. VIETSUB VIDEO PIPELINE JOBS (Ktor Orchestrator & FFmpeg Hardsub Queue)
CREATE TABLE IF NOT EXISTS vietsub_pipeline_jobs (
    job_id VARCHAR(64) PRIMARY KEY,
    chat_id VARCHAR(64) REFERENCES telegram_users(chat_id) ON DELETE SET NULL,
    video_title VARCHAR(255) NOT NULL DEFAULT 'Untitled Video',
    source_url TEXT,
    input_type VARCHAR(32) NOT NULL DEFAULT 'stream',
    source_lang VARCHAR(16) NOT NULL DEFAULT 'auto',
    target_lang VARCHAR(16) NOT NULL DEFAULT 'vi',
    status VARCHAR(32) NOT NULL DEFAULT 'NOMINAL',
    verdict VARCHAR(32) NOT NULL DEFAULT 'RELEASE_UNLOCKED',
    cues_count INTEGER NOT NULL DEFAULT 0,
    cues_data JSONB NOT NULL DEFAULT '[]'::jsonb,
    subtitle_style JSONB NOT NULL DEFAULT '{}'::jsonb,
    recovery_path TEXT,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- 7. KTOR CLIENT ADMIN TRIGGER AUDIT LOGS (/api/bot-trigger)
CREATE TABLE IF NOT EXISTS ktor_bot_triggers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id VARCHAR(64) NOT NULL,
    user_name VARCHAR(128) NOT NULL DEFAULT 'Hendy_Admin',
    action VARCHAR(64) NOT NULL DEFAULT 'ADMIN_COMPOSE_COMMAND',
    command VARCHAR(255) NOT NULL,
    client_sdk VARCHAR(64) NOT NULL DEFAULT 'ComposeWeb-TMA-KtorClient',
    response_status INTEGER NOT NULL DEFAULT 200,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- SEED INITIAL ADMIN ACCOUNT (ADMIN_ID = '6138197737')
-- =============================================================================
INSERT INTO telegram_users (chat_id, username, first_name, vip_level, balance, is_admin, history)
VALUES (
    '6138197737',
    'hendy_admin',
    'Hendy Admin',
    0,
    50000,
    TRUE,
    '["Khởi tạo tài khoản (+50,000 VNĐ)", "Xác thực quyền Quản trị viên (ADMIN_ID: 6138197737)"]'::jsonb
)
ON CONFLICT (chat_id) DO NOTHING;

INSERT INTO telegram_transactions (chat_id, tx_type, amount, balance_after, description)
VALUES (
    '6138197737',
    'INITIAL',
    50000,
    50000,
    'Khởi tạo tài khoản (+50,000 VNĐ)'
);

INSERT INTO ktor_bot_triggers (chat_id, user_name, action, command, client_sdk, response_status)
VALUES (
    '6138197737',
    'Hendy_Admin',
    'ADMIN_COMPOSE_COMMAND',
    'INIT_POSTGRES_KTOR_BRIDGE',
    'ComposeWeb-TMA-KtorClient',
    200
);
