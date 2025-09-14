function downloadLocalStorage() {
  // Copy all localStorage entries explicitly
  const allRecords = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    allRecords[key] = localStorage.getItem(key);
  }

  // Convert to JSON with pretty formatting
  const jsonRecords = JSON.stringify(allRecords, null, 2);

  // Create a Blob from the JSON string
  const blob = new Blob([jsonRecords], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  // Create and configure a temporary download link
  const link = document.createElement('a');
  link.href = url;
  link.download = 'sciencevsmagic_local_storage.json';
  document.body.appendChild(link);

  // Trigger the download
  link.click();

  // Clean up: remove the link and revoke the object URL
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  console.log("LocalStorage exported to JSON successfully.");
}

// Attach to link once the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const dlLink = document.getElementById('downloadLink');
  if (dlLink) dlLink.addEventListener('click', downloadLocalStorage);
});