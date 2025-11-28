const API_URL = "http://EC2_PUBLIC_IP:3000"; // replace with your EC2 public IP

async function uploadFile() {
  const fileInput = document.getElementById("fileInput");
  if (!fileInput.files.length) {
    alert("Please choose a file.");
    return;
  }

  const file = fileInput.files[0];
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_URL}/upload`, {
    method: "POST",
    body: formData
  });

  if (!res.ok) {
    alert("Upload failed");
    return;
  }

  alert("File uploaded!");
  loadFiles();
}

async function loadFiles() {
  const res = await fetch(`${API_URL}/files`);
  const data = await res.json();

  const list = document.getElementById("fileList");
  list.innerHTML = "";

  data.files.forEach(filename => {
    const li = document.createElement("li");
    li.innerHTML = `
      ${filename}
      <button onclick="downloadFile('${filename}')">Download</button>
      <button onclick="deleteFile('${filename}')">Delete</button>
    `;
    list.appendChild(li);
  });
}

async function downloadFile(filename) {
  const res = await fetch(`${API_URL}/download/${filename}`);
  const data = await res.json();
  window.open(data.downloadUrl, "_blank");
}

async function deleteFile(filename) {
  const res = await fetch(`${API_URL}/delete/${filename}`, {
    method: "DELETE"
  });

  if (!res.ok) {
    alert("Delete failed");
    return;
  }

  alert("File deleted!");
  loadFiles();
}

// Load list on page load
loadFiles();
