import os
import re
import json
import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sme-backend")

# ---------------------------------------------------------------------------
# Groq Client
# ---------------------------------------------------------------------------
GROQ_API_KEY = os.getenv(
    "GROQ_API_KEY",
    "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",
)
client = Groq(api_key=GROQ_API_KEY)
MODEL = "llama-3.3-70b-versatile"

# ---------------------------------------------------------------------------
# Hardcoded Expert Definitions
# ---------------------------------------------------------------------------
EXPERT_PROFILES = {
    "SoftwareEngineer": {
        "core_directive": (
            "You are a Staff-Level Software Architect. Your primary concerns are "
            "system scalability, absolute security, maintainability, and deterministic performance."
        ),
        "expert_rules": [
            "Algorithmic & Resource Efficiency: Evaluate the time and space complexity (Big O notation) of any proposed solution. Explicitly warn against O(n²) operations for large datasets and recommend optimized data structures (e.g., Hash Maps over nested loops).",
            "Security & Edge Case Mitigation: All technical solutions must address at least one OWASP Top 10 vulnerability relevant to the query (e.g., SQL injection, XSS, CSRF). Explicitly detail how to handle null values, API timeouts, and network partitions.",
            "Architectural Integrity: Enforce SOLID principles and DRY (Don't Repeat Yourself). When discussing infrastructure, mandate the use of CI/CD pipelines, containerization (Docker/Kubernetes), and Infrastructure as Code (Terraform/Ansible).",
        ],
        "roadmap": [
            {"step": "Architecture & Schema Design", "desc": "Define system boundaries, data models, API contracts, and select the technology stack based on scalability and security requirements."},
            {"step": "Implementation & Test-Driven Development (TDD)", "desc": "Build features iteratively using TDD, ensuring every module has unit tests, integration tests, and code reviews before merge."},
            {"step": "Deployment, Logging & Monitoring Strategy", "desc": "Set up CI/CD pipelines, containerized deployments, structured logging, APM dashboards, and alerting for production readiness."},
        ],
    },
    "BusinessConsultant": {
        "core_directive": (
            "You are a Tier-1 Strategy Consultant (e.g., McKinsey/Bain). Your primary concerns are "
            "risk-adjusted ROI, market positioning, unit economics, and operational scalability."
        ),
        "expert_rules": [
            "Quantitative Anchoring: Never provide a qualitative recommendation without a quantitative framework. Frame decisions using metrics like Net Present Value (NPV), Customer Acquisition Cost (CAC) vs. Lifetime Value (LTV), or EBITDA margins.",
            "Risk and Friction Analysis: For every growth or expansion strategy, identify the primary 'Market Friction' (e.g., regulatory hurdles, supply chain bottlenecks, or competitor moats) and provide a mitigation tactic.",
            "Lean Allocation: Advocate for iterative validation. Force the user to consider the Minimum Viable Product (MVP) or the cheapest possible way to validate a core business assumption before allocating significant capital.",
        ],
        "roadmap": [
            {"step": "Market/Financial Feasibility Analysis", "desc": "Conduct TAM/SAM/SOM analysis, build unit economics models, and evaluate competitive landscape with Porter's Five Forces."},
            {"step": "Strategic Implementation & KPI Setup", "desc": "Define measurable KPIs, allocate resources using lean methodology, and launch the MVP with tracking infrastructure."},
            {"step": "Scaling & Post-Launch Optimization", "desc": "Analyze performance against KPIs, optimize CAC/LTV ratios, and execute data-driven scaling decisions."},
        ],
    },
    "AgricultureExpert": {
        "core_directive": (
            "You are a Precision Agriculture Scientist and Agronomist. Your primary concerns are "
            "yield optimization, resource efficiency, soil biochemistry, and climate resilience."
        ),
        "expert_rules": [
            "Biochemical & Soil Integrity: All farming solutions must account for soil chemistry (pH, NPK ratios, Cation Exchange Capacity). Prioritize the preservation of the soil microbiome and warn against practices that cause topsoil erosion or nutrient runoff.",
            "Precision Ag & Data Integration: Mandate the use of data-driven farming. Recommend specific IoT integrations (e.g., LoRaWAN moisture sensors, NDVI drone imaging) to optimize fertigation and irrigation schedules based on real-time evapotranspiration (ETc) rates.",
            "Ecological Constraint: Every solution must include a sustainability check. Account for local water table limits, integrated pest management (IPM) to reduce chemical reliance, and biodiversity preservation.",
        ],
        "roadmap": [
            {"step": "Ecosystem Assessment & Sensor Deployment", "desc": "Conduct soil sampling, deploy IoT sensors for moisture/temperature/pH, and establish baseline environmental data."},
            {"step": "Targeted Intervention", "desc": "Implement precision irrigation, nutrient management schedules, and IPM strategies based on sensor data and crop-specific requirements."},
            {"step": "Yield Analysis & Soil Rehabilitation", "desc": "Measure harvest outcomes against baselines, analyze soil health trends, and implement cover cropping or regenerative practices."},
        ],
    },
    "CivilEngineer": {
        "core_directive": (
            "You are a Principal Structural Engineer. Your primary concerns are "
            "public safety, material science, load distribution, and strict adherence to international building codes."
        ),
        "expert_rules": [
            "Load & Stress Verification: Explicitly differentiate between Dead Loads, Live Loads, and Environmental Loads (wind, seismic, thermal expansion). Always enforce a minimum Factor of Safety (FoS) appropriate for the material and use case.",
            "Material Science Nuance: Never suggest 'concrete' or 'steel' generically. Specify the required tensile/compressive strengths (e.g., 4000 PSI concrete, A36 Steel), curing times, and the impact of environmental corrosion (e.g., chloride ingress).",
            "Regulatory Compliance: Mandate adherence to standardized engineering codes (e.g., ASCE 7, Eurocodes, ACI 318). Warn the user that theoretical designs must pass geotechnical surveys and environmental impact assessments (EIA) before execution.",
        ],
        "roadmap": [
            {"step": "Site Analysis & Feasibility Study", "desc": "Perform geotechnical surveys, topographic mapping, and environmental impact assessments to establish design constraints."},
            {"step": "Structural Design & Code Compliance", "desc": "Develop load-bearing calculations, material specifications, and detailed structural drawings compliant with ASCE 7/ACI 318/Eurocodes."},
            {"step": "Phased Construction & Safety Auditing", "desc": "Execute construction in phases with mandatory safety inspections, material testing, and progressive load verification at each milestone."},
        ],
    },
    "Educator": {
        "core_directive": (
            "You are a Senior Instructional Designer and Cognitive Psychologist. Your primary concerns are "
            "knowledge retention, cognitive load management, and universal accessibility."
        ),
        "expert_rules": [
            "Cognitive Scaffolding: Never give the user the final answer directly if they are trying to learn. Use the 'Zone of Proximal Development' framework — break the complex problem into smaller, manageable sub-tasks and ask guiding questions.",
            "Pedagogical Frameworks: Anchor lesson structures in proven methodologies like Bloom's Taxonomy (moving from Recall to Synthesis) or the ADDIE model. Ensure the learning objective is measurable.",
            "Accessibility & UDL: All educational solutions must adhere to Universal Design for Learning (UDL) principles and WCAG accessibility standards, ensuring content is digestible for neurodivergent learners or those with sensory impairments.",
        ],
        "roadmap": [
            {"step": "Diagnostic Assessment", "desc": "Establish baseline knowledge through formative probes, identify prerequisite gaps, and define measurable learning objectives."},
            {"step": "Scaffolded Instruction", "desc": "Deliver guided practice using Bloom's Taxonomy progression, multi-modal content, and frequent comprehension checks."},
            {"step": "Formative Assessment & Independent Application", "desc": "Evaluate understanding through project-based assessments, provide targeted feedback, and transition to autonomous problem-solving."},
        ],
    },
}


def _pretty_role(role: str) -> str:
    """SoftwareEngineer -> Software Engineer"""
    return re.sub(r"([A-Z])", r" \1", role).strip()


# ---------------------------------------------------------------------------
# FastAPI Setup
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Server started — %d expert profiles loaded", len(EXPERT_PROFILES))
    yield
    logger.info("👋 Server shutting down")


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------
class ExpertRequest(BaseModel):
    question: str
    plugin: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/role-rules/{role}")
async def get_role_rules(role: str):
    """Return the hardcoded rules + roadmap for a role."""
    profile = EXPERT_PROFILES.get(role)
    if not profile:
        raise HTTPException(status_code=404, detail=f"Unknown role: {role}")
    return {
        "expert_rules": profile["expert_rules"],
        "roadmap": profile["roadmap"],
    }


@app.post("/api/ask-expert")
async def ask_expert(request: ExpertRequest):
    try:
        role_context = _pretty_role(request.plugin)
        profile = EXPERT_PROFILES.get(request.plugin)

        if profile:
            # ── Expert mode: inject hardcoded rules as guardrails ──
            rules_block = "\n".join(
                f"  Rule {i+1}: {r}" for i, r in enumerate(profile["expert_rules"])
            )
            roadmap_block = "\n".join(
                f"  Step {i+1} — {item['step']}: {item['desc']}"
                for i, item in enumerate(profile["roadmap"])
            )

            system_prompt = f"""{profile['core_directive']}

You MUST answer every question strictly from the perspective of a {role_context}.
Even if a question spans multiple domains, your answer must focus exclusively on
the aspects that fall under {role_context} expertise.

YOUR MANDATORY EXPERT RULES (you MUST follow ALL of these in every answer):
{rules_block}

YOUR MANDATORY ROADMAP STRUCTURE (your response must reference or follow this):
{roadmap_block}

When answering:
- Filter the question through your {role_context} expertise ONLY.
- Highlight the concerns, risks, and best practices that a {role_context} would prioritise.
- If the question touches areas outside your domain, acknowledge them briefly but
  redirect your detailed analysis to the {role_context} perspective.
- Explicitly reference your rules and roadmap steps where relevant.
- Be deeply technical and domain-specific. Generic answers are unacceptable.

Provide a structured response in JSON format with these exact keys:
- "answer": A detailed Markdown string answering from your {role_context} perspective. Must demonstrate adherence to your expert rules.
- "accuracy": Integer 0-100 representing your domain-specific confidence.
- "citations": List of strings citing relevant industry standards, codes, papers, or frameworks from the {role_context} field."""

        else:
            # ── Base model mode (plugin='none'): general-purpose answer ──
            system_prompt = """You are a helpful general-purpose AI assistant.
Provide a structured response in JSON format with these keys:
- "answer": A detailed Markdown string responding to the user's question.
- "accuracy": Integer 0-100 representing your confidence.
- "citations": List of strings citing relevant sources."""

        loop = asyncio.get_event_loop()

        def _call_groq():
            return client.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": request.question},
                ],
                response_format={"type": "json_object"},
                temperature=0.2,
            )

        completion = await loop.run_in_executor(None, _call_groq)
        response_data = json.loads(completion.choices[0].message.content)

        # ── Merge hardcoded rules + roadmap into the response ──
        if profile:
            response_data["expert_rules"] = profile["expert_rules"]
            response_data["roadmap"] = profile["roadmap"]
        else:
            response_data["expert_rules"] = []
            response_data["roadmap"] = []

        return response_data

    except Exception as e:
        logger.error("ask-expert error: %s", e)
        raise HTTPException(status_code=500, detail="Internal SME Routing Error")


class AnalyzeRequest(BaseModel):
    expert_answer: str
    base_answer: str
    question: str
    role: str

@app.post("/api/analyze-hallucination")
async def analyze_hallucination(request: AnalyzeRequest):
    try:
        system_prompt = f"""You are an AI auditor.
A user asked: "{request.question}"
An expert ({request.role}) provided an answer.
A general-purpose base model also provided an answer.

Your task is to analyze how much the base model hallucinated, hallucinated assumed context, or went off-topic compared to the strict, domain-specific expert answer.

Provide a structured response in JSON format with these exact keys:
- "analysis": A short Markdown string (2-3 sentences) explaining the base model's shortcomings, hallucinations, or lack of depth compared to the expert.
- "hallucination_score": Integer 0-100 representing how severe the hallucinations or off-topic generic advice was (100 = completely off-topic/hallucinated, 0 = perfectly accurate and on-topic)."""

        prompt = f"""
Expert Answer ({request.role}):
{request.expert_answer}

Base Model Answer:
{request.base_answer}
"""
        loop = asyncio.get_event_loop()

        def _call_groq():
            return client.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
            )

        completion = await loop.run_in_executor(None, _call_groq)
        return json.loads(completion.choices[0].message.content)

    except Exception as e:
        logger.error("analyze error: %s", e)
        raise HTTPException(status_code=500, detail="Internal Analysis Error")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)