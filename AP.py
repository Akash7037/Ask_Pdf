import streamlit as st
import pypdf
from supabase import create_client
from sentence_transformers import SentenceTransformer
from scipy.spatial.distance import cosine
from example import auth_ui
from openai import OpenAI

url = "https://ucrnxzdxougyostmwwli.supabase.co"
key = "sb_publishable_uTYJVD1pFXOnArxZ7VTkFw__7IK1JQ4"

auth_ui()

u = st.session_state.u
tok = st.session_state.t

sb = create_client(
    url,
    key,
    options={
        "headers": {
            "Authorization": f"Bearer {tok}"
        }
    }
)

def ai(ctx, q, prev=None):
    old = ""
    if prev:
        for x in prev:
            old += x["answer"] + " "
        old = " ".join(old.split()[:200])

    p = f"""
Answer strictly from the context.
If not present, say "not present".

Context:
{ctx}

Previous answers:
{old}

Question:
{q}
"""

    c = OpenAI(
        base_url="https://integrate.api.nvidia.com/v1",
        api_key="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"
    )

    r = ""
    out = c.chat.completions.create(
        model="deepseek-ai/deepseek-v3.1-terminus",
        messages=[{"role": "user", "content": p}],
        temperature=0.2,
        top_p=0.7,
        max_tokens=2048,
        stream=True
    )

    for ch in out:
        if ch.choices and ch.choices[0].delta.content:
            r += ch.choices[0].delta.content

    return r

st.title("Ask Your PDF")

@st.cache_resource
def load():
    return SentenceTransformer("all-MiniLM-L6-v2")

m = load()

f = st.file_uploader("Upload PDF", type="pdf")

if f:
    r = pypdf.PdfReader(f)

    ch, pg = [], []

    for i, p in enumerate(r.pages):
        t = p.extract_text()
        if not t:
            continue
        w = t.split()
        for j in range(0, len(w) - 100, 50):
            ch.append(" ".join(w[j:j+100]))
            pg.append(i + 1)

    emb = m.encode(ch)

    q = st.text_input("Ask")

    if q:
        qe = m.encode([q])[0]
        sc = [(i, 1 - cosine(qe, e)) for i, e in enumerate(emb)]
        sc = sorted(sc, key=lambda x: x[1], reverse=True)[:3]

        ctx = ""
        for i, _ in sc:
            ctx += ch[i] + " "

        prev = sb.table("queries") \
            .select("answer") \
            .eq("user_id", u.id) \
            .order("created_at", desc=True) \
            .limit(5) \
            .execute()

        ans = ai(ctx, q, prev.data)

        sb.table("queries").insert({
            "user_id": u.id,
            "question": q,
            "answer": ans
        }).execute()

        st.subheader("Answer")
        st.write(ans)

st.sidebar.title("History")

h = sb.table("queries") \
    .select("question,answer") \
    .eq("user_id", u.id) \
    .order("created_at", desc=True) \
    .limit(10) \
    .execute()

for x in reversed(h.data):
    st.sidebar.markdown(x["question"])
    st.sidebar.write(x["answer"])
    st.sidebar.divider()