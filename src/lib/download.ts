'use client';

export function downloadFile(
  content: string,
  fileName: string,
  mimeType: string
) {
  // Create a blob from the content
  const blob = new Blob([content], { type: mimeType });

  // Create a URL for the blob
  const url = URL.createObjectURL(blob);

  // Create a temporary anchor element and trigger the download
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();

  // Clean up by removing the temporary anchor and revoking the URL
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
