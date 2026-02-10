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
def load():
    return SentenceTransformer("all-MiniLM-L6-v2")
em= load()
file = st.file_uploader("Upload a PDF file", type="pdf")
pr ="Processing the document and creating embeddings..."
bar = st.progress(0, text=pr)
if file:
    reader = pypdf.PdfReader(file)

    all_chunks = []
    metadata = []
    n = 0
    CHUNK_SIZE = 100
    OVERLAP = 50
    for idx, page in enumerate(reader.pages):
        text = page.extract_text()
        if not text:
            continue

        words = text.split()

        for i in range(0, len(words) - CHUNK_SIZE + 1, CHUNK_SIZE - OVERLAP):
            chunk = " ".join(words[i:i + CHUNK_SIZE])
            all_chunks.append(chunk)
            metadata.append({"page": idx + 1})
        n += 1
        bar.progress(n / len(reader.pages), text=pr)

    st.success(f"Total chunks indexed: {len(all_chunks)}")
    bar.empty()
    chunk_embeddings = em.encode(all_chunks)
    query = st.text_input("Ask a question from the document")

    if query:
        query_embedding = em.encode([query])[0]

        sc= []
        for i, emb in enumerate(chunk_embeddings):
            sc= 1 - cosine(query_embedding, emb)
            sc.append((i, score))

        sc.sort(key=lambda x: x[1], reverse=True)
        t = sc[:5]

        st.subheader("🔍 Retrieved Context")
        context = ""

        for idx, score in t:
            page_no = metadata[idx]["page"]
            st.markdown(f"**Page {page_no} | score={score:.3f}**")
            st.write(all_chunks[idx])
            st.divider()
            context += all_chunks[idx] + " "
        answer = ai(context, query)
        st.subheader("💡 Answer")
        st.write(answer)
