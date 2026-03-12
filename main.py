import os
import uuid
import pypdf
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from scipy.spatial.distance import cosine
from supabase import create_client, Client
from openai import OpenAI
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from dotenv import load_dotenv

load_dotenv()

# -------------------------
# FastAPI Setup
# -------------------------

app = FastAPI(title="Ask PDF API")

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # change later to your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------
# Environment Variables
# -------------------------

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "")

# -------------------------
# Supabase
# -------------------------

supabase: Client | None = None

if SUPABASE_URL and SUPABASE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# -------------------------
# Model (loaded at startup)
# -------------------------

model = None

@app.on_event("startup")
async def load_model():
    global model
    try:
        print("Loading embedding model...")
        model = SentenceTransformer("all-MiniLM-L6-v2")
        print("Model loaded successfully")
    except Exception as e:
        print("Model failed to load:", e)

# -------------------------
# In-memory cache
# -------------------------

document_cache = {}

# -------------------------
# Schemas
# -------------------------

class ChatHistoryItem(BaseModel):
    question: str
    answer: str

class QueryRequest(BaseModel):
    doc_id: str
    question: str
    user_id: str
    chat_history: list[ChatHistoryItem] = []

# -------------------------
# Routes
# -------------------------

@app.get("/")
def home():
    return {"status": "Backend running"}

# -------------------------
# Upload PDF
# -------------------------

@app.post("/api/upload")
@limiter.limit("5/minute")
async def upload_pdf(request: Request, file: UploadFile = File(...)):

    if not model:
        raise HTTPException(status_code=500, detail="Model not ready")

    try:
        pdf = pypdf.PdfReader(file.file)

        all_text = ""

        for page in pdf.pages:
            text = page.extract_text()
            if text:
                all_text += text + " "

        words = all_text.split()

        chunks = []

        for i in range(0, len(words), 50):
            chunk = words[i:i+100]
            if not chunk:
                break
            chunks.append(" ".join(chunk))

        if not chunks:
            raise HTTPException(status_code=400, detail="No readable text")

        embeddings = model.encode(chunks)

        doc_id = str(uuid.uuid4())

        document_cache[doc_id] = {
            "chunks": chunks,
            "embeddings": embeddings
        }

        return {
            "doc_id": doc_id,
            "chunks": len(chunks)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# -------------------------
# Ask Question
# -------------------------

@app.post("/api/ask")
@limiter.limit("10/minute")
async def ask(request: Request, body: QueryRequest):

    if body.doc_id not in document_cache:
        raise HTTPException(status_code=404, detail="Document expired")

    if not NVIDIA_API_KEY:
        raise HTTPException(status_code=500, detail="API key missing")

    data = document_cache[body.doc_id]

    chunks = data["chunks"]
    embeddings = data["embeddings"]

    question_embedding = model.encode([body.question])[0]

    similarities = [
        (i, 1 - cosine(question_embedding, emb))
        for i, emb in enumerate(embeddings)
    ]

    top_chunks = sorted(similarities, key=lambda x: x[1], reverse=True)[:3]

    context = ""

    for idx, _ in top_chunks:
        context += chunks[idx] + "\n"

    history = ""

    for item in body.chat_history[-10:]:
        history += f"User: {item.question}\nAssistant: {item.answer}\n"

    prompt = f"""
Answer based on the document.

Context:
{context}

Conversation:
{history}

Question:
{body.question}
"""

    client = OpenAI(
        base_url="https://integrate.api.nvidia.com/v1",
        api_key=NVIDIA_API_KEY
    )

    response = client.chat.completions.create(
        model="deepseek-ai/deepseek-v3.1-terminus",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=2048
    )

    answer = response.choices[0].message.content

    if supabase:
        try:
            supabase.table("queries").insert({
                "user_id": body.user_id,
                "question": body.question,
                "answer": answer
            }).execute()
        except:
            pass

    return {"answer": answer}

# -------------------------
# History
# -------------------------

@app.get("/api/history/{user_id}")
async def history(user_id: str):

    if not supabase:
        raise HTTPException(status_code=500, detail="DB not configured")

    data = supabase.table("queries")\
        .select("*")\
        .eq("user_id", user_id)\
        .order("created_at", desc=True)\
        .limit(10)\
        .execute()

    return {"history": data.data}

# -------------------------
# Local run
# -------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000)
