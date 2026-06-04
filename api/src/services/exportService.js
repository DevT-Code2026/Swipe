const XLSX = require('xlsx');

/**
 * Generate XLSX export for a session's results
 * @param {Object} session - Session metadata
 * @param {Array} images - Session images
 * @param {Array} submissions - Reviewer submissions
 * @returns {Buffer} XLSX file as buffer
 */
function generateExport(session, images, submissions, format = 'xlsx') {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Per-Image Summary ──
  const imageMap = {};
  images.forEach((img) => {
    imageMap[img.id] = {
      imageName: img.fileName,
      imageId: img.id,
      totalLikes: 0,
      totalDislikes: 0,
      netScore: 0,
      annotations: [],
    };
  });

  submissions.forEach((sub) => {
    (sub.decisions || []).forEach((dec) => {
      if (imageMap[dec.imageId]) {
        if (dec.liked) {
          imageMap[dec.imageId].totalLikes++;
        } else {
          imageMap[dec.imageId].totalDislikes++;
        }
      }
    });
    (sub.annotations || []).forEach((ann) => {
      if (imageMap[ann.imageId]) {
        imageMap[ann.imageId].annotations.push({
          reviewer: sub.reviewerName,
          ...ann,
        });
      }
    });
  });

  const summaryRows = Object.values(imageMap).map((img) => ({
    'Image Name': img.imageName,
    'Image ID': img.imageId,
    'Total Likes': img.totalLikes,
    'Total Dislikes': img.totalDislikes,
    'Net Score': img.totalLikes - img.totalDislikes,
    'Annotations Count': img.annotations.length,
  }));

  const ws1 = XLSX.utils.json_to_sheet(summaryRows);
  ws1['!cols'] = [
    { wch: 30 }, { wch: 36 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Image Summary');

  // ── Sheet 2: Per-Reviewer Breakdown ──
  const reviewerRows = [];
  submissions.forEach((sub) => {
    const likes = (sub.decisions || []).filter((d) => d.liked).length;
    const dislikes = (sub.decisions || []).filter((d) => !d.liked).length;

    (sub.decisions || []).forEach((dec) => {
      const img = images.find((i) => i.id === dec.imageId);
      reviewerRows.push({
        'Reviewer': sub.reviewerName,
        'Image Name': img?.fileName || dec.imageId,
        'Decision': dec.liked ? '✅ Liked' : '❌ Disliked',
        'Submitted At': new Date(sub.submittedAt).toLocaleString(),
      });
    });
  });

  const ws2 = XLSX.utils.json_to_sheet(reviewerRows);
  ws2['!cols'] = [{ wch: 20 }, { wch: 30 }, { wch: 12 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Reviewer Breakdown');

  // ── Sheet 3: All Annotations ──
  const annotationRows = [];
  submissions.forEach((sub) => {
    (sub.annotations || []).forEach((ann) => {
      const img = images.find((i) => i.id === ann.imageId);
      annotationRows.push({
        'Reviewer': sub.reviewerName,
        'Image Name': img?.fileName || ann.imageId,
        'X Position (%)': ann.x,
        'Y Position (%)': ann.y,
        'Comment': ann.comment,
        'Timestamp': new Date(sub.submittedAt).toLocaleString(),
      });
    });
  });

  if (annotationRows.length > 0) {
    const ws3 = XLSX.utils.json_to_sheet(annotationRows);
    ws3['!cols'] = [
      { wch: 20 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 50 }, { wch: 22 },
    ];
    XLSX.utils.book_append_sheet(wb, ws3, 'Annotations');
  }

  // ── Sheet 4: Session Info ──
  const infoRows = [
    { Field: 'Session Title', Value: session.title },
    { Field: 'Session ID', Value: session.id },
    { Field: 'Status', Value: session.status },
    { Field: 'Created', Value: new Date(session.createdAt).toLocaleString() },
    { Field: 'Total Images', Value: images.length },
    { Field: 'Total Reviewers', Value: submissions.length },
    { Field: 'Total Likes', Value: summaryRows.reduce((s, r) => s + r['Total Likes'], 0) },
    { Field: 'Total Dislikes', Value: summaryRows.reduce((s, r) => s + r['Total Dislikes'], 0) },
    { Field: 'Total Annotations', Value: annotationRows.length },
  ];

  const ws4 = XLSX.utils.json_to_sheet(infoRows);
  ws4['!cols'] = [{ wch: 18 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, ws4, 'Session Info');

  // Generate buffer
  const buf = XLSX.write(wb, { bookType: format === 'csv' ? 'csv' : 'xlsx', type: 'buffer' });
  return buf;
}

module.exports = { generateExport };
