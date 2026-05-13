import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { env } from './env';

const uploadRoot = path.resolve(process.cwd(), env.uploadDir);

if (!fs.existsSync(uploadRoot)) {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, safeName);
  },
});

export const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB default per file (will be enforced per plan in future phases)
  },
});

export const uploadDirectory = uploadRoot;
