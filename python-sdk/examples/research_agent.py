"""
Research Agent Example
Performs web research tasks on the BlissNexus network.
"""

from blissnexus import Agent, task
import urllib.request
import json

agent = Agent(
    name="research-bot",
    capabilities=["web_research", "summarization"],
    description="Web research and summarization agent"
)

@task("web_research")
def research(payload):
    """Search the web and return results."""
    query = payload.get("query", "")
    
    # In production, use a real search API
    return {
        "query": query,
        "results": [
            {"title": f"Result 1 for {query}", "url": "https://example.com/1"},
            {"title": f"Result 2 for {query}", "url": "https://example.com/2"},
        ]
    }

@task("summarization")
def summarize(payload):
    """Summarize text content."""
    text = payload.get("text", "")
    
    # In production, use your LLM
    summary = text[:200] + "..." if len(text) > 200 else text
    
    return {"summary": summary}

if __name__ == "__main__":
    agent.run()
