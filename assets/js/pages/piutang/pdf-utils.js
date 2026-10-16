// Pure PDF payload and byte helpers. Endpoint calls and browser/UI effects stay in piutang.js.

export function extractPdfPayload(data) {
  const source = data?.data && typeof data.data === "object" ? data.data : data;
  const base64 = source?.pdf_base64 || "";
  const filename = source?.filename || "dokumen.pdf";
  const rawSize = source?.size_bytes ?? source?.size ?? source?.pdf_size ?? null;
  const expectedSize = Number(rawSize);
  console.info("[PDF] payload received", {
    filename,
    base64Length: base64.length,
    expectedSize: Number.isFinite(expectedSize) && expectedSize > 0 ? expectedSize : null
  });
  return {
    base64,
    filename,
    expectedSize: Number.isFinite(expectedSize) && expectedSize > 0 ? expectedSize : null
  };
}

export function base64ToBytes(base64) {
  const clean = String(base64)
    .replace(/^data:.*?;base64,/, "")
    .replace(/\s+/g, "");

  if (!clean) {
    throw new Error("pdf_base64 kosong.");
  }

  let binary;
  try {
    binary = atob(clean);
  } catch (error) {
    throw new Error("pdf_base64 tidak dapat didekode: " + (error.message || "base64 invalid"));
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function base64ToBlob(base64, mime) {
  return new Blob([base64ToBytes(base64)], { type: mime });
}

function containsAscii(bytes, text) {
  const target = new TextEncoder().encode(text);
  if (!target.length || target.length > bytes.length) return false;

  outer:
  for (let i = 0; i <= bytes.length - target.length; i++) {
    for (let j = 0; j < target.length; j++) {
      if (bytes[i + j] !== target[j]) continue outer;
    }
    return true;
  }
  return false;
}

export function validatePdfBytes(bytes) {
  const header = bytes.length >= 5 &&
    bytes[0] === 0x25 && bytes[1] === 0x50 &&
    bytes[2] === 0x44 && bytes[3] === 0x46 &&
    bytes[4] === 0x2D;

  const tailStart = Math.max(0, bytes.length - 4096);
  const tail = bytes.subarray(tailStart);

  return {
    header,
    startxref: containsAscii(tail, "startxref"),
    eof: containsAscii(tail, "%%EOF")
  };
}

