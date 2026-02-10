import streamlit as st
import pypdf
from sentence_transformers import SentenceTransformer
from scipy.spatial.distance import cosine
from openai import OpenAI

def ai(context, question):
    res = ""
    prompt = f"""
Answer the question strictly based on the context below.
If the answer is not present, say "not present".

Context:
{context}

Question:
{question}
"""

    client = OpenAI(
        base_url="https://integrate.api.nvidia.com/v1",
        api_key="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"
    )

    completion = client.chat.completions.create(
        model="deepseek-ai/deepseek-v3.1-terminus",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        top_p=0.7,
        max_tokens=2048,
        stream=True
    )

    for chunk in completion:
        if chunk.choices and chunk.choices[0].delta.content:
            res += chunk.choices[0].delta.content

    return res
st.set_page_config(page_title="Ask Your PDF", layout="wide")
st.title("📘 Ask Your PDF")
@st.cache_resource
def load_model():
    return SentenceTransformer("all-MiniLM-L6-v2")
embed_model = load_model()
uploaded_file = st.file_uploader("Upload a PDF file", type="pdf")
if uploaded_file:
    reader = pypdf.PdfReader(uploaded_file)

    all_chunks = []
    metadata = []

    CHUNK_SIZE = 100
    OVERLAP = 50
    for page_idx, page in enumerate(reader.pages):
        text = page.extract_text()
        if not text:
            continue

        words = text.split()

        for i in range(0, len(words) - CHUNK_SIZE + 1, CHUNK_SIZE - OVERLAP):
            chunk = " ".join(words[i:i + CHUNK_SIZE])
            all_chunks.append(chunk)
            metadata.append({"page": page_idx + 1})

    st.success(f"Total chunks indexed: {len(all_chunks)}")

    chunk_embeddings = embed_model.encode(all_chunks)
    query = st.text_input("Ask a question from the document")

    if query:
        query_embedding = embed_model.encode([query])[0]

        scores = []
        for i, emb in enumerate(chunk_embeddings):
            score = 1 - cosine(query_embedding, emb)
            scores.append((i, score))

        scores.sort(key=lambda x: x[1], reverse=True)
        top_k = scores[:5]

        st.subheader("🔍 Retrieved Context")
        context = ""

        for idx, score in top_k:
            page_no = metadata[idx]["page"]
            st.markdown(f"**Page {page_no} | score={score:.3f}**")
            st.write(all_chunks[idx])
            st.divider()
            context += all_chunks[idx] + " "
        answer = ai(context, query)
        st.subheader("💡 Answer")
        st.write(answer)
