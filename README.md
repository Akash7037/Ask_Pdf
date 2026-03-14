
# 📄 Ask PDF - Intelligent PDF Chat Assistant

[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-05998b.svg)](https://fastapi.tiangolo.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Deploy to Render](https://img.shields.io/badge/Deploy%20to-Render-46E3B7?style=flat\&logo=render\&logoColor=white)](https://render.com)

**Ask PDF** is a high-performance, AI-driven backend that allows users to chat with their PDF documents. Using **Retrieval-Augmented Generation (RAG)**, the system extracts text from PDFs, generates semantic embeddings, and provides context-aware answers to user questions using state-of-the-art language models.

---

# ✨ Features

* 📂 **PDF Processing** – Extract text and metadata from PDF files using `pypdf`.
* 🧠 **Semantic Search** – Powered by `SentenceTransformers` (`all-MiniLM-L6-v2`) for fast and accurate context retrieval.
* ⚡ **Lazy Loading** – Optimized for cloud deployment (Render / Heroku / Vercel) to reduce cold start time.
* 💬 **Contextual AI** – Integrated with **NVIDIA DeepSeek** for high-quality, document-grounded responses.
* 🕒 **Chat History** – Persistent conversation tracking integrated with **Supabase**.
* 🛡️ **Rate Limiting** – Built-in protection using `slowapi` to ensure API stability.

---

# 🚀 Live Demo

**Frontend**
[https://ask-pdf-gray.vercel.app](https://ask-pdf-gray.vercel.app)



---

# 🛠️ Tech Stack

* **Framework**: FastAPI
* **Embeddings**: Sentence-Transformers (CPU optimized)
* **LLM API**: NVIDIA Integrated (DeepSeek-v3)
* **Database**: Supabase (PostgreSQL)
* **PDF Engine**: PyPDF
* **Security**: Slowapi (Rate Limiting) & CORS

---

# 🔧 Installation & Setup

## 1. Prerequisites

* Python **3.10 or higher**
* A **Supabase account** (for chat history storage)
* An **NVIDIA API key**

---

## 2. Clone the Repository

```bash
git clone https://github.com/your-username/Ask_Pdf.git
cd Ask_Pdf
```

---

## 3. Setup Virtual Environment

```bash
python -m venv venv

# Windows
.\venv\Scripts\activate

# Linux / macOS
source venv/bin/activate

pip install -r requirements.txt
```

---

## 4. Configuration

Create a `.env` file in the root directory:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
NVIDIA_API_KEY=your_nvidia_api_key
```

---

## 5. Run Locally

```bash
python -m uvicorn main:app --reload
```

The API will be available at:

```
http://localhost:8000
```

API documentation:

```
http://localhost:8000/docs
```

---
# ☁️ Deployment Guides

## Deploy Frontend to Vercel

1. Push your code to a GitHub repository.
2. Go to **Vercel** → **Add New** → **Project**.
3. Import your repository.
4. Set **Root Directory** to `frontend`.
5. Add Environment Variables:

```
NEXT_PUBLIC_API_URL=https://your-render-backend-url
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

6. Click **Deploy**.

---

## Deploy Backend to Render

1. Create a **Web Service** on Render.
2. **Build Command**

```
pip install -r requirements.txt
```

3. **Start Command**

```
uvicorn main:app --host 0.0.0.0 --port $PORT
```

4. Add Environment Variables:

```
SUPABASE_URL
SUPABASE_KEY
NVIDIA_API_KEY
```

---

# 📄 License

Distributed under the **MIT License**.
See `LICENSE` for more information.

---

❤️ **Made for the AI Community**

---

✅ Small advice (GitHub trick):
If you want your repo to look **more professional and get more stars**, add:

* **Architecture Diagram**
* **Example request/response**
* **Screenshots of the chat**

If you want, I can also help you turn this into a **🔥 top-tier GitHub README (like 10k-star projects)**.
