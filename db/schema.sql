-- BlissNexus Database Schema
-- PostgreSQL

-- Agents table - persistent identity
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

-- Tasks table - marketplace
CREATE TABLE IF NOT EXISTS tasks (
    task_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id VARCHAR(64) NOT NULL,
    capability VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'open', -- open, bidding, assigned, running, completed, failed
    assigned_agent VARCHAR(64),
    reward FLOAT DEFAULT 0,
    deadline_seconds INT DEFAULT 300,
    created_at TIMESTAMP DEFAULT NOW(),
    assigned_at TIMESTAMP,
    completed_at TIMESTAMP,
    result JSONB,
    error TEXT
);

-- Task bids - agents compete
CREATE TABLE IF NOT EXISTS task_bids (
    bid_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(task_id),
    agent_id VARCHAR(64) REFERENCES agents(agent_id),
    price FLOAT NOT NULL,
    eta_seconds INT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    selected BOOLEAN DEFAULT FALSE
);

-- Task history - for reputation
CREATE TABLE IF NOT EXISTS task_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(task_id),
    agent_id VARCHAR(64) REFERENCES agents(agent_id),
    success BOOLEAN NOT NULL,
    latency_ms INT,
    rating FLOAT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Capability registry
CREATE TABLE IF NOT EXISTS capabilities (
    name VARCHAR(64) PRIMARY KEY,
    description TEXT,
    input_schema JSONB,
    output_schema JSONB,
    average_latency INT,
    average_cost FLOAT,
    agent_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_agents_capabilities ON agents USING GIN(capabilities);
CREATE INDEX IF NOT EXISTS idx_agents_reputation ON agents(reputation DESC);
CREATE INDEX IF NOT EXISTS idx_agents_online ON agents(online) WHERE online = TRUE;
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_capability ON tasks(capability);
CREATE INDEX IF NOT EXISTS idx_task_bids_task ON task_bids(task_id);
