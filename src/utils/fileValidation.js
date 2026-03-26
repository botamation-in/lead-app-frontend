/**
 * Secure file validation utilities.
 *
 * Layered defence against malicious file uploads:
 *  1. Extension allowlist  — rejects any extension not in the safe list
 *  2. File size cap        — rejects files that exceed the configured maximum
 *  3. Magic byte check     — reads the actual file bytes and compares them
 *                            against known JPEG / PNG signatures so that a
 *                            renamed executable (e.g. malware.exe → photo.jpg)
 *                            is rejected even if the extension and MIME type
 *                            look correct.
 */

// ── Allowlists ────────────────────────────────────────────────────────────────

/** Only these lowercase extensions are considered safe image uploads. */
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);

/** Only these MIME types are accepted (belt-and-suspenders alongside magic bytes). */
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png']);

// ── Known executable / dangerous extensions (explicit blocklist as extra layer) ─
const BLOCKED_EXTENSIONS = new Set([
    '.exe', '.dll', '.bat', '.cmd', '.com', '.msi', '.msp', '.msc',
    '.sh', '.bash', '.zsh', '.fish',
    '.ps1', '.psm1', '.psd1', '.ps1xml',
    '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh',
    '.hta', '.cpl', '.scr', '.pif', '.reg',
    '.py', '.pyc', '.pyo', '.rb', '.pl', '.php',
    '.jar', '.war', '.ear', '.class',
    '.bin', '.run', '.elf', '.out',
    '.dmg', '.pkg', '.deb', '.rpm', '.apk',
]);

// ── Magic byte signatures ─────────────────────────────────────────────────────

/**
 * Each entry describes one file format:
 *   mimeType  – the MIME type this signature corresponds to
 *   offset    – byte offset at which the signature starts (usually 0)
 *   bytes     – expected byte values as an array of numbers
 */
const MAGIC_SIGNATURES = [
    // JPEG: starts with FF D8 FF
    { mimeType: 'image/jpeg', offset: 0, bytes: [0xff, 0xd8, 0xff] },
    // PNG:  starts with 89 50 4E 47 0D 0A 1A 0A
    { mimeType: 'image/png', offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Read the first `numBytes` bytes of a File/Blob.
 * @param {File} file
 * @param {number} numBytes
 * @returns {Promise<Uint8Array>}
 */
function readFirstBytes(file, numBytes) {
    return new Promise((resolve, reject) => {
        const slice = file.slice(0, numBytes);
        const reader = new FileReader();
        reader.onload = (e) => resolve(new Uint8Array(e.target.result));
        reader.onerror = () => reject(new Error('Could not read file.'));
        reader.readAsArrayBuffer(slice);
    });
}

/**
 * Test whether `buffer` matches a magic signature starting at the given offset.
 */
function matchesSignature(buffer, signature) {
    const { offset, bytes } = signature;
    if (buffer.length < offset + bytes.length) return false;
    return bytes.every((b, i) => buffer[offset + i] === b);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Validates an uploaded file against extension, size, MIME type, and magic
 * bytes.  Throws a user-friendly Error describing the first violation found.
 *
 * @param {File}   file           - The File object from an <input type="file">
 * @param {number} [maxSizeMB=10] - Maximum allowed file size in megabytes
 * @throws {Error} with a human-readable message when validation fails
 */
export async function validateImageFile(file, maxSizeMB = 10) {
    // ── 1. Extension check ────────────────────────────────────────────────────
    const dotIndex = file.name.lastIndexOf('.');
    const ext = dotIndex !== -1 ? file.name.slice(dotIndex).toLowerCase() : '';

    if (BLOCKED_EXTENSIONS.has(ext)) {
        throw new Error(`File type "${ext}" is not allowed.`);
    }
    if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
        throw new Error('Only .jpg, .jpeg, and .png image files are allowed.');
    }

    // ── 2. MIME type check (belt-and-suspenders) ──────────────────────────────
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
        throw new Error('Only JPEG and PNG images are allowed.');
    }

    // ── 3. File size check ────────────────────────────────────────────────────
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
        throw new Error(`File is too large. Maximum allowed size is ${maxSizeMB} MB.`);
    }

    // ── 4. File size sanity (not empty) ──────────────────────────────────────
    if (file.size === 0) {
        throw new Error('The selected file is empty.');
    }

    // ── 5. Magic byte check ───────────────────────────────────────────────────
    // Determine the longest signature so we read exactly enough bytes.
    const maxSigLength = Math.max(...MAGIC_SIGNATURES.map((s) => s.offset + s.bytes.length));
    const header = await readFirstBytes(file, maxSigLength);

    const matchedSignature = MAGIC_SIGNATURES.find((sig) => matchesSignature(header, sig));
    if (!matchedSignature) {
        throw new Error(
            'File content does not match a valid JPEG or PNG image. Upload rejected.'
        );
    }

    // ── 6. Cross-check: declared MIME type must match actual magic bytes ──────
    if (matchedSignature.mimeType !== file.type) {
        throw new Error(
            'File content does not match its declared type. Upload rejected.'
        );
    }
}
