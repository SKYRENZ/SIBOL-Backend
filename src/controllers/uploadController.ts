// 1. Create uploadController.ts
import type { Request, Response } from "express";
import multer from "multer";
import cloudinary from "../config/cloudinary.js";

const storage = multer.memoryStorage();

// existing generic upload (maintenance_attachments, allows docs)
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx/;
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype) {
      return cb(null, true);
    } else {
      cb(new Error("Invalid file type"));
    }
  },
});

export const uploadMiddleware = upload.single("file");

// ✅ NEW: signup attachment middleware (REQUIRED image-only)
const signupUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB (adjust)
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(jpeg|jpg|png|gif|webp)$/i.test(file.mimetype);
    if (ok) return cb(null, true);
    return cb(new Error("Invalid file type (signup attachment must be an image)"));
  },
});

// field name for signup: "attachment"
export const signupAttachmentMiddleware = signupUpload.single("attachment");

export async function uploadFile(req: Request, res: Response) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const base64Data = req.file.buffer.toString('base64');
    const dataURI = `data:${req.file.mimetype};base64,${base64Data}`;

    const result = await cloudinary.uploader.upload(dataURI, {
      folder: 'maintenance_attachments',
      resource_type: 'auto',
    });

    return res.status(200).json({
      filepath: result.secure_url,
      publicId: result.public_id,
    });
  } catch (err: any) {
    console.error("Upload error:", err.message);
    return res.status(500).json({
      message: err.message || "File upload failed",
      error: err.name || "UploadError",
    });
  }
}