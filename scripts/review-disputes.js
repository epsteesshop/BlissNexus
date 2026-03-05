#!/usr/bin/env node
/**
 * Dispute Review Script
 * Run by Diddy to review disputed tasks and make recommendations
 */

const API = process.env.API_URL || 'https://api.blissnexus.ai';

async function reviewDisputes() {
  console.log('🔍 Fetching disputed tasks...\n');
  
  const res = await fetch(`${API}/api/v2/disputes`);
  const { disputes, count } = await res.json();
  
  if (count === 0) {
    console.log('✅ No disputes to review!');
    return;
  }
  
  console.log(`Found ${count} dispute(s):\n`);
  
  for (const dispute of disputes) {
    console.log('═'.repeat(60));
    console.log(`📋 Task: ${dispute.id}`);
    console.log(`   Title: ${dispute.title}`);
    console.log(`   Description: ${dispute.description}`);
    console.log(`   Budget: ${dispute.maxBudget} SOL`);
    console.log('');
    console.log(`👤 Requester: ${dispute.disputeInfo.requester?.slice(0, 12)}...`);
    console.log(`🤖 Agent: ${dispute.disputeInfo.agent}`);
    console.log('');
    console.log(`📝 Submitted Result:`);
    console.log(`   ${dispute.result || '(no result submitted)'}`);
    console.log('');
    console.log(`❌ Dispute Reason: ${dispute.disputeReason || '(not specified)'}`);
    console.log('');
    
    if (dispute.chatHistory?.length > 0) {
      console.log(`💬 Chat History (${dispute.chatHistory.length} messages):`);
      for (const msg of dispute.chatHistory.slice(-10)) {
        const sender = msg.sender_name || msg.sender_id?.slice(0, 8);
        console.log(`   [${sender}]: ${msg.message}`);
      }
    }
    
    console.log('');
    
    if (dispute.pendingDecision) {
      console.log(`⚖️ PENDING DECISION:`);
      console.log(`   Decision: ${dispute.pendingDecision.decision.toUpperCase()}`);
      console.log(`   Reasoning: ${dispute.pendingDecision.reasoning}`);
      console.log(`   Approved: ${dispute.pendingDecision.approved ? 'YES' : 'NO - awaiting approval'}`);
    }
    
    console.log('═'.repeat(60));
    console.log('');
  }
}

reviewDisputes().catch(console.error);
