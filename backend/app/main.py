import os
import re
import json
import asyncio
import logging
from contextlib import asynccontextmanager
import io
import pypdf
import docx
from fastapi import FastAPI, HTTPException, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq
import openai
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
load_dotenv(env_path)
print(f"LOADING ENV FROM: {env_path}")
print(f"SUPABASE_URL is: {os.getenv('SUPABASE_URL')}")

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sme-backend")

# ---------------------------------------------------------------------------
# Groq Client
# ---------------------------------------------------------------------------
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None
MODEL = "llama-3.3-70b-versatile"

# ---------------------------------------------------------------------------
# OpenAI Client
# ---------------------------------------------------------------------------
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
openai_client = openai.OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None
OPENAI_MODEL = "gpt-4o-mini"

# ---------------------------------------------------------------------------
# API-as-a-Service Client
# ---------------------------------------------------------------------------
BYTEME_API_KEY = os.getenv("BYTEME_API_KEY", "sk-byteme-beta")

# ---------------------------------------------------------------------------
# Supabase Client
# ---------------------------------------------------------------------------
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        from supabase import create_client, Client
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("Supabase client initialized successfully.")
    except Exception as e:
        logger.error(f"Failed to initialize Supabase: {e}")

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
    provider: str = "groq"

class CustomRole(BaseModel):
    role_name: str
    core_directive: str
    expert_rules: list[str]
    roadmap: list[dict]
    knowledge_base: str | None = None

class GenerateRulesRequest(BaseModel):
    role_name: str
    knowledge_base: str | None = None
    provider: str = "groq"

class ChatCompletionRequest(BaseModel):
    model: str
    messages: list[dict]
    temperature: float = 0.7


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/role-rules/{role}")
async def get_role_rules(role: str):
    """Return the hardcoded rules + roadmap for a role, checking Supabase if missing."""
    profile = EXPERT_PROFILES.get(role)
    
    if not profile and supabase:
        try:
            res = supabase.table("custom_roles").select("*").eq("role_name", role).execute()
            if res.data and len(res.data) > 0:
                profile = res.data[0]
        except Exception as e:
            logger.error(f"Error fetching {role} from Supabase: {e}")
            
    if not profile:
        raise HTTPException(status_code=404, detail=f"Unknown role: {role}")
        
    return {
        "expert_rules": profile["expert_rules"],
        "roadmap": profile["roadmap"],
    }

@app.get("/api/custom-roles")
async def get_custom_roles():
    if not supabase:
        return {"roles": []}
    try:
        res = supabase.table("custom_roles").select("*").execute()
        return {"roles": res.data}
    except Exception as e:
        logger.error(f"Failed to fetch roles: {e}")
        return {"roles": []}

@app.post("/api/custom-roles")
async def create_custom_role(role: CustomRole):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    try:
        data = {
            "role_name": role.role_name,
            "core_directive": role.core_directive,
            "expert_rules": role.expert_rules,
            "roadmap": role.roadmap,
            "knowledge_base": role.knowledge_base
        }
        res = supabase.table("custom_roles").upsert(data).execute()
        return {"status": "success", "data": res.data}
    except Exception as e:
        logger.error(f"Failed to save role: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/extract-text")
async def extract_text(file: UploadFile = File(...)):
    try:
        content = await file.read()
        text = ""
        filename = file.filename.lower()
        if filename.endswith(".txt"):
            text = content.decode("utf-8", errors="replace")
        elif filename.endswith(".pdf"):
            pdf = pypdf.PdfReader(io.BytesIO(content))
            text = "\n".join(page.extract_text() for page in pdf.pages if page.extract_text())
        elif filename.endswith(".docx"):
            doc = docx.Document(io.BytesIO(content))
            text = "\n".join(para.text for para in doc.paragraphs)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format")
            
        return {"text": text.strip()}
    except Exception as e:
        logger.error(f"Text extraction failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to extract text from file")

@app.post("/api/generate-rules")
async def generate_rules(request: GenerateRulesRequest, http_req: Request):
    kb_injection = f'\nAdditionally, strictly enforce these rules and insights from the user-provided knowledge base:\n"""{request.knowledge_base}"""\n' if request.knowledge_base else ''
    
    system_prompt = f"""You are an expert AI system designer.
A user wants to create a new AI persona for the role: "{request.role_name}".
{kb_injection}
Please generate the following structured JSON configuration for this persona:
1. "core_directive": A succinct 2-sentence directive outlining their primary concerns and approach.
2. "expert_rules": An array of exactly 3 strict rules this expert must follow when answering questions.
3. "roadmap": An array of exactly 3 step objects, each with "step" (title) and "desc" (description), outlining how this expert approaches a problem.

Return ONLY the JSON."""

    groq_key = http_req.headers.get("x-groq-key") or os.getenv("GROQ_API_KEY")
    openai_key = http_req.headers.get("x-openai-key") or os.getenv("OPENAI_API_KEY")
    local_groq = Groq(api_key=groq_key) if groq_key else client
    local_openai = OpenAI(api_key=openai_key) if openai_key else openai_client

    loop = asyncio.get_event_loop()
    def _call_ai():
        if request.provider == "openai":
            try:
                return local_openai.chat.completions.create(
                    model=OPENAI_MODEL,
                    messages=[{"role": "user", "content": system_prompt}],
                    response_format={"type": "json_object"},
                    temperature=0.7,
                )
            except Exception as e:
                logger.warning(f"OpenAI failed ({e}), gracefully degrading to Groq.")
                # Fallback to Groq
                return local_groq.chat.completions.create(
                    model=MODEL,
                    messages=[{"role": "user", "content": system_prompt}],
                    response_format={"type": "json_object"},
                    temperature=0.7,
                )
        else:
            return local_groq.chat.completions.create(
                model=MODEL,
                messages=[{"role": "user", "content": system_prompt}],
                response_format={"type": "json_object"},
                temperature=0.7,
            )
    
    try:
        completion = await loop.run_in_executor(None, _call_ai)
        return json.loads(completion.choices[0].message.content)
    except Exception as e:
        logger.error("generate rules error: %s", e)
        raise HTTPException(status_code=500, detail="Failed to generate rules")


@app.post("/api/ask-expert")
async def ask_expert(request: ExpertRequest, http_req: Request):
    try:
        expert_role = request.plugin
        profile = EXPERT_PROFILES.get(expert_role)

        if not profile and supabase:
            try:
                res = supabase.table("custom_roles").select("*").eq("role_name", expert_role).execute()
                if res.data and len(res.data) > 0:
                    profile = res.data[0]
            except Exception as e:
                logger.error(f"Error fetching {expert_role} from Supabase for query: {e}")

        if profile:
            # ── Expert mode: inject hardcoded rules as guardrails ──
            role_context = _pretty_role(expert_role)
            rules_block = "\n".join(
                f"  Rule {i+1}: {r}" for i, r in enumerate(profile["expert_rules"])
            )
            
            if profile.get("knowledge_base"):
                rules_block += f"\n\nADDITIONAL STRICT KNOWLEDGE BASE RULES TO ENFORCE:\n{profile['knowledge_base']}"

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
- Be deeply technical and domain-specific. Generic answers are unacceptable.

Provide a structured response in JSON format with these exact keys:
- "answer": A detailed Markdown string answering from your {role_context} perspective. Must demonstrate adherence to your expert rules.
- "accuracy": Integer 0-100 representing your domain-specific confidence.
- "citations": List of strings citing relevant industry standards, codes, papers, or frameworks from the {role_context} field.

FORMATTING REQUIREMENT: You MUST use a hard newline (return carriage) after every single Rule or Step. Do not combine them into a single paragraph. Render them as distinct bullet points or numbered lists."""

        else:
            # ── Base model mode (plugin='none'): general-purpose answer ──
            system_prompt = """You are a helpful general-purpose AI assistant.
Provide a structured response in JSON format with these keys:
- "answer": A detailed Markdown string responding to the user's question.
- "accuracy": Integer 0-100 representing your confidence.
- "citations": List of strings citing relevant sources."""

        groq_key = http_req.headers.get("x-groq-key") or os.getenv("GROQ_API_KEY")
        openai_key = http_req.headers.get("x-openai-key") or os.getenv("OPENAI_API_KEY")

        # Validate that we have a key for the requested provider
        if request.provider == "groq" and not groq_key:
            raise HTTPException(status_code=401, detail="No Groq API key provided. Please add your key in the Developer API panel.")
        if request.provider == "openai" and not openai_key:
            raise HTTPException(status_code=401, detail="No OpenAI API key provided. Please add your key in the Developer API panel.")
        # For base model (plugin='none') we always use Groq
        if not groq_key and not openai_key:
            raise HTTPException(status_code=401, detail="No API key provided. Please add your Groq or OpenAI key in the Developer API panel.")

        local_groq = Groq(api_key=groq_key) if groq_key else client
        local_openai = openai.OpenAI(api_key=openai_key) if openai_key else openai_client

        def _call_ai():
            if request.provider == "openai":
                try:
                    res = local_openai.chat.completions.create(
                        model=OPENAI_MODEL,
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": request.question},
                        ],
                        response_format={"type": "json_object"},
                        temperature=0.2,
                    )
                    return res, OPENAI_MODEL
                except Exception as e:
                    logger.warning(f"OpenAI ask_expert failed ({e}), falling back to Groq.")
                    res = local_groq.chat.completions.create(
                        model=MODEL,
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": request.question},
                        ],
                        response_format={"type": "json_object"},
                        temperature=0.2,
                    )
                    return res, MODEL
            else:
                res = local_groq.chat.completions.create(
                    model=MODEL,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": request.question},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.2,
                )
                return res, MODEL

        completion, actual_model_used = await asyncio.to_thread(_call_ai)
        response_data = json.loads(completion.choices[0].message.content)

        # -- Inject the model metadata --
        response_data["generated_by_model"] = actual_model_used
        response_data["provider"] = request.provider

        # ── Merge hardcoded rules + roadmap into the response ──
        if profile:
            response_data["expert_rules"] = profile["expert_rules"]
            response_data["roadmap"] = profile["roadmap"]
        else:
            response_data["expert_rules"] = []
            response_data["roadmap"] = []

        return response_data

    except HTTPException:
        raise
    except Exception as e:
        err_str = str(e).lower()
        logger.error("ask-expert error: %s", e)
        if "authentication" in err_str or "api key" in err_str or "invalid_api_key" in err_str or "401" in err_str:
            raise HTTPException(status_code=401, detail="Invalid API key. Please check and re-enter your Groq or OpenAI key in the Developer API panel.")
        raise HTTPException(status_code=500, detail=f"Internal SME Routing Error: {str(e)[:200]}")


class AnalyzeRequest(BaseModel):
    expert_answer: str
    base_answer: str
    question: str
    role: str

@app.post("/api/analyze-hallucination")
async def analyze_hallucination(request: AnalyzeRequest, http_req: Request):
    try:
        system_prompt = f"""You are an AI auditor.
A user asked: "{request.question}"
An expert ({request.role}) provided an answer.
A generic base model provided another answer.

Your job is to analyze the difference. What domain-specific nuances, safety protocols, or technical depth is the base model missing? Did the base model hallucinate generic advice that violates {request.role} standards?

Provide your response in JSON format:
- "hallucination_score": Integer 0-100 (0 = identical, 100 = completely missed the expert constraints / highly generic).
- "analysis": A punchy, 2-to-3 sentence Markdown paragraph explaining the gap.
"""
        prompt = f"""
Expert Answer ({request.role}):
{request.expert_answer}

Base Model Answer:
{request.base_answer}
"""
        groq_key = http_req.headers.get("x-groq-key") or os.getenv("GROQ_API_KEY")
        local_groq = Groq(api_key=groq_key) if groq_key else client

        if not local_groq:
            raise HTTPException(status_code=401, detail="No Groq API key provided for hallucination analysis.")

        def _call_groq():
            return local_groq.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.0,
            )

        completion = await asyncio.to_thread(_call_groq)
        return json.loads(completion.choices[0].message.content)

    except HTTPException:
        raise
    except Exception as e:
        logger.error("analyze-hallucination error: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to analyze hallucination: {str(e)[:200]}")

# ---------------------------------------------------------------------------
# API-as-a-Service Endpoint
# ---------------------------------------------------------------------------
@app.post("/api/v1/chat/completions")
async def create_chat_completion(request: Request, body: ChatCompletionRequest):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer ") or auth_header.split(" ")[1] != BYTEME_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API Key")
        
    role = body.model
    profile = EXPERT_PROFILES.get(role)

    if not profile and supabase:
        try:
            res = supabase.table("custom_roles").select("*").eq("role_name", role).execute()
            if res.data and len(res.data) > 0:
                profile = res.data[0]
        except Exception as e:
            logger.error(f"Error fetching {role} from Supabase for API query: {e}")

    if profile:
        role_context = _pretty_role(role)
        rules_block = "\n".join(
            f"  Rule {i+1}: {r}" for i, r in enumerate(profile["expert_rules"])
        )
        if profile.get("knowledge_base"):
            rules_block += f"\n\nADDITIONAL STRICT KNOWLEDGE BASE RULES TO ENFORCE:\n{profile['knowledge_base']}"

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
- Be deeply technical and domain-specific. Generic answers are unacceptable.

FORMATTING REQUIREMENT: You MUST use a hard newline (return carriage) after every single Rule or Step. Do not combine them into a single paragraph. Render them as distinct bullet points or numbered lists."""

    else:
        system_prompt = "You are a helpful general-purpose AI assistant."

    messages = [{"role": "system", "content": system_prompt}] + body.messages
    
    loop = asyncio.get_event_loop()
    def _call_ai():
        return client.chat.completions.create(
            model=MODEL,
            messages=messages,
            temperature=body.temperature,
        )
        
    try:
        completion = await loop.run_in_executor(None, _call_ai)
        return completion.model_dump()
    except Exception as e:
        logger.error(f"/v1/chat/completions error: {e}")
        raise HTTPException(status_code=500, detail="Upstream Provider Error")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)