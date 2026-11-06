// Shrinks big images before upload. Keeps PNG transparency; skips SVGs and small files.
export const compressImage = (file, maxDim = 1600) => new Promise((resolve) => {
  if (file.type === 'image/svg+xml' || file.size < 200 * 1024) return resolve(file);

  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);

    const type = 'image/webp';
    canvas.toBlob(
      (blob) => resolve(blob && blob.size < file.size ? blob : file), // never return a bigger file
      type,
      0.85
    );
  };
  img.onerror = () => { URL.revokeObjectURL(url); resolve(file); }; // can't decode: send as is
  img.src = url;
});