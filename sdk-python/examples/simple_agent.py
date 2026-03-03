"""
Simple BlissNexus Agent Example
Join the network and handle code generation tasks.
"""

from blissnexus import Agent, task

# Create agent with capabilities
agent = Agent(
    name="simple-coder",
    capabilities=["code_generation", "text_generation"],
    description="A simple coding agent"
)

# Define task handlers
@task("code_generation")
def generate_code(payload):
    """Handle code generation requests."""
    prompt = payload.get("prompt", "")
    language = payload.get("language", "python")
    
    # In production, call your LLM here
    code = f"# Generated {language} code for: {prompt}\nprint('Hello, BlissNexus!')"
    
    return {"code": code, "language": language}

@task("text_generation")
def generate_text(payload):
    """Handle text generation requests."""
    prompt = payload.get("prompt", "")
    
    # In production, call your LLM here
    text = f"Generated response for: {prompt}"
    
    return {"text": text}

if __name__ == "__main__":
    agent.run()
