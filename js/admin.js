document.getElementById("auth-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const password = document.getElementById("admin-secret").value.trim();
  if (!password) return;
  window.location.href = "setup.html#" + encodeURIComponent(password);
});
