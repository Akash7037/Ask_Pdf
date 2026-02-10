import streamlit as st
import pypdf
from supabase import create_client, ClientOptions
from sentence_transformers import SentenceTransformer
from scipy.spatial.distance import cosine
from example import auth_ui
from openai import OpenAI

url = "https://ucrnxzdxougyostmwwli.supabase.co"
key = "sb_publishable_uTYJVD1pFXOnArxZ7VTkFw__7IK1JQ4"

auth_ui()
def ai(context, question, question_list=None, answer_list=None):
    res = ""
    # Format answer_list to limit to less than 200 words
    answer_text = ""
    if answer_list:
        for item in answer_list:
            answer_text += item.get("answer", "") + " "
        words = answer_text.split()
        answer_text = " ".join(words[:200])
    
    prompt = f"""
Answer the question strictly based on the context below.
Context:
{context}
Question:
{question}
previous answers:
{answer_text}
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
    bar = st.progress(0, text="Generating answer...")
    total_chunks = 0
    for chunk in completion:
        if chunk.choices and chunk.choices[0].delta.content:
            res += chunk.choices[0].delta.content
            total_chunks += 1
            bar.progress(total_chunks / 100, text="Generating answer...")
    bar.empty()
    return res
u = st.session_state.u
t = st.session_state.t

sb = create_client(
    url,
    key,
    options=ClientOptions(
        headers={"Authorization": f"Bearer {t}"}
    )
)

st.title("Ask Your PDF")

@st.cache_resource
def load():
    return SentenceTransformer("all-MiniLM-L6-v2")

m = load()

f = st.file_uploader("Upload PDF", type="pdf")

if f:
    r = pypdf.PdfReader(f)

    ch, meta = [], []
    now = st.progress(0, text="Processing PDF...")
    n=0
    for i, p in enumerate(r.pages):
        t = p.extract_text()
        if not t:
            continue
        w = t.split()
        for j in range(0, len(w) - 100, 50):
            ch.append(" ".join(w[j:j+100]))
            now.progress((i + 1) / len(r.pages), text="Processing PDF...")
            meta.append(i + 1)

    emb = m.encode(ch)
    now.progress(1.0, text="Processing PDF... Done!")
    st.success("PDF processed successfully!")
    now.empty()
    q = st.text_input("Ask")

    if q:
        qe = m.encode([q])[0]

        s = [(i, 1 - cosine(qe, e)) for i, e in enumerate(emb)]
        s = sorted(s, key=lambda x: x[1], reverse=True)[:3]

        ctx = ""
        for i, _ in s:
            ctx += ch[i] + " "

        qu=sb.table("queries").select("question").execute()
        an=sb.table("queries").select("answer").execute()
        ans = ai(ctx, q,question_list=qu.data,answer_list=an.data)

        sb.table("queries").insert({
            "user_id": u.id,
            "question": q,
            "answer": ans
        }).execute()

        st.subheader("Answer")
        st.write(ans)

st.sidebar.title("History")

h = sb.table("queries") \
    .select("*") \
    .eq("user_id", u.id) \
    .order("created_at", desc=True) \
    .limit(10) \
    .execute()

for x in reversed(h.data):
    st.sidebar.markdown(x["question"])
    st.sidebar.write(x["answer"])
    st.sidebar.divider()
