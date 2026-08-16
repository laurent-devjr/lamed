/**
 * Extract the first well-formed JSON object or array from a string.
 *
 * Uses depth scanning (not indexOf/lastIndexOf) so any text that follows
 * the closing bracket — including extra braces or commentary — is ignored.
 * Handles JSON strings correctly: curly/square brackets and backslash
 * escapes inside double-quoted strings are transparent to the depth counter.
 *
 * Returns the extracted substring, or null if no complete JSON is found.
 */
export function extractJSON(text) {
  const startBrace   = text.indexOf('{');
  const startBracket = text.indexOf('[');

  let startIdx;
  if (startBrace === -1 && startBracket === -1) return null;
  if (startBrace   === -1) startIdx = startBracket;
  else if (startBracket === -1) startIdx = startBrace;
  else startIdx = Math.min(startBrace, startBracket);

  let depth    = 0;
  let inString = false;
  let escaped  = false;

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];

    if (escaped)               { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true;  continue; }
    if (ch === '"')              { inString = !inString; continue; }
    if (inString)                { continue; }

    if (ch === '{' || ch === '[') { depth++; }
    else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) return text.slice(startIdx, i + 1);
    }
  }
  return null; // JSON not properly closed
}
