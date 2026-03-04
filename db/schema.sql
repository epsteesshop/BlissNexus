-- BlissNexus Database Schema
-- PostgreSQL

-- Agents table
CREATE TABLE IF NOT EXISTS agents (
    agent_id VARCHAR(64) PRIMARY KEY,
    owner_id VARCHAR(64),
    public_key TEXT NOT NULL,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    capabilities TEXT[] DEFAULT '{}',
    reputation FLOAT DEFAULT 0.5,
    tasks_completed INT DEFAULT 0,
    tasks_failed INT DEFAULT 0,
    average_latency INT DEFAULT 0,
    average_rating FLOAT DEFAULT 0,
    total_earnings FLOAT DEFAULT 0,
    endpoint TEXT,
    last_seen TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    online BOOLEAN DEFAULT FALSE
);

-- Marketplace Tasks
CREATE TABLE IF NOT EXISTS marketplace_tasks (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(256) NOT NULL,
    description TEXT,
    max_budget FLOAT DEFAULT 1.0,
    deadline TIMESTAMP,
    capabilities TEXT[] DEFAULT '{}',
    requester VARCHAR(64) NOT NULL,
    state VARCHAR(32) DEFAULT 'open',
    assigned_agent VARCHAR(64),
    assigned_bid JSONB,
    result TEXT,
    escrow_tx VARCHAR(128),
    escrow_pda VARCHAR(64),
    escrow_signature VARCHAR(128),
    created_at BIGINT,
    updated_at BIGINT
);

-- Marketplace Bids
CREATE TABLE IF NOT EXISTS marketplace_bids (
    id VARCHAR(64) PRIMARY KEY,
    task_id VARCHAR(64) REFERENCES marketplace_tasks(id) ON DELETE CASCADE,
    agent_id VARCHAR(64) NOT NULL,
    agent_name VARCHAR(128),
    price FLOAT NOT NULL,
    time_estimate VARCHAR(64),
    message TEXT,
    wallet VARCHAR(64),
    status VARCHAR(32) DEFAULT 'pending',
    created_at BIGINT
);

-- Agent stats for reputation
CREATE TABLE IF NOT EXISTS agent_stats (
    agent_id VARCHAR(64) PRIMARY KEY,
    completed INT DEFAULT 0,
    rating FLOAT DEFAULT 0,
    total_earned FLOAT DEFAULT 0
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agents_capabilities ON agents USING GIN(capabilities);
CREATE INDEX IF NOT EXISTS idx_agents_online ON agents(online) WHERE online = TRUE;
CREATE INDEX IF NOT EXISTS idx_marketplace_tasks_state ON marketplace_tasks(state);
CREATE INDEX IF NOT EXISTS idx_marketplace_tasks_requester ON marketplace_tasks(requester);
CREATE INDEX IF NOT EXISTS idx_marketplace_bids_task ON marketplace_bids(task_id);

-- Add attachments column if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'marketplace_tasks' AND column_name = 'attachments') THEN
    ALTER TABLE marketplace_tasks ADD COLUMN attachments JSONB DEFAULT '[]';
  END IF;
END $$;

-- Add result_attachments column if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'marketplace_tasks' AND column_name = 'result_attachments') THEN
    ALTER TABLE marketplace_tasks ADD COLUMN result_attachments JSONB DEFAULT '[]';
  END IF;
END $$;
