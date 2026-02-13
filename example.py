import streamlit as st
from supabase import create_client
st.logo("logo.png",size="large")
url = "SUPABASE_LINK"
key = "YOUR_KEY"

sb = create_client(url, key)

def auth_ui():
    if "u" in st.session_state and "t" in st.session_state:
        return

    st.title("Login")

    e = st.text_input("Email")
    p = st.text_input("Password", type="password")

    c1, c2 = st.columns(2)

    with c1:
        if st.button("Login"):
            if not e or not p:
                st.error("Email and password required")
            elif "@" not in e:
                st.error("Invalid email")
            else:
                try:
                    r = sb.auth.sign_in_with_password(
                        {"email": e.strip(), "password": p}
                    )
                    st.session_state.u = r.user
                    st.session_state.t = r.session.access_token
                    st.rerun()
                except Exception:
                    st.error("Invalid credentials")

    with c2:
        if st.button("Sign up"):
            if not e or not p:
                st.error("Email and password required")
            elif "@" not in e:
                st.error("Invalid email")
            else:
                try:
                    sb.auth.sign_up(
                        {"email": e.strip(), "password": p}
                    )
                    st.success("Account created. Login now.")
                except Exception:
                    st.error("Signup failed")

    st.stop()
