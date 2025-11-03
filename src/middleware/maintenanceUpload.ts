import multer from "multer";
import path from "path";
import fs from "fs";
import type { Request } from "express";

const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");

export function normalizeAttachmentFolder(input?: string | null, fallback = "maintenance") {
  const trimmed = input?.trim();
  if (!trimmed) return fallback;
  return trimmed
    .split(/[\\/]/)
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");
}

const storage = multer.diskStorage({
  destination: (req: Request, _file: Express.Multer.File, cb) => {
    const castReq = req as Request & { sanitizedAttachmentFolder?: string };
    const folder = normalizeAttachmentFolder(req.body?.attachment_folder as string | undefined);
    const dest = path.join(UPLOAD_ROOT, folder);
    fs.mkdirSync(dest, { recursive: true });
    castReq.sanitizedAttachmentFolder = folder;
    cb(null, dest);
  },
  filename: (_req: Request, file: Express.Multer.File, cb) => {
    const safeName = file.originalname.replace(/\s+/g, "_");
    cb(null, `${Date.now()}_${safeName}`);
  },
});

export const maintenanceUpload = multer({ storage });