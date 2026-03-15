document.getElementById("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = document.getElementById("admin-secret").value.trim();
  const errorEl = document.getElementById("error");
  const btn = document.getElementById("submit-btn");

  if (!password) return;

  errorEl.classList.remove("visible");
  btn.disabled = true;
  btn.textContent = "Verifying...";

  try {
    const res = await fetch(`${WORKER_URL}/api/auth/verify`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${password}` },
    });

    if (!res.ok) {
      errorEl.textContent = "Invalid password";
      errorEl.classList.add("visible");
      btn.disabled = false;
      btn.textContent = "Enter";
      return;
    }

    window.location.href = "setup.html#" + encodeURIComponent(password);
  } catch {
    errorEl.textContent = "Could not reach server";
    errorEl.classList.add("visible");
    btn.disabled = false;
    btn.textContent = "Enter";
  }
});
