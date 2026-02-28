from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq
import json
import os

app = FastAPI()

# Enable CORS for the Vite frontend as seen in index.html
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Groq Client
# Ensure you have your API key in environment variables
client = Groq(api_key="YOUR_GROQ_API_KEY")

class ExpertRequest(BaseModel):
    question: str
    plugin: str

@app.get("/api/health")
async def health():
    # Matches the checkHealth call in api.js
    return {"status": "ok"}

@app.post("/api/ask-expert")
async def ask_expert(request: ExpertRequest):
    try:
        # System prompt instructions to Groq for dynamic SME routing
        system_instructions = f"""
        You are an elite SME specialized in {request.plugin}. 
        Provide a response in JSON format containing:
        1. 'answer': A markdown response to the question.
        2. 'expert_rules': A list of 3 industry-standard rules for this role.
        3. 'roadmap': A list of 3 steps (with 'step' and 'desc') to solve or master this topic.
        4. 'accuracy': An integer percentage representing the confidence score.
        5. 'citations': A list of sources or logic bases.
        """

        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_instructions},
                {"role": "user", "content": request.question}
            ],
            response_format={"type": "json_object"}
        )

        return json.loads(completion.choices[0].message.content)
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail="Inference Failure")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)