document.getElementById("race-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const id = document.getElementById("race-id").value.trim();
  const errorEl = document.getElementById("error");

  if (!id) {
    errorEl.classList.add("visible");
    return;
  }

  errorEl.classList.remove("visible");
  window.location.href = `tracker.html?id=${encodeURIComponent(id)}`;
});

document.getElementById("race-id").addEventListener("input", () => {
  document.getElementById("error").classList.remove("visible");
});
