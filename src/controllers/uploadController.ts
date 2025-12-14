// 1. Create uploadController.ts
import type { Request, Response } from "express";
import multer from "multer";
import cloudinary from "../config/cloudinary.js";

const storage = multer.memoryStorage();
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

export async function uploadFile(req: Request, res: Response) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: 'maintenance_attachments', resource_type: 'auto' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(req.file!.buffer);
    });

    const uploadResult = result as any;

    return res.status(200).json({
      filepath: uploadResult.secure_url,
      publicId: uploadResult.public_id,
    });
  } catch (err: any) {
    console.error("Cloudinary upload error:", err);
    return res.status(500).json({ message: err.message || "File upload failed" });
  }
}