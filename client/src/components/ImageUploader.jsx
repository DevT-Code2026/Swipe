import React, { useState, useRef } from 'react';

export default function ImageUploader({ onImagesSelected, maxImages = 100 }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [previews, setPreviews] = useState([]);
  const fileRef = useRef(null);

  const processFiles = (files) => {
    const allowedTypes = ['image/', 'video/', 'audio/', 'application/pdf'];
    const validFiles = Array.from(files).filter(
      (f) => allowedTypes.some(t => f.type.startsWith(t)) && f.size <= 50 * 1024 * 1024
    );

    if (previews.length + validFiles.length > maxImages) {
      alert(`Maximum ${maxImages} files allowed`);
      return;
    }

    const readers = validFiles.map(
      (file) =>
        new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve({
              fileName: file.name,
              data: reader.result.split(',')[1], // base64
              contentType: file.type,
              preview: file.type.startsWith('image/') ? reader.result : null,
              fileType: file.type.split('/')[0], // 'image', 'video', 'audio', 'application'
            });
          };
          reader.readAsDataURL(file);
        })
    );

    Promise.all(readers).then((results) => {
      const newPreviews = [...previews, ...results];
      setPreviews(newPreviews);
      onImagesSelected?.(newPreviews);
    });
  };

  const removeImage = (idx) => {
    const updated = previews.filter((_, i) => i !== idx);
    setPreviews(updated);
    onImagesSelected?.(updated);
  };

  return (
    <div>
      <div
        className={`drop-zone ${isDragOver ? 'drag-over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          processFiles(e.dataTransfer.files);
        }}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*,audio/*,.pdf"
          multiple
          onChange={(e) => processFiles(e.target.files)}
          style={{ display: 'none' }}
        />
        <div style={{ fontSize: 40, marginBottom: 12 }}>📁</div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
          Drop files here or tap to upload
        </div>
        <div style={{ fontSize: 13, color: 'var(--sub)' }}>
          Images, Videos, Audio, PDF • Max 50MB each • Up to {maxImages} files
        </div>
      </div>

      {previews.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--sub)' }}>
              {previews.length} FILE{previews.length !== 1 ? 'S' : ''} SELECTED
            </span>
            <button
              onClick={() => {
                setPreviews([]);
                onImagesSelected?.([]);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--dislike)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Clear All
            </button>
          </div>
          <div className="image-grid">
            {previews.map((img, i) => (
              <div key={i} className="image-thumb">
                {img.preview ? (
                  <img src={img.preview} alt={img.fileName} />
                ) : (
                  <div style={{
                    width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', background: 'var(--surface-2)',
                    gap: 6, padding: 8,
                  }}>
                    <span style={{ fontSize: 28 }}>
                      {img.fileType === 'video' ? '🎬' : img.fileType === 'audio' ? '🎵' : '📄'}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--sub)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', whiteSpace: 'nowrap' }}>
                      {img.fileName}
                    </span>
                  </div>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeImage(i);
                  }}
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.7)',
                    border: 'none',
                    color: '#fff',
                    fontSize: 14,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
