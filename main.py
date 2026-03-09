import os
import uuid
import pypdf
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, Depends
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

# Initialize Rate Limiter using IP address
limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="Ask PDF API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For production, change to the frontend URL (e.g. Netlify/Vercel URL)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "")

if SUPABASE_URL and SUPABASE_KEY:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
else:
    supabase = None

try:
    model = SentenceTransformer("all-MiniLM-L6-v2")
except Exception as e:
    print(f"Failed to load sentence transformer: {e}")
    model = None

# In-memory document cache (For a more scalable architecture, store embeddings in a vector DB like Supabase pgvector)
# Structure: { "doc_id": { "chunks": [...], "embeddings": [...] } }
document_cache = {}

class QueryRequest(BaseModel):
    doc_id: str
    question: str
    user_id: str # Obtained from the frontend after Supabase Auth

@app.get("/")
def read_root():
    return {"status": "Backend is running correctly"}

@app.post("/api/upload")
@limiter.limit("5/minute")
async def upload_pdf(request: Request, file: UploadFile = File(...)):
    """Upload a PDF, extract text chunks, and generate embeddings."""
    if not model:
        raise HTTPException(status_code=500, detail="Model not loaded")
    
    try:
        pdf = pypdf.PdfReader(file.file)
        chunks = []
        for p in pdf.pages:
            t = p.extract_text()
            if not t:
                continue
            w = t.split()
            # Split into chunks of 100 words with 50 words overlap
            for j in range(0, len(w) - 100, 50):
                chunks.append(" ".join(w[j:j+100]))
        
        # Handle the remaining words if fewer than 100
        if len(w) < 100 and len(w) > 0:
            chunks.append(" ".join(w))

        if not chunks:
            raise HTTPException(status_code=400, detail="No readable text found in PDF")

        embeddings = model.encode(chunks)
        
        doc_id = str(uuid.uuid4())
        document_cache[doc_id] = {
            "chunks": chunks,
            "embeddings": embeddings
        }
        
        return {"doc_id": doc_id, "message": "PDF processed successfully", "chunks_count": len(chunks)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF processing failed: {str(e)}")

@app.post("/api/ask")
@limiter.limit("10/minute")
async def ask_question(request: Request, body: QueryRequest):
    """Ask a question based on a previously uploaded PDF."""
    if body.doc_id not in document_cache:
        raise HTTPException(status_code=404, detail="Document not found or expired. Please upload again.")
    if not NVIDIA_API_KEY:
        raise HTTPException(status_code=500, detail="LLM API key is missing")

    doc_data = document_cache[body.doc_id]
    chunks = doc_data["chunks"]
    embeddings = doc_data["embeddings"]

    # Generate embedding for the question
    qe = model.encode([body.question])[0]
    
    # Calculate cosine similarity
    similarities = [(i, 1 - cosine(qe, e)) for i, e in enumerate(embeddings)]
    top_similar = sorted(similarities, key=lambda x: x[1], reverse=True)[:3]
    
    context = ""
    for i, _ in top_similar:
        context += chunks[i] + " \n"

    # Fetch previous answers for context (if Supabase is set up)
    answer_text = ""
    if supabase:
        try:
            # We fetch recent questions and answers from this user for limited context
            history = supabase.table("queries").select("answer").eq("user_id", body.user_id).order("created_at", desc=True).limit(5).execute()
            if history.data:
                for item in history.data:
                    answer_text += item.get("answer", "") + " "
                words = answer_text.split()
                answer_text = " ".join(words[:200]) # Keep context short
        except Exception as e:
            print(f"Could not fetch history: {e}")

    prompt = f"""
Answer the question strictly based on the context below.
Context:
{context}

Question:
{body.question}

Previous conversation context:
{answer_text}
"""

    client = OpenAI(
        base_url="https://integrate.api.nvidia.com/v1",
        api_key=NVIDIA_API_KEY
    )

    try:
        completion = client.chat.completions.create(
            model="deepseek-ai/deepseek-v3.1-terminus",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            top_p=0.7,
            max_tokens=2048,
        )
        answer = completion.choices[0].message.content
        
        # Save to Supabase (if configured)
        if supabase:
            try:
                supabase.table("queries").insert({
                    "user_id": body.user_id,
                    "question": body.question,
                    "answer": answer
                }).execute()
            except Exception as store_e:
                print(f"Could not store query: {store_e}")
                
        return {"answer": answer, "context_used": context}

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/history/{user_id}")
@limiter.limit("20/minute")
async def get_history(request: Request, user_id: str):
    """Fetch history of Q&A from Supabase"""
    if not supabase:
        raise HTTPException(status_code=500, detail="Database not configured")
        
    try:
        history = supabase.table("queries").select("*").eq("user_id", user_id).order("created_at", desc=True).limit(10).execute()
        return {"history": history.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch history: {str(e)}")

# Add a run block for local testing
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
