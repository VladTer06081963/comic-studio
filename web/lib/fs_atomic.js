import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { conflict } from './errors.js';

export function atomicWriteJson(filePath, data, { overwrite = true, idGenerator = randomUUID } = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!overwrite && fs.existsSync(filePath)) throw conflict('DESTINATION_EXISTS', 'Destination already exists');
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${idGenerator()}.tmp`);
  let fd;
  try {
    fd = fs.openSync(tempPath, 'wx', 0o600);
    fs.writeFileSync(fd, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    if (!overwrite && fs.existsSync(filePath)) throw conflict('DESTINATION_EXISTS', 'Destination already exists');
    fs.renameSync(tempPath, filePath);
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch {}
    }
    try { fs.unlinkSync(tempPath); } catch {}
  }
  return filePath;
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
